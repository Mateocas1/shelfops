import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { createDevelopmentIdentityProvider, createOpaqueSessionId } from "@shelfops/application/identity/session";
import { IncidentCreationForbiddenError, IncidentCreationIdempotencyConflictError, IncidentCreationValidationError, IncidentReferenceError, type CreateIncidentInput, type IncidentCreationOutcome } from "@shelfops/application/incidents/create-incident";
import { IdempotencyConflictErrorSchema } from "@shelfops/contracts/errors";
import { IncidentCreationResponseSchema } from "@shelfops/contracts/triage";
import type { PostgresIncidentCreationExecutor } from "@shelfops/infrastructure/incidents/postgres-incident-creation-executor";
import { buildApi } from "../src/app.js";
import { openApiDocument } from "../src/openapi.js";

type Executor = Pick<PostgresIncidentCreationExecutor, "execute">;
const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
const uuid = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { user: uuid(1), incident: uuid(2), evidence: uuid(3), event: uuid(4), triageEvent: uuid(5), evaluation: uuid(6), cycle: uuid(7), policy: uuid(8), rule: uuid(9), store: uuid(10), sector: uuid(11), location: uuid(12), product: uuid(13) };
const principal: AuthorizedPrincipal = { id: ids.user, active: true, roleScopes: [{ role: "collaborator", storeIds: [ids.store], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [] };
const body = { storeId: ids.store, sectorId: ids.sector, locationId: ids.location, productId: ids.product, category: "out-of-stock", severity: "high", title: "Empty shelf", description: "No units remain", occurredAt: "2026-08-08T10:00:00.000Z", textEvidence: "Shelf checked", idempotencyKey: "incident-1" };
const created = { status: "created", incidentId: ids.incident, evidenceId: ids.evidence, eventId: ids.event, triageEventId: ids.triageEvent, reporterId: ids.user, createdAt: "2026-08-08T10:01:00.000Z", state: "open", version: 1, actionCorrelationId: "creation-action-correlation", sla: { cycleId: ids.cycle, cycleSequence: 1, condition: "on-track", warningAt: "2026-08-08T14:01:00.000Z", deadlineAt: "2026-08-08T18:01:00.000Z", policyVersionId: ids.policy, policyVersion: 1, clockMode: "continuous-utc", pausesWhenBlocked: false }, triage: { incidentId: ids.incident, state: "open", version: 1, status: "awaiting-decision", currentEvaluation: { id: ids.evaluation, incidentId: ids.incident, incidentVersion: 1, rule: { identifier: "default-catch-all", ruleId: ids.rule, versionId: ids.rule, version: 1 }, inputs: { storeId: ids.store, sectorId: ids.sector, locationId: ids.location, productId: ids.product, category: "out-of-stock", severity: "high", eligibleAssigneeIds: [] }, suggested: { category: "out-of-stock", severity: "high", assigneeUserId: null, manualFields: ["assignee"] }, explanation: { code: "manual-assignee-ambiguous", facts: { eligibleAssigneeCount: 0 }, text: "Input category and severity preserved; assignee requires human selection (0 eligible)." }, evaluatedAt: "2026-08-08T10:01:00.000Z", actionCorrelationId: "creation-action-correlation" }, latestDecisions: { category: null, severity: null, assignee: null }, complete: false } } as const;
const cookie = (sessionId: string) => `shelfops_session=${sessionId}`;
const request = (sessionId: string, payload: object = body, csrf = "csrf-token") => ({ method: "POST" as const, url: "/api/v1/incidents", headers: { cookie: cookie(sessionId), "x-csrf-token": csrf }, payload });
function openApiShape(value: unknown): unknown { if (Array.isArray(value)) return value.map(openApiShape); if (!value || typeof value !== "object") return value; const shape = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, openApiShape(entry)])); if (!("const" in shape)) return shape; const literal = shape.const; delete shape.const; return { ...shape, enum: [literal] }; }

async function appFor(executor: Executor) {
  const sessionId = createOpaqueSessionId();
  const identityProvider = createDevelopmentIdentityProvider((candidate) => candidate === sessionId ? { id: sessionId, expiresAt: Date.now() + 60_000, csrfToken: "csrf-token", principal } : undefined);
  const list = vi.fn(async () => ({ items: [] }));
  const app = await buildApi({ configurationExecutor: { execute: vi.fn() }, identityProvider, incidentCreationExecutor: executor, incidentRepository: { list, detail: vi.fn() }, cursorSecret: "incident-create-cursor-secret" } as never);
  apps.push(app);
  return { app, sessionId, list };
}

afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe("incident creation API", () => {
  it("maps the session principal and current correlation into a 201 receipt", async () => {
    const execute = vi.fn(async (_principal: AuthorizedPrincipal, _input: CreateIncidentInput): Promise<IncidentCreationOutcome> => created);
    const { app, sessionId } = await appFor({ execute });
    const response = await app.inject(request(sessionId)); const responseBody = response.json();
    expect(response.statusCode).toBe(201);
    const { status: _status, ...receipt } = created;
    expect(responseBody).toEqual({ ...receipt, correlationId: expect.any(String) });
    expect(response.headers["x-correlation-id"]).toBe(responseBody.correlationId);
    expect(execute).toHaveBeenCalledWith(principal, { ...body, correlationId: responseBody.correlationId });
  });

  it("rejects schema, session, CSRF, and authority injection before execution while GET remains unchanged", async () => {
    const execute = vi.fn(async () => created);
    const { app, sessionId, list } = await appFor({ execute });
    for (const name of ["actorId", "reporterId", "organizationId", "state", "version", "incidentId", "createdAt", "correlationId", "expectedVersion"]) {
      const response = await app.inject(request(sessionId, { ...body, [name]: "client-owned" }));
      expect(response.statusCode).toBe(400); expect(response.json()).toMatchObject({ fields: [{ name, code: "unknown" }] });
    }
    for (const [options, status, code] of [
      [request(sessionId, { ...body, title: "" }), 400, "validation-failed"],
      [request(sessionId, { ...body, category: " " }), 400, "validation-failed"],
      [request(sessionId, { ...body, textEvidence: "x".repeat(4_001) }), 400, "validation-failed"],
      [request(createOpaqueSessionId()), 401, "authentication-required"],
      [request(sessionId, body, "wrong"), 403, "forbidden"]
    ] as const) {
      const response = await app.inject(options); const result = response.json();
      expect(response.statusCode).toBe(status); expect(result).toMatchObject({ code, correlationId: expect.any(String) });
      expect(response.headers["x-correlation-id"]).toBe(result.correlationId);
    }
    expect(execute).not.toHaveBeenCalled();
    const get = await app.inject({ method: "GET", url: "/api/v1/incidents", headers: { cookie: cookie(sessionId) } });
    expect(get.statusCode).toBe(200); expect(get.json()).toMatchObject({ items: [], limit: 50 }); expect(list).toHaveBeenCalledOnce();
  });

  it("normalizes WU-08T failures and indeterminate outcomes", async () => {
    let result: IncidentCreationOutcome | Error = created;
    const execute = vi.fn(async () => { if (result instanceof Error) throw result; return result; });
    const { app, sessionId } = await appFor({ execute });
    for (const [failure, status, code, fields] of [
      [new IncidentCreationValidationError("invalid-occurrence-time"), 400, "validation-failed", [{ name: "body", code: "invalid" }]],
      [new IncidentReferenceError(), 400, "validation-failed", [{ name: "reference", code: "invalid" }]],
      [new IncidentCreationForbiddenError(), 403, "forbidden", undefined],
      [new IncidentCreationIdempotencyConflictError(), 409, "idempotency-conflict", undefined],
      [{ status: "indeterminate", correlationId: "executor-correlation", retryWithSameKey: true } as const, 503, "temporarily-unavailable", undefined],
      [new Error("triage-unavailable"), 503, "temporarily-unavailable", undefined]
    ] as const) {
      result = failure;
      const response = await app.inject(request(sessionId)); const responseBody = response.json();
      expect(response.statusCode).toBe(status); expect(responseBody).toMatchObject({ code, correlationId: expect.any(String), ...(fields ? { fields } : {}) });
      expect(response.headers["x-correlation-id"]).toBe(responseBody.correlationId);
    }
    expect(execute).toHaveBeenCalledTimes(6);
  });

  it("replays original creation data with the current HTTP correlation", async () => {
    const execute = vi.fn(async (): Promise<IncidentCreationOutcome> => created);
    const { app, sessionId } = await appFor({ execute });
    const first = await app.inject(request(sessionId)); const replay = await app.inject(request(sessionId));
    const firstBody = first.json(); const replayBody = replay.json();
    expect({ ...replayBody, correlationId: firstBody.correlationId }).toEqual(firstBody); expect(replayBody.actionCorrelationId).toBe("creation-action-correlation");
    expect(replayBody.correlationId).not.toBe(firstBody.correlationId); expect(replay.headers["x-correlation-id"]).toBe(replayBody.correlationId);
  });

  it("returns the exact temporary failure contract when triage authority is unavailable", async () => {
    const { app, sessionId } = await appFor({ execute: vi.fn(async () => { throw new Error("triage-unavailable"); }) });
    const response = await app.inject(request(sessionId));
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ code: "temporarily-unavailable", message: "Service is temporarily unavailable", correlationId: response.headers["x-correlation-id"] });
  });

  it("publishes the exact POST schema and response set", async () => {
    const document = await openApiDocument() as Record<string, any>; const path = document.paths["/api/v1/incidents"]; const responses = path.post.responses;
    expect(Object.keys(path)).toEqual(["get", "post"]); expect(path.post.security).toEqual([{ sessionCookie: [] }]);
    expect(Object.keys(responses)).toEqual(["201", "400", "401", "403", "409", "503"]);
    const schema = path.post.requestBody.content["application/json"].schema;
    expect(schema.additionalProperties).toBe(false); expect(schema.required).toEqual(["storeId", "sectorId", "locationId", "category", "severity", "title", "description", "occurredAt", "textEvidence", "idempotencyKey"]);
    expect(schema.properties.category.enum).toBeUndefined(); expect(schema.properties.severity.enum).toBeUndefined();
    expect(schema.properties.occurredAt.format).toBe("date-time"); expect(schema.properties.textEvidence.maxLength).toBe(4000);
    expect(schema.properties.expectedVersion).toBeUndefined(); expect(JSON.stringify(path.post)).not.toMatch(/Idempotency-Key|actorId|organizationId|reporterId.*requestBody/);
    const responseSchema = (status: string) => responses[status].content["application/json"].schema;
    expect(responseSchema("201")).toEqual(openApiShape(IncidentCreationResponseSchema));
    const errorSchema = (code: string, fields = false) => ({
      additionalProperties: false, type: "object",
      required: ["code", "message", "correlationId", ...(fields ? ["fields"] : [])],
      properties: {
        code: { type: "string", enum: [code] }, message: { type: "string" },
        correlationId: { description: "Server-generated identifier for support correlation.", type: "string" },
        ...(fields ? { fields: { type: "array", items: { additionalProperties: false, type: "object", required: ["name", "code"], properties: { name: { type: "string" }, code: { type: "string" } } } } } : {})
      }
    });
    expect(responseSchema("400")).toEqual(errorSchema("validation-failed", true));
    expect(responseSchema("401")).toEqual(errorSchema("authentication-required"));
    expect(responseSchema("403")).toEqual(errorSchema("forbidden"));
    expect(responseSchema("409")).toEqual(openApiShape(IdempotencyConflictErrorSchema));
    expect(responseSchema("503")).toEqual(errorSchema("temporarily-unavailable"));
    for (const status of Object.keys(responses)) {
      expect(responses[status].headers).toEqual({ "X-Correlation-Id": { schema: { type: "string" }, description: "Correlation for this HTTP request; replays receive a new value." } });
    }
  });

  it("documents creation, replay, recovery, errors, and exclusions with bounded examples", async () => {
    const directory = "openapi/examples/incidents-create";
    expect((await readdir(directory)).sort()).toEqual(["created.json", "indeterminate.json"]);
    const examples = `${await readFile(`${directory}/created.json`, "utf8")}\n${await readFile(`${directory}/indeterminate.json`, "utf8")}`;
    const guide = await readFile("docs/incident-creation.md", "utf8");
    expect(examples).toMatch(/idempotencyKey[\s\S]*201[\s\S]*incidentId[\s\S]*503[\s\S]*temporarily-unavailable/);
    for (const requirement of [/session cookie[\s\S]*CSRF/i, /replay[\s\S]*original creation[\s\S]*current HTTP request correlation/i, /indeterminate[\s\S]*same `idempotencyKey`/i, /400[\s\S]*403[\s\S]*409[\s\S]*503/, /No .*Idempotency-Key header/i, /expectedVersion|stale-version/i, /attachments[\s\S]*SLA[\s\S]*recurrence/i]) expect(guide).toMatch(requirement);
  });
});
