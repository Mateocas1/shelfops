import Fastify, { type FastifyInstance } from "fastify";
import { readFile, readdir } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { IdempotencyConflictError, type ConfigurationExecutor, type ConfigurationInput, type ConfigurationOutcome } from "@shelfops/application/ports/configuration-executor";
import { createDevelopmentIdentityProvider, createOpaqueSessionId } from "@shelfops/application/identity/session";
import { IndeterminateCommitError } from "@shelfops/infrastructure/reference-data/postgres-configuration-executor";
import { LocationConfigurationBodySchema } from "@shelfops/contracts/configuration";

import { registerErrorHandling } from "../src/error-handler.js";
import { buildApi } from "../src/app.js";
import { registerLocationConfigurationRoute } from "../src/routes/location-configuration.js";

const apps: FastifyInstance[] = [];
const path = "/api/v1/stores/store-a/locations/location-a/configuration";
const extraAuthorityProperties: ReadonlyArray<readonly [string, string]> = [
  ["actorId", "client-actor"],
  ["correlationId", "client-correlation"]
];
const principal: AuthorizedPrincipal = {
  id: "user-a",
  active: true,
  roleScopes: [{ role: "collaborator", storeIds: ["store-a"], sectorIds: [], categoryResponsibilities: [], teamIds: [] }],
  grants: []
};
const body = { expectedVersion: 3, effectiveAt: "2026-08-05T00:00:00.000Z", active: true, label: "Configured", idempotencyKey: "configure-location-1" };
const exampleNames = ["accepted", "equal-replay", "forbidden", "idempotency-conflict", "not-found", "stale-version", "temporarily-unavailable", "validation-failed"];
type Example = { request: { path: string; body: Record<string, unknown>; omitCsrf?: boolean }; response: { status: number; body: Record<string, unknown> } };

afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

function outcome(correlationId: string): ConfigurationOutcome {
  return { status: 200, eventId: "event-1", version: 4, before: { active: false }, after: { active: true }, effectiveAt: body.effectiveAt, correlationId };
}

function sessionCookie(sessionId: string): string {
  return `shelfops_session=${sessionId}`;
}

function json(response: { json(): unknown }): Record<string, unknown> {
  return response.json() as Record<string, unknown>;
}

function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected object"); return value as Record<string, unknown>; }
function parseExample(value: unknown): Example {
  const root = record(value); const request = record(root.request); const response = record(root.response);
  if (typeof request.path !== "string" || typeof response.status !== "number" || request.omitCsrf !== undefined && typeof request.omitCsrf !== "boolean") throw new Error("Malformed configuration example");
  return { request: { path: request.path, body: record(request.body), ...(request.omitCsrf === true ? { omitCsrf: true } : {}) }, response: { status: response.status, body: record(response.body) } };
}
async function loadExamples(directory: string): Promise<Record<string, Example>> {
  const entries: Array<readonly [string, Example]> = await Promise.all(exampleNames.map(async (name) => [name, parseExample(JSON.parse(await readFile(`${directory}/${name}.json`, "utf8")) as unknown)] as const));
  return Object.fromEntries(entries);
}
function documentedOutcome(value: Record<string, unknown>): ConfigurationOutcome {
  const before = record(value.before); const after = record(value.after);
  if (typeof value.eventId !== "string" || typeof value.version !== "number" || typeof value.effectiveAt !== "string" || typeof value.correlationId !== "string") throw new Error("Malformed success example");
  return { status: 200, eventId: value.eventId, version: value.version, before, after, effectiveAt: value.effectiveAt, correlationId: value.correlationId };
}

async function isolatedApp(executor: ConfigurationExecutor, sessionId: string, ids?: string[]): Promise<FastifyInstance> {
  const app = Fastify(ids ? { genReqId: () => ids.shift() ?? "unused-id" } : {});
  const provider = createDevelopmentIdentityProvider((requestedId) => requestedId === sessionId
    ? { id: sessionId, expiresAt: Date.now() + 60_000, csrfToken: "csrf-token", principal }
    : undefined);
  registerErrorHandling(app);
  await registerLocationConfigurationRoute(app, { configurationExecutor: executor, identityProvider: provider });
  apps.push(app);
  return app;
}

