import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { createDevelopmentIdentityProvider, createOpaqueSessionId } from "@shelfops/application/identity/session";
import { TriageForbiddenError, TriageIdempotencyConflictError, TriageInvalidTransitionError, TriageNotFoundError, TriageStaleVersionError, TriageValidationError } from "@shelfops/application/triage/authority";
import { AuthenticationRequiredErrorSchema, ForbiddenErrorSchema, NotFoundErrorSchema, TemporaryUnavailableErrorSchema, TriageMutation409ErrorSchema, ValidationErrorSchema } from "@shelfops/contracts/errors";
import { TriageDecisionBodySchema, TriageDecisionResponseSchema } from "@shelfops/contracts/triage";
import type { PostgresAuthorizedIncidentRepository, IncidentTriageRead } from "@shelfops/infrastructure/repositories/authorized-incident-repository";
import type { PostgresTriageAuthorityExecutor, TriageDecisionInput, TriageDecisionOutcome, TriageDecisionReceipt } from "@shelfops/infrastructure/triage/postgres-triage-authority-executor";

import { registerApiFoundation } from "../src/openapi.js";
import { registerIncidentTriageDecisionRoute } from "../src/routes/incidents-triage-decisions.js";

type Executor = Pick<PostgresTriageAuthorityExecutor, "decide">;
type Repository = Pick<PostgresAuthorizedIncidentRepository, "triage">;
type DecisionSet = TriageDecisionReceipt["decisionSet"];
type DecisionItem = IncidentTriageRead["decisionSets"][number]["items"][number];

const apps: FastifyInstance[] = [];
const uuid = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { actor: uuid(1), incident: uuid(2), evaluation: uuid(3), event: uuid(4), rule: uuid(5), ruleVersion: uuid(6), store: uuid(7), sector: uuid(8), location: uuid(9), assignee: uuid(10), category: uuid(11), severity: uuid(12), set: uuid(13), fullSet: uuid(14) };
const principal: AuthorizedPrincipal = { id: ids.actor, active: true, roleScopes: [{ role: "supervisor", storeIds: [ids.store], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [] };
const body = { evaluationId: ids.evaluation, expectedVersion: 2, idempotencyKey: "triage-decision-partial", complete: true, decisions: [{ field: "category", disposition: "confirmed", value: "out-of-stock" }] } as const;
const fullBody = { ...body, idempotencyKey: "triage-decision-full", decisions: [{ field: "category", disposition: "confirmed", value: "out-of-stock" }, { field: "severity", disposition: "confirmed", value: "high" }, { field: "assignee", disposition: "confirmed", value: ids.assignee }] } as const;
const evaluation = { id: ids.evaluation, incidentId: ids.incident, incidentVersion: 2, rule: { identifier: "default-catch-all", ruleId: ids.rule, versionId: ids.ruleVersion, version: 1 }, inputs: { storeId: ids.store, sectorId: ids.sector, locationId: ids.location, productId: null, category: "out-of-stock", severity: "high", eligibleAssigneeIds: [ids.assignee] }, suggested: { category: "out-of-stock", severity: "high", assigneeUserId: ids.assignee, manualFields: ["assignee"] }, explanation: { code: "matched-single-eligible", facts: { eligibleAssigneeCount: 1 }, text: "Input category and severity preserved; exactly one eligible assignee suggested." }, evaluatedAt: "2026-08-10T12:00:00.000Z", actionCorrelationId: "evaluation-correlation" } as const;
const item = (id: string, field: "category" | "severity" | "assignee", value: string): DecisionItem => ({ id, setId: ids.set, evaluationId: ids.evaluation, field, disposition: "confirmed", value, reason: null, actorUserId: ids.actor, decidedAt: "2026-08-10T12:01:00.000Z", actionCorrelationId: "stored-decision-correlation" });
const partialSet: DecisionSet = { id: ids.set, evaluationId: ids.evaluation, sequence: 1, recordedFields: ["category"], complete: false, decidedAt: "2026-08-10T12:01:00.000Z", actionCorrelationId: "stored-decision-correlation" };
const fullSet: DecisionSet = { id: ids.fullSet, evaluationId: ids.evaluation, sequence: 2, recordedFields: ["category", "severity", "assignee"], complete: true, decidedAt: "2026-08-10T12:02:00.000Z", actionCorrelationId: "stored-full-correlation" };
const partialItem = item(ids.category, "category", "out-of-stock");
const fullItems = [partialItem, item(ids.severity, "severity", "high"), item(ids.assignee, "assignee", ids.assignee)].map((value, index) => index === 0 ? { ...value, setId: ids.fullSet, actionCorrelationId: "stored-full-correlation" } : { ...value, setId: ids.fullSet, actionCorrelationId: "stored-full-correlation" });

function authority(state: "open" | "classified", version: number, set: DecisionSet, items: readonly DecisionItem[]): IncidentTriageRead {
  const { recordedFields: _recordedFields, ...storedSet } = set;
  return { incidentId: ids.incident, state, version, evaluations: [evaluation], decisionSets: [{ ...storedSet, items }], sla: null };
}
function receipt(set: DecisionSet, state: "open" | "classified", version: number): TriageDecisionOutcome {
  return { status: "decided", incidentId: ids.incident, state, version, eventId: ids.event, decisionSet: set };
}
function request(sessionId: string, payload: object = body, csrf = "csrf-token") {
  return { method: "POST" as const, url: `/api/v1/incidents/${ids.incident}/triage/decisions`, headers: { cookie: `shelfops_session=${sessionId}`, "x-csrf-token": csrf }, payload };
}
function openApiShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(openApiShape);
  if (!value || typeof value !== "object") return value;
  const shape = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, openApiShape(entry)]));
  if (!("const" in shape)) return shape;
  const literal = shape.const;
  delete shape.const;
  return { ...shape, enum: [literal] };
}
async function appFor(executor: Executor, repository: Repository, requestIds = ["request-1"]): Promise<{ app: FastifyInstance; sessionId: string }> {
  const sessionId = createOpaqueSessionId();
  const identityProvider = createDevelopmentIdentityProvider((candidate) => candidate === sessionId ? { id: sessionId, expiresAt: Date.now() + 60_000, csrfToken: "csrf-token", principal } : undefined);
  const app = Fastify({ genReqId: () => requestIds.shift() ?? "unexpected-request" });
  await registerApiFoundation(app);
  await registerIncidentTriageDecisionRoute(app, { identityProvider, triageAuthorityExecutor: executor, triageRepository: repository });
  apps.push(app);
  return { app, sessionId };
}

afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe("triage decision API", () => {
  it("returns exact partial and effective-complete decision receipts with stored action correlation", async () => {
    let outcome = receipt(partialSet, "open", 3);
    let read = authority("open", 3, partialSet, [partialItem]);
    const decide = vi.fn(async (_principal: AuthorizedPrincipal, _input: TriageDecisionInput): Promise<TriageDecisionOutcome> => outcome);
    const triage = vi.fn(async (): Promise<IncidentTriageRead> => read);
    const { app, sessionId } = await appFor({ decide }, { triage }, ["partial", "full"]);

    const partial = await app.inject(request(sessionId));
    expect(partial.statusCode).toBe(201);
    expect(partial.json()).toEqual({ decisionSet: { id: ids.set, evaluationId: ids.evaluation, sequence: 1, recordedFields: ["category"], complete: false, decidedAt: "2026-08-10T12:01:00.000Z" }, triage: { incidentId: ids.incident, state: "open", version: 3, status: "awaiting-decision", currentEvaluation: evaluation, latestDecisions: { category: partialItem, severity: null, assignee: null }, complete: false }, actionCorrelationId: "stored-decision-correlation", correlationId: "partial" });
    expect(decide).toHaveBeenCalledWith(principal, { incidentId: ids.incident, ...body, correlationId: "partial" });

    outcome = receipt(fullSet, "classified", 4);
    read = authority("classified", 4, fullSet, fullItems);
    const full = await app.inject(request(sessionId, fullBody));
    expect(full.statusCode).toBe(201);
    expect(full.json()).toEqual({ decisionSet: { id: ids.fullSet, evaluationId: ids.evaluation, sequence: 2, recordedFields: ["category", "severity", "assignee"], complete: true, decidedAt: "2026-08-10T12:02:00.000Z" }, triage: { incidentId: ids.incident, state: "classified", version: 4, status: "complete", currentEvaluation: evaluation, latestDecisions: { category: fullItems[0], severity: fullItems[1], assignee: fullItems[2] }, complete: true }, actionCorrelationId: "stored-full-correlation", correlationId: "full" });
    expect(full.headers["x-correlation-id"]).toBe("full");
  });

  it("rejects closed, duplicate, and invalid disposition bodies plus session and CSRF before effects", async () => {
    let effects = 0;
    const decide = vi.fn(async (_principal: AuthorizedPrincipal, input: TriageDecisionInput): Promise<TriageDecisionOutcome> => {
      const decision = input.decisions[0]!;
      if (decision.disposition === "confirmed" && (decision.value !== "out-of-stock" || decision.reason !== undefined) || (decision.disposition === "corrected" || decision.disposition === "manual") && !decision.reason || decision.disposition === "manual" && decision.field !== "assignee") throw new TriageValidationError();
      effects += 1;
      return receipt(partialSet, "open", 3);
    });
    const triage = vi.fn(async (): Promise<IncidentTriageRead> => authority("open", 3, partialSet, [partialItem]));
    const { app, sessionId } = await appFor({ decide }, { triage }, ["unknown", "audit", "empty", "too-many", "blank", "assignee", "duplicate", "auth", "csrf", "confirmed", "reason", "corrected", "manual"]);

    for (const payload of [{ ...body, actorUserId: ids.actor }, { ...body, decisions: [{ ...body.decisions[0], id: ids.category }] }, { ...body, decisions: [] }, { ...fullBody, decisions: [...fullBody.decisions, { field: "category", disposition: "confirmed", value: "out-of-stock" }] }, { ...body, decisions: [{ ...body.decisions[0], value: " " }] }, { ...body, decisions: [{ field: "assignee", disposition: "confirmed", value: "not-a-uuid" }] }]) {
      const response = await app.inject(request(sessionId, payload));
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation-failed" });
    }
    const duplicate = await app.inject(request(sessionId, { ...body, decisions: [...body.decisions, { ...body.decisions[0] }] }));
    expect(duplicate.statusCode).toBe(400);
    expect(duplicate.json()).toEqual({ code: "validation-failed", message: "Request validation failed", correlationId: "duplicate", fields: [{ name: "decisions", code: "duplicate-field" }] });
    const unauthenticated = await app.inject(request(createOpaqueSessionId()));
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ code: "authentication-required", message: "Authentication is required", correlationId: "auth" });
    const csrf = await app.inject(request(sessionId, body, "wrong"));
    expect(csrf.statusCode).toBe(403);
    expect(csrf.json()).toEqual({ code: "forbidden", message: "CSRF validation failed", correlationId: "csrf" });
    for (const decision of [{ field: "category", disposition: "confirmed", value: "different" }, { field: "category", disposition: "confirmed", value: "out-of-stock", reason: "not allowed" }, { field: "category", disposition: "corrected", value: "equipment-failure" }, { field: "severity", disposition: "manual", value: "high", reason: "wrong manual field" }] as const) {
      const response = await app.inject(request(sessionId, { ...body, decisions: [decision] }));
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation-failed" });
    }
    expect(effects).toBe(0);
    expect(triage).not.toHaveBeenCalled();
  });

  it("preserves preauthorized replay precedence and exact conflict, stale, and invalid transition bodies", async () => {
    let result: TriageDecisionOutcome | Error = receipt(partialSet, "open", 3);
    let committed = false;
    let effects = 0;
    const decide = vi.fn(async (): Promise<TriageDecisionOutcome> => {
      if (result instanceof Error) throw result;
      if (!committed) { committed = true; effects += 1; }
      return result;
    });
    const triage = vi.fn(async (): Promise<IncidentTriageRead> => authority("open", 3, partialSet, [partialItem]));
    const { app, sessionId } = await appFor({ decide }, { triage }, ["fresh", "replay", "conflict", "stale", "invalid", "unavailable"]);

    const fresh = await app.inject(request(sessionId));
    const replay = await app.inject(request(sessionId));
    expect(fresh.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual({ ...fresh.json(), correlationId: "replay" });
    expect(effects).toBe(1);
    result = new TriageIdempotencyConflictError();
    const conflict = await app.inject(request(sessionId, { ...body, expectedVersion: 3 }));
    expect(conflict.json()).toEqual({ code: "idempotency-conflict", message: "Idempotency key is already used for a different request", correlationId: "conflict" });
    result = new TriageStaleVersionError(3);
    const stale = await app.inject(request(sessionId, { ...body, idempotencyKey: "triage-decision-stale" }));
    expect(stale.json()).toEqual({ code: "stale-version", message: "Expected version is stale", correlationId: "stale", currentVersion: 3, retrievalUri: `/api/v1/incidents/${ids.incident}/triage` });
    result = new TriageInvalidTransitionError("classified");
    const invalid = await app.inject(request(sessionId, { ...body, idempotencyKey: "triage-decision-invalid" }));
    expect(invalid.json()).toEqual({ code: "invalid-transition", message: "Incident must be open for triage", correlationId: "invalid", currentState: "classified" });
    expect([conflict.statusCode, stale.statusCode, invalid.statusCode]).toEqual([409, 409, 409]);
    result = { status: "indeterminate", correlationId: "lost-commit", retryWithSameKey: true };
    const unavailable = await app.inject(request(sessionId, { ...body, idempotencyKey: "triage-decision-recover" }));
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ code: "temporarily-unavailable", message: "Service is temporarily unavailable", correlationId: "unavailable" });
    expect(effects).toBe(1);
  });

  it("does not disclose hidden replay or run reads for forbidden decisions", async () => {
    let failure: Error = new TriageNotFoundError();
    const decide = vi.fn(async (): Promise<TriageDecisionOutcome> => { throw failure; });
    const triage = vi.fn(async (): Promise<IncidentTriageRead> => authority("open", 3, partialSet, [partialItem]));
    const { app, sessionId } = await appFor({ decide }, { triage }, ["hidden", "forbidden"]);

    const hidden = await app.inject(request(sessionId, { ...body, idempotencyKey: "stored-but-hidden" }));
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual({ code: "not-found", message: "Resource not found", correlationId: "hidden" });
    failure = new TriageForbiddenError();
    const forbidden = await app.inject(request(sessionId));
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ code: "forbidden", message: "Request is forbidden", correlationId: "forbidden" });
    expect(triage).not.toHaveBeenCalled();
  });

  it("publishes only the local closed decision schemas", async () => {
    const { app } = await appFor({ decide: vi.fn(async (): Promise<TriageDecisionOutcome> => receipt(partialSet, "open", 3)) }, { triage: vi.fn(async (): Promise<IncidentTriageRead> => authority("open", 3, partialSet, [partialItem])) });
    await app.ready();
    const operation = (app.swagger() as Record<string, any>).paths["/api/v1/incidents/{incidentId}/triage/decisions"].post;
    const responseSchema = (status: string) => operation.responses[status].content["application/json"].schema;
    expect(operation.security).toEqual([{ sessionCookie: [] }]);
    expect(operation.requestBody.content["application/json"].schema).toEqual(openApiShape(TriageDecisionBodySchema));
    expect(Object.keys(operation.responses)).toEqual(["201", "400", "401", "403", "404", "409", "503"]);
    for (const [status, schema] of Object.entries({ "201": TriageDecisionResponseSchema, "400": ValidationErrorSchema, "401": AuthenticationRequiredErrorSchema, "403": ForbiddenErrorSchema, "404": NotFoundErrorSchema, "409": TriageMutation409ErrorSchema, "503": TemporaryUnavailableErrorSchema })) expect(responseSchema(status)).toEqual(openApiShape(schema));
    for (const value of Object.values(operation.responses) as Array<Record<string, any>>) expect(value.headers).toEqual({ "X-Correlation-Id": { schema: { type: "string" }, description: "Correlation for this HTTP request; replays receive a new value." } });
  });
});
