import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { createDevelopmentIdentityProvider, createOpaqueSessionId } from "@shelfops/application/identity/session";
import { TriageForbiddenError, TriageIdempotencyConflictError, TriageInvalidTransitionError, TriageNotFoundError, TriageStaleVersionError } from "@shelfops/application/triage/authority";
import { TriageMutation409ErrorSchema } from "@shelfops/contracts/errors";
import { TriageEvaluationResponseSchema } from "@shelfops/contracts/triage";
import type { TriageEvaluationInput, TriageEvaluationOutcome, PostgresTriageAuthorityExecutor } from "@shelfops/infrastructure/triage/postgres-triage-authority-executor";

import { registerApiFoundation } from "../src/openapi.js";
import { registerIncidentTriageEvaluationRoute } from "../src/routes/incidents-triage-evaluations.js";

type Executor = Pick<PostgresTriageAuthorityExecutor, "execute">;

const apps: FastifyInstance[] = [];
const uuid = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { actor: uuid(1), incident: uuid(2), evaluation: uuid(3), event: uuid(4), rule: uuid(5), ruleVersion: uuid(6), store: uuid(7), sector: uuid(8), location: uuid(9), assignee: uuid(10) };
const principal: AuthorizedPrincipal = { id: ids.actor, active: true, roleScopes: [{ role: "sector-lead", storeIds: [ids.store], sectorIds: [ids.sector], categoryResponsibilities: [], teamIds: [] }], grants: [] };
const body = { expectedVersion: 1, idempotencyKey: "triage-evaluation-1" };
const outcome = {
  status: "evaluated",
  incidentId: ids.incident,
  eventId: ids.event,
  version: 2,
  evaluation: {
    id: ids.evaluation,
    incidentId: ids.incident,
    incidentVersion: 2,
    rule: { identifier: "default-catch-all", ruleId: ids.rule, versionId: ids.ruleVersion, version: 1 },
    inputs: { storeId: ids.store, sectorId: ids.sector, locationId: ids.location, productId: null, category: "out-of-stock", severity: "high", eligibleAssigneeIds: [ids.assignee] },
    suggested: { category: "out-of-stock", severity: "high", assigneeUserId: ids.assignee, manualFields: [] },
    explanation: { code: "matched-single-eligible", facts: { eligibleAssigneeCount: 1 }, text: "Input category and severity preserved; exactly one eligible assignee suggested." },
    evaluatedAt: "2026-08-10T12:00:00.000Z",
    actionCorrelationId: "stored-action-correlation"
  }
} satisfies TriageEvaluationOutcome;

function request(sessionId: string, payload: object = body, csrf = "csrf-token") {
  return { method: "POST" as const, url: `/api/v1/incidents/${ids.incident}/triage/evaluations`, headers: { cookie: `shelfops_session=${sessionId}`, "x-csrf-token": csrf }, payload };
}

