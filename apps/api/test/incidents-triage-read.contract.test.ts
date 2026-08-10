import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { createDevelopmentIdentityProvider, createOpaqueSessionId } from "@shelfops/application/identity/session";
import { AuthenticationRequiredErrorSchema, NotFoundErrorSchema, TemporaryUnavailableErrorSchema, ValidationErrorSchema } from "@shelfops/contracts/errors";
import { TriageProjectionSchema } from "@shelfops/contracts/triage";
import type { IncidentTriageRead, PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";

import { registerApiFoundation } from "../src/openapi.js";
import { registerIncidentTriageReadRoute } from "../src/routes/incidents-triage-read.js";

type Repository = Pick<PostgresAuthorizedIncidentRepository, "triage">;
const apps: FastifyInstance[] = [];
const uuid = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { actor: uuid(1), incident: uuid(2), evaluation: uuid(3), oldEvaluation: uuid(4), category: uuid(5), severity: uuid(6), assignee: uuid(7), store: uuid(8), sector: uuid(9), location: uuid(10), rule: uuid(11), ruleVersion: uuid(12) };
const principal: AuthorizedPrincipal = { id: ids.actor, active: true, roleScopes: [{ role: "supervisor", storeIds: [ids.store], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [] };
const evaluation = { id: ids.evaluation, incidentId: ids.incident, incidentVersion: 3, rule: { identifier: "default-catch-all", ruleId: ids.rule, versionId: ids.ruleVersion, version: 1 }, inputs: { storeId: ids.store, sectorId: ids.sector, locationId: ids.location, productId: null, category: "out-of-stock", severity: "high", eligibleAssigneeIds: [ids.assignee] }, suggested: { category: "out-of-stock", severity: "high", assigneeUserId: ids.assignee, manualFields: [] }, explanation: { code: "matched-single-eligible", facts: { eligibleAssigneeCount: 1 }, text: "Input category and severity preserved; exactly one eligible assignee suggested." }, evaluatedAt: "2026-08-10T12:00:00.000Z", actionCorrelationId: "evaluation" };
const decision = (id: string, field: "category" | "severity" | "assignee", value: string) => ({ id, setId: uuid(20), evaluationId: ids.evaluation, field, disposition: "confirmed" as const, value, reason: null, actorUserId: ids.actor, decidedAt: "2026-08-10T12:01:00.000Z", actionCorrelationId: "decision" });
const authority = { incidentId: ids.incident, state: "classified" as const, version: 4, evaluations: [evaluation, { ...evaluation, id: ids.oldEvaluation, incidentVersion: 2 }], decisionSets: [{ id: uuid(20), evaluationId: ids.evaluation, sequence: 2, complete: true, decidedAt: "2026-08-10T12:01:00.000Z", actionCorrelationId: "set", items: [decision(ids.category, "category", "out-of-stock"), decision(ids.severity, "severity", "high"), decision(ids.assignee, "assignee", ids.assignee)] }] } satisfies Omit<IncidentTriageRead, "sla">;

function openApiShape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(openApiShape);
  if (!value || typeof value !== "object") return value;
  const shape = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, openApiShape(entry)]));
  if (!("const" in shape)) return shape;
  const literal = shape.const;
  delete shape.const;
  return { ...shape, enum: [literal] };
}

async function appFor(repository: Repository, requestIds = ["request-1"]): Promise<{ app: FastifyInstance; sessionId: string }> {
  const sessionId = createOpaqueSessionId();
  const identityProvider = createDevelopmentIdentityProvider((candidate) => candidate === sessionId ? { id: sessionId, expiresAt: Date.now() + 60_000, csrfToken: "csrf-token", principal } : undefined);
  const app = Fastify({ genReqId: () => requestIds.shift() ?? "unexpected-request" });
  await registerApiFoundation(app);
  await registerIncidentTriageReadRoute(app, { identityProvider, repository });
  apps.push(app);
  return { app, sessionId };
}

afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe("triage read API", () => {
  it("returns the closed current projection for an authenticated visible session without CSRF", async () => {
    const triage = vi.fn(async (): Promise<IncidentTriageRead> => ({ ...authority, sla: null }));
    const { app, sessionId } = await appFor({ triage });

    const response = await app.inject({ method: "GET", url: `/api/v1/incidents/${ids.incident}/triage`, headers: { cookie: `shelfops_session=${sessionId}`, "x-csrf-token": "not-required" } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ incidentId: ids.incident, state: "classified", version: 4, status: "complete", currentEvaluation: evaluation, latestDecisions: { category: decision(ids.category, "category", "out-of-stock"), severity: decision(ids.severity, "severity", "high"), assignee: decision(ids.assignee, "assignee", ids.assignee) }, complete: true });
    expect(response.headers["x-correlation-id"]).toBe("request-1");
    expect(triage).toHaveBeenCalledWith(principal, ids.incident);
  });

  it("keeps hidden, legacy, authentication, validation, and unavailable reads in the documented boundary", async () => {
    let result: IncidentTriageRead | undefined | Error = undefined;
    let effects = 0;
    const triage = vi.fn(async (): Promise<IncidentTriageRead | undefined> => { if (result instanceof Error) throw result; if (result) effects += 1; return result; });
    const { app, sessionId } = await appFor({ triage }, ["hidden", "legacy-open", "legacy-classified", "authentication", "invalid", "unavailable"]);
    const request = (incidentId: string, cookie = `shelfops_session=${sessionId}`) => app.inject({ method: "GET", url: `/api/v1/incidents/${incidentId}/triage`, headers: { cookie } });

    const hidden = await request(ids.incident);
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual({ code: "not-found", message: "Resource not found", correlationId: "hidden" });
    result = { ...authority, state: "open", version: 1, evaluations: [], decisionSets: [], sla: null };
    const legacyOpen = await request(ids.incident);
    expect(legacyOpen.statusCode).toBe(200);
    expect(legacyOpen.json()).toEqual({ incidentId: ids.incident, state: "open", version: 1, status: "awaiting-evaluation", currentEvaluation: null, latestDecisions: { category: null, severity: null, assignee: null }, complete: false });
    result = { ...result, state: "classified" };
    const legacyClassified = await request(ids.incident);
    expect(legacyClassified.statusCode).toBe(200);
    expect(legacyClassified.json()).toEqual({ incidentId: ids.incident, state: "classified", version: 1, status: "complete", currentEvaluation: null, latestDecisions: { category: null, severity: null, assignee: null }, complete: true });
    const authentication = await request(ids.incident, `shelfops_session=${createOpaqueSessionId()}`);
    expect(authentication.statusCode).toBe(401);
    expect(authentication.json()).toEqual({ code: "authentication-required", message: "Authentication is required", correlationId: "authentication" });
    const invalid = await request("not-a-uuid");
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "validation-failed", message: "Request validation failed", correlationId: "invalid" });
    result = new Error("database unavailable");
    const unavailable = await request(ids.incident);
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ code: "temporarily-unavailable", message: "Service is temporarily unavailable", correlationId: "unavailable" });
    expect(effects).toBe(2);
    expect(triage).toHaveBeenCalledTimes(4);
  });

  it("publishes only the local read responses and the closed projection schema", async () => {
    const { app } = await appFor({ triage: vi.fn(async (): Promise<IncidentTriageRead> => ({ ...authority, sla: null })) });
    await app.ready();
    const operation = (app.swagger() as Record<string, any>).paths["/api/v1/incidents/{incidentId}/triage"].get;

    expect(operation.security).toEqual([{ sessionCookie: [] }]);
    expect(Object.keys(operation.responses)).toEqual(["200", "400", "401", "404", "503"]);
    expect(operation.responses["200"].content["application/json"].schema).toEqual(openApiShape(TriageProjectionSchema));
    for (const [status, schema] of Object.entries({ "400": ValidationErrorSchema, "401": AuthenticationRequiredErrorSchema, "404": NotFoundErrorSchema, "503": TemporaryUnavailableErrorSchema })) expect(operation.responses[status].content["application/json"].schema).toEqual(openApiShape(schema));
    for (const response of Object.values(operation.responses) as Array<Record<string, any>>) expect(response.headers).toEqual({ "X-Correlation-Id": { schema: { type: "string" }, description: "Server-generated identifier for support correlation." } });
  });
});
