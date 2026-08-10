import { readFile, readdir } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { createDevelopmentIdentityProvider, createOpaqueSessionId } from "@shelfops/application/identity/session";
import { IdempotencyConflictError } from "@shelfops/application/ports/configuration-executor";
import { SlaPolicyValidationError, type SlaPolicyConfigurationExecutor, type SlaPolicyConfigurationOutcome } from "@shelfops/application/sla/configure-policy";
import { buildApi } from "../src/app.js";
import { openApiDocument } from "../src/openapi.js";

const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
const principal: AuthorizedPrincipal = { id: "central-user", active: true, roleScopes: [{ role: "central-operations", storeIds: ["store-a"], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [{ action: "configure-store-policy", role: "central-operations" }] };
const body = { expectedVersion: 1, effectiveAt: "2026-08-10T10:00:00.000Z", idempotencyKey: "sla-policy-1", rules: [{ category: "equipment-failure", severity: "low", warningAfterSeconds: 60, deadlineAfterSeconds: 120 }] };
const request = (sessionId: string, payload: object = body, csrf = "csrf-token") => ({ method: "POST" as const, url: "/api/v1/sla-policy", headers: { cookie: `shelfops_session=${sessionId}`, "x-csrf-token": csrf }, payload });

afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

describe("SLA policy configuration API", () => {
  it("enforces session and CSRF before the executor, maps stable failures, and returns current-request correlation", async () => {
    const sessionId = createOpaqueSessionId(); const acceptedOutcome: SlaPolicyConfigurationOutcome = { policyVersionId: "00000000-0000-7000-8000-000000000002", version: 2, effectiveAt: body.effectiveAt }; let result: SlaPolicyConfigurationOutcome | Error = acceptedOutcome;
    const execute = vi.fn(async (): Promise<SlaPolicyConfigurationOutcome> => { if (result instanceof Error) throw result; return result; });
    const identityProvider = createDevelopmentIdentityProvider((candidate) => candidate === sessionId ? { id: sessionId, csrfToken: "csrf-token", expiresAt: Date.now() + 60_000, principal } : undefined);
    const app = await buildApi({ configurationExecutor: { execute: vi.fn() }, slaPolicyExecutor: { execute } satisfies SlaPolicyConfigurationExecutor, identityProvider }); apps.push(app);
    for (const [options, status, code] of [[request(createOpaqueSessionId()), 401, "authentication-required"], [request(sessionId, body, "wrong"), 403, "forbidden"], [request(sessionId, { ...body, actorId: "client" }), 400, "validation-failed"], [request(sessionId, { ...body, rules: [{ ...body.rules[0]!, warningAfterSeconds: 0 }] }), 400, "validation-failed"]] as const) {
      const response = await app.inject(options); expect(response.statusCode).toBe(status); expect(response.json()).toMatchObject({ code, correlationId: expect.any(String) });
    }
    expect(execute).not.toHaveBeenCalled(); const accepted = await app.inject(request(sessionId)); const acceptedBody = accepted.json(); expect(accepted.statusCode).toBe(201); expect(acceptedBody).toMatchObject({ policyVersionId: acceptedOutcome.policyVersionId, version: 2, correlationId: expect.any(String) }); expect(accepted.headers["x-correlation-id"]).toBe(acceptedBody.correlationId);
    const replay = await app.inject(request(sessionId)); expect(replay.json().correlationId).not.toBe(acceptedBody.correlationId); expect(replay.headers["x-correlation-id"]).toBe(replay.json().correlationId);
    for (const [failure, status, code] of [[new SlaPolicyValidationError(), 400, "validation-failed"], [new Error("stale-version"), 409, "stale-version"], [new IdempotencyConflictError(), 409, "idempotency-conflict"], [new Error("database unavailable"), 503, "temporarily-unavailable"]] as const) { result = failure; const response = await app.inject(request(sessionId)); expect(response.statusCode).toBe(status); expect(response.json()).toMatchObject({ code, correlationId: expect.any(String) }); }
  });

  it("keeps the generated contract, representative examples, and operator guide deterministic", async () => {
    const document = await openApiDocument() as Record<string, any>; const operation = document.paths["/api/v1/sla-policy"].post; const committed = await readFile("openapi/openapi.json");
    const schema = operation.requestBody.content["application/json"].schema;
    expect(Buffer.from(`${JSON.stringify(document, null, 2)}\n`, "utf8")).toEqual(committed); expect(operation.security).toEqual([{ sessionCookie: [] }]); expect(Object.keys(operation.responses)).toEqual(["201", "400", "401", "403", "409", "503"]); expect(schema).toMatchObject({ additionalProperties: false, required: ["expectedVersion", "effectiveAt", "idempotencyKey", "rules"] }); expect(schema.properties.actorId).toBeUndefined();
    for (const response of Object.values(operation.responses) as Array<any>) expect(response.headers).toEqual({ "X-Correlation-Id": { schema: { type: "string" }, description: "Correlation for this HTTP request; replays receive a new value." } });
    expect((await readdir("openapi/examples/sla-configuration")).sort()).toEqual(["accepted.json", "forbidden.json", "idempotency-conflict.json", "stale-version.json", "validation-failed.json"]);
    expect(await readFile("docs/sla-configuration.md", "utf8")).toMatch(/future[\s\S]*complete[\s\S]*session[\s\S]*CSRF[\s\S]*idempotencyKey[\s\S]*stale-version[\s\S]*future cycles/i);
  });
});