async function runtimeApp(executor: ConfigurationExecutor, sessionId: string): Promise<FastifyInstance> {
  const identityProvider = createDevelopmentIdentityProvider((requestedId) => requestedId === sessionId
    ? { id: sessionId, expiresAt: Date.now() + 60_000, csrfToken: "csrf-token", principal }
    : undefined);
  const app = await buildApi({ configurationExecutor: executor, identityProvider, environment: "test" });
  apps.push(app);
  return app;
}

function request(sessionId: string, payload: object = body) {
  return { method: "POST" as const, url: path, headers: { cookie: sessionCookie(sessionId), "x-csrf-token": "csrf-token" }, payload };
}

describe("isolated location configuration adapter", () => {
  it("keeps every canonical example aligned with runtime and committed OpenAPI", async () => {
    const directory = "openapi/examples/reference-configuration";
    expect((await readdir(directory)).sort()).toEqual(exampleNames.map((name) => `${name}.json`).sort());
    const examples = await loadExamples(directory); const accepted = examples.accepted!; const replay = examples["equal-replay"]!;
    expect(replay.request.body).toEqual(accepted.request.body); expect(replay.response.body).toEqual(accepted.response.body);
    for (const candidate of [accepted.request.body, replay.request.body]) expect(Object.keys(candidate).some((key) => /actor|target|event|correlation/i.test(key))).toBe(false);

    const document = record(JSON.parse(await readFile("openapi/openapi.json", "utf8")) as unknown);
    const operation = record(record(record(document.paths)["/api/v1/stores/{storeId}/locations/{locationId}/configuration"]).post);
    const responses = record(operation.responses); const requestSchema = record(record(record(record(operation.requestBody).content)["application/json"]).schema);
    const properties = record(requestSchema.properties); const required = requestSchema.required;
    if (!Array.isArray(required) || !required.every((key) => typeof key === "string")) throw new Error("Malformed OpenAPI required fields");
    expect(Object.keys(responses)).toEqual(["200", "400", "401", "403", "404", "409", "503"]);

    for (const [name, example] of Object.entries(examples)) {
      expect(responses[String(example.response.status)]).toBeDefined(); expect(example.request.path).toBe(path);
      const keys = Object.keys(example.request.body); const schemaValid = required.every((key) => keys.includes(key)) && keys.every((key) => key in properties);
      expect(schemaValid).toBe(name !== "validation-failed");
      const code = example.response.body.code;
      const failure = code === "idempotency-conflict" ? new IdempotencyConflictError() : code === "temporarily-unavailable" ? new IndeterminateCommitError("indeterminate") : typeof code === "string" ? new Error(code) : undefined;
      const executor = { execute: vi.fn(async () => { if (failure) throw failure; return documentedOutcome(accepted.response.body); }) } satisfies ConfigurationExecutor;
      const sessionId = createOpaqueSessionId(); const app = await runtimeApp(executor, sessionId); const options = request(sessionId, example.request.body);
      const response = await app.inject(example.request.omitCsrf ? { ...options, headers: { cookie: sessionCookie(sessionId) } } : options);
      const actual = json(response); expect(response.statusCode).toBe(example.response.status);
      expect({ ...actual, correlationId: example.response.body.correlationId }).toEqual(example.response.body);
      expect(response.headers["x-correlation-id"]).toBe(actual.correlationId);
    }
  });

  it("documents safe configuration execution and recovery decisions", async () => {
    const guide = await readFile("docs/reference-configuration.md", "utf8");
    for (const guidance of [
      /POST `\/api\/v1\/stores\/\{storeId\}\/locations\/\{locationId\}\/configuration`/,
      /opaque session[\s\S]*`x-csrf-token`/i,
      /body `idempotencyKey`[\s\S]*same key and unchanged body/i,
      /replay[\s\S]*before stale-version/i,
      /lost acknowledgement[\s\S]*same key and unchanged body/i,
      /idempotency-conflict[\s\S]*stale-version/,
      /temporarily-unavailable[\s\S]*do not blindly re-execute/i,
      /`x-correlation-id`[\s\S]*`correlationId`/i,
      /\/api\/v1\/configuration[\s\S]*\/api\/v1\/organizations[\s\S]*\/api\/v1\/targets/
    ]) expect(guide).toMatch(guidance);
  });

  it("normalizes real runtime validation, authorization, routing, conflict, and unavailable failures", async () => {
    const sessionId = createOpaqueSessionId();
    let failure: Error = new IdempotencyConflictError();
    const executor = { execute: vi.fn(async () => { throw failure; }) } satisfies ConfigurationExecutor;
    const app = await runtimeApp(executor, sessionId);
    const earlyFailures = [
      [request(sessionId, { ...body, actorId: "client-actor" }), 400, "validation-failed"],
      [{ ...request(sessionId), headers: { cookie: sessionCookie(sessionId) } }, 403, "forbidden"],
      [{ ...request(sessionId), url: "/api/v1/configuration" }, 404, "not-found"]
    ] as const;

    for (const [options, status, code] of earlyFailures) {
      const response = await app.inject(options);
      const responseBody = json(response);
      expect(response.statusCode).toBe(status);
      expect(responseBody).toMatchObject({ code, correlationId: expect.any(String) });
      expect(response.headers["x-correlation-id"]).toBe(responseBody.correlationId);
    }
    expect(executor.execute).not.toHaveBeenCalled();

    for (const [error, status, code] of [[new IdempotencyConflictError(), 409, "idempotency-conflict"], [new IndeterminateCommitError("commit"), 503, "temporarily-unavailable"]] as const) {
      failure = error;
      const response = await app.inject(request(sessionId));
      const responseBody = json(response);
      expect(response.statusCode).toBe(status);
      expect(responseBody).toEqual({ code, message: expect.any(String), correlationId: expect.any(String) });
      expect(response.headers["x-correlation-id"]).toBe(responseBody.correlationId);
    }
    expect(executor.execute).toHaveBeenCalledTimes(2);
  });

  it("publishes only the exact configuration mutation through production registration", async () => {
    const sessionId = createOpaqueSessionId();
    const executor = { execute: vi.fn(async (_actor, input: ConfigurationInput) => outcome(input.correlationId)) } satisfies ConfigurationExecutor;
    const identityProvider = {
      kind: "production" as const,
      lookupSession: async (requestedId: string) => requestedId === sessionId
        ? { id: sessionId, expiresAt: Date.now() + 60_000, matchesCsrfToken: (candidate: string) => candidate === "csrf-token", principal }
        : undefined
    };
    const app = await buildApi({ configurationExecutor: executor, identityProvider, environment: "production" });
    apps.push(app);

    const accepted = await app.inject(request(sessionId));
    expect(accepted.statusCode).toBe(200);
    expect(executor.execute).toHaveBeenCalledOnce();
    expect(app.printRoutes().split("\n").filter((route) => route.includes("configuration"))).toHaveLength(1);

    for (const url of ["/api/v1/configuration", "/api/v1/organizations/org-a/configuration", "/api/v1/targets/location-a/configuration"]) {
      expect((await app.inject({ ...request(sessionId), url })).statusCode).toBe(404);
    }
    expect(executor.execute).toHaveBeenCalledOnce();
  });

  it("uses only active session and path authority and blocks invalid session or CSRF before execution", async () => {
    const sessionId = createOpaqueSessionId();
    const executor = { execute: vi.fn(async (_actor, input: ConfigurationInput) => outcome(input.correlationId)) } satisfies ConfigurationExecutor;
    const app = await isolatedApp(executor, sessionId);

    expect((await app.inject(request(createOpaqueSessionId()))).statusCode).toBe(401);
    expect((await app.inject({ ...request(sessionId), headers: { cookie: sessionCookie(sessionId) } })).statusCode).toBe(403);
    expect(executor.execute).not.toHaveBeenCalled();

    const accepted = await app.inject({ ...request(sessionId), headers: { ...request(sessionId).headers, "x-actor-id": "client-actor" } });
    const acceptedBody = json(accepted);
    expect(accepted.statusCode).toBe(200);
    expect(acceptedBody).toEqual({ eventId: "event-1", version: 4, before: { active: false }, after: { active: true }, effectiveAt: body.effectiveAt, correlationId: expect.any(String) });
    expect(accepted.headers["x-correlation-id"]).toBe(acceptedBody.correlationId);
    expect(executor.execute).toHaveBeenCalledWith(principal, { storeId: "store-a", locationId: "location-a", ...body, correlationId: acceptedBody.correlationId });
  });

  it("rejects every extra authority property before the executor can observe it", async () => {
    const sessionId = createOpaqueSessionId();
    const executor = { execute: vi.fn(async (_actor, input: ConfigurationInput) => outcome(input.correlationId)) } satisfies ConfigurationExecutor;
    const app = await isolatedApp(executor, sessionId);

    for (const [name, value] of extraAuthorityProperties) {
      const response = await app.inject(request(sessionId, { ...body, [name]: value }));
      const responseBody = json(response);
      expect(response.statusCode).toBe(400);
      expect(responseBody).toEqual({ code: "validation-failed", message: "Request validation failed", correlationId: expect.any(String), fields: [{ name, code: "unknown" }] });
      expect(response.headers["x-correlation-id"]).toBe(responseBody.correlationId);
    }
    expect(executor.execute).not.toHaveBeenCalled();
    expect(LocationConfigurationBodySchema.additionalProperties).toBe(false);
  });

  it("returns the original replay correlation and does not duplicate the event", async () => {
    const sessionId = createOpaqueSessionId();
    let stored: ConfigurationOutcome | undefined;
    let events = 0;
    const executor = { execute: vi.fn(async (_actor, input: ConfigurationInput) => stored ??= (events += 1, outcome(input.correlationId))) } satisfies ConfigurationExecutor;
    const app = await isolatedApp(executor, sessionId, ["fresh-request", "replay-request"]);

    const fresh = await app.inject(request(sessionId));
    const replay = await app.inject(request(sessionId));
    expect(json(fresh)).toMatchObject({ eventId: "event-1", version: 4, correlationId: "fresh-request" });
    expect(fresh.headers["x-correlation-id"]).toBe("fresh-request");
    expect(json(replay)).toMatchObject({ eventId: "event-1", version: 4, correlationId: "fresh-request" });
    expect(replay.headers["x-correlation-id"]).toBe("fresh-request");
    expect(executor.execute).toHaveBeenNthCalledWith(2, principal, expect.objectContaining({ correlationId: "replay-request" }));
    expect(events).toBe(1);
  });

  it("normalizes typed and raw executor failures with one call and zero effects", async () => {
    const sessionId = createOpaqueSessionId();
    for (const scenario of [
      [new IdempotencyConflictError(), 409, "idempotency-conflict", "Idempotency key is already used for a different request"],
      [new Error("stale-version"), 409, "stale-version", "Expected version is stale"],
      [new IndeterminateCommitError("commit-correlation"), 503, "temporarily-unavailable", "Service is temporarily unavailable"],
      [new Error("idempotency-pending"), 503, "temporarily-unavailable", "Service is temporarily unavailable"],
      [new Error("forbidden"), 403, "forbidden", "Request is forbidden"],
      [new Error("not-found"), 404, "not-found", "Resource not found"],
      [new Error("unsupported-target"), 503, "temporarily-unavailable", "Service is temporarily unavailable"]
    ] as const) {
      const [error, status, code, message] = scenario;
      let effects = 0;
      const executor = { execute: vi.fn(async () => {
        if (error !== undefined) throw error;
        effects += 1;
        return outcome("unexpected");
      }) } satisfies ConfigurationExecutor;
      const app = await isolatedApp(executor, sessionId);
      const response = await app.inject(request(sessionId));
      const responseBody = json(response);
      expect(response.statusCode).toBe(status);
      expect(responseBody).toEqual({ code, message, correlationId: expect.any(String) });
      expect(response.headers["x-correlation-id"]).toBe(responseBody.correlationId);
      expect(executor.execute).toHaveBeenCalledOnce();
      expect(effects).toBe(0);
    }
  });

  it("keeps alternate configuration surfaces unreachable without invoking the executor", async () => {
    const sessionId = createOpaqueSessionId();
    const executor = { execute: vi.fn(async (_actor, input: ConfigurationInput) => outcome(input.correlationId)) } satisfies ConfigurationExecutor;
    const app = await isolatedApp(executor, sessionId);

    expect((await app.inject({ ...request(sessionId), url: "/api/v1/configuration" })).statusCode).toBe(404);
    expect(executor.execute).not.toHaveBeenCalled();
  });
});