function evaluationResponse(correlationId: string) {
  return {
    evaluation: outcome.evaluation,
    triage: { incidentId: ids.incident, state: "open", version: 2, status: "awaiting-decision", currentEvaluation: outcome.evaluation, latestDecisions: { category: null, severity: null, assignee: null }, complete: false },
    actionCorrelationId: "stored-action-correlation",
    correlationId
  };
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

async function appFor(executor: Executor, requestIds = ["request-1"]): Promise<{ app: FastifyInstance; sessionId: string }> {
  const sessionId = createOpaqueSessionId();
  const identityProvider = createDevelopmentIdentityProvider((candidate) => candidate === sessionId
    ? { id: sessionId, expiresAt: Date.now() + 60_000, csrfToken: "csrf-token", principal }
    : undefined);
  const app = Fastify({ genReqId: () => requestIds.shift() ?? "unexpected-request" });
  await registerApiFoundation(app);
  await registerIncidentTriageEvaluationRoute(app, { identityProvider, triageAuthorityExecutor: executor });
  apps.push(app);
  return { app, sessionId };
}

afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe("triage evaluation API", () => {
  it("returns the exact evaluation receipt for the session principal", async () => {
    const execute = vi.fn(async (_principal: AuthorizedPrincipal, _input: TriageEvaluationInput): Promise<TriageEvaluationOutcome> => outcome);
    const { app, sessionId } = await appFor({ execute });

    const response = await app.inject(request(sessionId));

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(evaluationResponse("request-1"));
    expect(response.headers["x-correlation-id"]).toBe("request-1");
    expect(execute).toHaveBeenCalledWith(principal, { incidentId: ids.incident, ...body, correlationId: "request-1" });
  });

  it("rejects closed-body, session, and CSRF failures before delegation", async () => {
    const execute = vi.fn(async (): Promise<TriageEvaluationOutcome> => outcome);
    const { app, sessionId } = await appFor({ execute }, ["unknown", "invalid-version", "missing-key", "authentication", "csrf"]);

    const unknown = await app.inject(request(sessionId, { ...body, actorId: ids.actor }));
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json()).toEqual({ code: "validation-failed", message: "Request validation failed", correlationId: "unknown", fields: [{ name: "actorId", code: "unknown" }] });
    for (const [payload, correlationId] of [[{ ...body, expectedVersion: 0 }, "invalid-version"], [{ expectedVersion: 1 }, "missing-key"]] as const) {
      const response = await app.inject(request(sessionId, payload));
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: "validation-failed", correlationId });
    }
    const unauthenticated = await app.inject(request(createOpaqueSessionId()));
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toEqual({ code: "authentication-required", message: "Authentication is required", correlationId: "authentication" });
    const csrf = await app.inject(request(sessionId, body, "wrong"));
    expect(csrf.statusCode).toBe(403);
    expect(csrf.json()).toEqual({ code: "forbidden", message: "CSRF validation failed", correlationId: "csrf" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("keeps hidden and visible-forbidden delegated triage actions side-effect free", async () => {
    let access: "hidden" | "forbidden" = "hidden";
    let effects = 0;
    const execute = vi.fn(async (): Promise<TriageEvaluationOutcome> => {
      if (access === "hidden") throw new TriageNotFoundError();
      if (access === "forbidden") throw new TriageForbiddenError();
      effects += 1;
      return outcome;
    });
    const { app, sessionId } = await appFor({ execute }, ["hidden", "forbidden"]);

    const hidden = await app.inject(request(sessionId));
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual({ code: "not-found", message: "Resource not found", correlationId: "hidden" });
    access = "forbidden";
    const forbidden = await app.inject(request(sessionId));
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ code: "forbidden", message: "Request is forbidden", correlationId: "forbidden" });
    expect(effects).toBe(0);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("keeps equivalent replay ahead of stale state and returns exact triage conflicts", async () => {
    let result: TriageEvaluationOutcome | Error = outcome;
    let committed = false;
    let effects = 0;
    const execute = vi.fn(async (): Promise<TriageEvaluationOutcome> => {
      if (result instanceof Error) throw result;
      if (!committed) { committed = true; effects += 1; }
      return result;
    });
    const { app, sessionId } = await appFor({ execute }, ["fresh", "replay", "conflict", "stale", "invalid"]);

    const fresh = await app.inject(request(sessionId));
    const replay = await app.inject(request(sessionId));
    expect(fresh.statusCode).toBe(201);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(evaluationResponse("replay"));
    expect(effects).toBe(1);

    result = new TriageIdempotencyConflictError();
    const conflict = await app.inject(request(sessionId, { ...body, expectedVersion: 2 }));
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ code: "idempotency-conflict", message: "Idempotency key is already used for a different request", correlationId: "conflict" });
    result = new TriageStaleVersionError(2);
    const stale = await app.inject(request(sessionId, { ...body, idempotencyKey: "triage-evaluation-stale" }));
    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toEqual({ code: "stale-version", message: "Expected version is stale", correlationId: "stale", currentVersion: 2, retrievalUri: `/api/v1/incidents/${ids.incident}/triage` });
    result = new TriageInvalidTransitionError("blocked");
    const invalid = await app.inject(request(sessionId, { ...body, idempotencyKey: "triage-evaluation-invalid" }));
    expect(invalid.statusCode).toBe(409);
    expect(invalid.json()).toEqual({ code: "invalid-transition", message: "Incident must be open for triage", correlationId: "invalid", currentState: "blocked" });
    expect(effects).toBe(1);
  });

  it("fails closed on indeterminate evaluation and publishes the local closed OpenAPI contract", async () => {
    let result: TriageEvaluationOutcome | Error = { status: "indeterminate", correlationId: "lost-commit", retryWithSameKey: true };
    let effects = 0;
    const execute = vi.fn(async (): Promise<TriageEvaluationOutcome> => {
      if (result instanceof Error) throw result;
      if (result.status === "indeterminate") return result;
      effects += 1;
      return result;
    });
    const { app, sessionId } = await appFor({ execute }, ["indeterminate", "unavailable"]);

    const indeterminate = await app.inject(request(sessionId));
    expect(indeterminate.statusCode).toBe(503);
    expect(indeterminate.json()).toEqual({ code: "temporarily-unavailable", message: "Service is temporarily unavailable", correlationId: "indeterminate" });
    result = new Error("triage-unavailable");
    const unavailable = await app.inject(request(sessionId));
    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.json()).toEqual({ code: "temporarily-unavailable", message: "Service is temporarily unavailable", correlationId: "unavailable" });
    expect(effects).toBe(0);

    await app.ready();
    const document = app.swagger() as Record<string, any>;
    const operation = document.paths["/api/v1/incidents/{incidentId}/triage/evaluations"].post;
    const responseSchema = (status: string) => operation.responses[status].content["application/json"].schema;
    expect(operation.security).toEqual([{ sessionCookie: [] }]);
    expect(operation.requestBody.content["application/json"].schema).toEqual({ type: "object", additionalProperties: false, required: ["expectedVersion", "idempotencyKey"], properties: { expectedVersion: { type: "integer", minimum: 1 }, idempotencyKey: { type: "string", minLength: 1, pattern: "\\S" } } });
    expect(Object.keys(operation.responses)).toEqual(["201", "400", "401", "403", "404", "409", "503"]);
    expect(responseSchema("201")).toEqual(openApiShape(TriageEvaluationResponseSchema));
    expect(responseSchema("409")).toEqual(openApiShape(TriageMutation409ErrorSchema));
    for (const status of Object.keys(operation.responses)) {
      expect(operation.responses[status].headers).toEqual({ "X-Correlation-Id": { schema: { type: "string" }, description: "Correlation for this HTTP request; replays receive a new value." } });
    }
  });
});
