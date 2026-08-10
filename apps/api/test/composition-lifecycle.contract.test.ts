import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import type { ConfigurationExecutor } from "@shelfops/application/ports/configuration-executor";
import { createDevelopmentIdentityProvider, createOpaqueSessionId } from "@shelfops/application/identity/session";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import { PostgresIncidentCreationExecutor } from "@shelfops/infrastructure/incidents/postgres-incident-creation-executor";
import { PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";
import { PostgresConfigurationExecutor } from "@shelfops/infrastructure/reference-data/postgres-configuration-executor";
import { PostgresSlaPolicyExecutor } from "@shelfops/infrastructure/postgres/sla-policy-executor";
import { PostgresTriageAuthorityExecutor } from "@shelfops/infrastructure/triage/postgres-triage-authority-executor";
import { buildApi, type BuildApiOptions } from "../src/app.js";
import { openApiDocument } from "../src/openapi.js";
import { registerApiRoutes } from "../src/routes/register.js";
import { startApi } from "../src/startup.js";

const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.unstubAllEnvs(); });
const productionIdentityProvider: IdentityProvider = { kind: "production", lookupSession: async () => undefined };
const cursorSecret = "composition-lifecycle-cursor-secret-32-bytes";
async function registeredApp(options: BuildApiOptions, capture: (executor: ConfigurationExecutor, incidentRepository: BuildApiOptions["incidentRepository"], incidentExecutor: BuildApiOptions["incidentCreationExecutor"], slaPolicyExecutor: BuildApiOptions["slaPolicyExecutor"], triageAuthoritySource: BuildApiOptions["triageAuthoritySource"], triageAuthorityExecutor: BuildApiOptions["triageAuthorityExecutor"]) => void, executor = options.configurationExecutor) {
  const app = await buildApi({ ...options, configurationExecutor: executor, registerApi: async (instance, dependencies) => { capture(dependencies.configurationExecutor, dependencies.incidentRepository, dependencies.incidentCreationExecutor, dependencies.slaPolicyExecutor, dependencies.triageAuthoritySource, dependencies.triageAuthorityExecutor); await registerApiRoutes(instance, dependencies); } });
  vi.spyOn(app, "listen").mockResolvedValue(undefined);
  return app;
}

describe("API composition lifecycle", () => {
  it("passes one shared production pool to read and mutation adapters", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://shelfops:test@localhost:5432/shelfops"); const sentinel = new Error("connect sentinel");
    const pool = { connect: vi.fn(() => { throw sentinel; }), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined) }; const createPool = vi.fn(() => pool);
    let composed: ConfigurationExecutor | undefined; let registered: ConfigurationExecutor | undefined; let incidentRepository: unknown; let incidentExecutor: unknown; let slaPolicyExecutor: unknown; let triageAuthoritySource: unknown; let triageAuthorityExecutor: unknown; let identityProvider: IdentityProvider | undefined;
    const app = await startApi({ port: "3111", cursorSecret, createPool, buildApi: async (options) => { composed = options.configurationExecutor; identityProvider = options.identityProvider; return registeredApp(options, (executor, repository, incident, slaPolicy, source, triageExecutor) => { registered = executor; incidentRepository = repository; incidentExecutor = incident; slaPolicyExecutor = slaPolicy; triageAuthoritySource = source; triageAuthorityExecutor = triageExecutor; }); } });
    apps.push(app);
    expect(registered).toBe(composed); expect(composed).toBeInstanceOf(PostgresConfigurationExecutor);
    expect(incidentRepository).toBeInstanceOf(PostgresAuthorizedIncidentRepository); if (!(incidentRepository instanceof PostgresAuthorizedIncidentRepository)) throw new Error("registration did not receive the incident repository"); await expect(incidentRepository.list({ id: "00000000-0000-7000-8000-000000000001", active: true, roleScopes: [], grants: [] })).rejects.toBe(sentinel);
    expect(incidentExecutor).toBeInstanceOf(PostgresIncidentCreationExecutor); expect((incidentExecutor as { pool: unknown }).pool).toBe(pool);
    expect(slaPolicyExecutor).toBeInstanceOf(PostgresSlaPolicyExecutor); expect((slaPolicyExecutor as { pool: unknown }).pool).toBe(pool);
    expect(triageAuthoritySource).toBe(incidentRepository);
    expect(triageAuthorityExecutor).toBeInstanceOf(PostgresTriageAuthorityExecutor); expect((triageAuthorityExecutor as { pool: unknown }).pool).toBe(pool);
    if (!(registered instanceof PostgresConfigurationExecutor)) throw new Error("registration did not receive the production executor");
    expect(identityProvider).toMatchObject({ kind: "production" });
    if (!identityProvider) throw new Error("registration did not receive the production identity provider");
    await expect(identityProvider.lookupSession(createOpaqueSessionId())).resolves.toBeUndefined(); expect(pool.query).toHaveBeenCalledOnce();
    await expect(registered.execute(undefined as never, undefined as never)).rejects.toBe(sentinel);
    expect(createPool).toHaveBeenCalledOnce(); expect(pool.connect).toHaveBeenCalledTimes(2);
    await app.close(); expect(pool.end).toHaveBeenCalledOnce();
  });

  it("publishes all triage routes from the composed source and executor", async () => {
    const triage = vi.fn(async () => undefined); const execute = vi.fn(); const decide = vi.fn();
    const source = { triage };
    const app = await buildApi({ configurationExecutor: { execute: vi.fn() }, identityProvider: productionIdentityProvider, incidentRepository: { list: vi.fn(async () => ({ items: [] })), detail: vi.fn(async () => undefined) }, triageAuthoritySource: source, triageAuthorityExecutor: { execute, decide }, cursorSecret } as never);
    apps.push(app);

    const incidentId = "00000000-0000-7000-8000-000000000002";
    const responses = await Promise.all([
      app.inject({ method: "GET", url: `/api/v1/incidents/${incidentId}/triage` }),
      app.inject({ method: "POST", url: `/api/v1/incidents/${incidentId}/triage/evaluations`, payload: { expectedVersion: 1, idempotencyKey: "triage-evaluation-1" } }),
      app.inject({ method: "POST", url: `/api/v1/incidents/${incidentId}/triage/decisions`, payload: { evaluationId: "00000000-0000-7000-8000-000000000003", expectedVersion: 2, idempotencyKey: "triage-decision-1", complete: true, decisions: [{ field: "category", disposition: "confirmed", value: "out-of-stock" }] } })
    ]);
    expect(responses.map((response) => response.statusCode)).toEqual([401, 401, 401]);
    expect(triage).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled(); expect(decide).not.toHaveBeenCalled();

    await app.ready();
    const document = app.swagger() as Record<string, any>;
    expect(Object.keys(document.paths).filter((path) => path.includes("/triage")).sort()).toEqual([
      "/api/v1/incidents/{incidentId}/triage",
      "/api/v1/incidents/{incidentId}/triage/decisions",
      "/api/v1/incidents/{incidentId}/triage/evaluations"
    ]);
    expect(Object.keys(document.paths["/api/v1/incidents/{incidentId}/triage"].get.responses)).toEqual(["200", "400", "401", "404", "503"]);
    for (const path of ["/api/v1/incidents/{incidentId}/triage/evaluations", "/api/v1/incidents/{incidentId}/triage/decisions"]) expect(Object.keys(document.paths[path].post.responses)).toEqual(["201", "400", "401", "403", "404", "409", "503"]);
  });

  it("keeps the published triage contract deterministic and documents its recovery paths", async () => {
    const first = await openApiDocument() as Record<string, any>;
    const second = await openApiDocument() as Record<string, any>;
    expect(first).toEqual(second);
    expect(first).toEqual(JSON.parse(await readFile("openapi/openapi.json", "utf8")));

    const directory = "openapi/examples/triage";
    const names = ["decide-request.json", "decide-response.json", "evaluate-request.json", "evaluate-response.json", "forbidden-response.json", "invalid-transition-response.json", "read-response.json", "stale-version-response.json"];
    expect((await readdir(directory)).sort()).toEqual(names);
    const examples = Object.fromEntries(await Promise.all(names.map(async (name) => [name, JSON.parse(await readFile(`${directory}/${name}`, "utf8"))] as const)));
    expect(examples["evaluate-request.json"]).toMatchObject({ method: "POST", path: "/api/v1/incidents/00000000-0000-7000-8000-000000000002/triage/evaluations", body: { expectedVersion: 1, idempotencyKey: "triage-evaluation-1" } });
    expect(examples["decide-request.json"]).toMatchObject({ method: "POST", path: "/api/v1/incidents/00000000-0000-7000-8000-000000000002/triage/decisions", body: { complete: true, decisions: expect.any(Array) } });
    for (const [name, path, method, status] of [["evaluate-response.json", "/api/v1/incidents/{incidentId}/triage/evaluations", "post", "201"], ["read-response.json", "/api/v1/incidents/{incidentId}/triage", "get", "200"], ["decide-response.json", "/api/v1/incidents/{incidentId}/triage/decisions", "post", "201"], ["forbidden-response.json", "/api/v1/incidents/{incidentId}/triage/decisions", "post", "403"], ["stale-version-response.json", "/api/v1/incidents/{incidentId}/triage/decisions", "post", "409"], ["invalid-transition-response.json", "/api/v1/incidents/{incidentId}/triage/evaluations", "post", "409"]] as const) {
      expect(examples[name]).toMatchObject({ status: Number(status), body: expect.any(Object) });
      expect(first.paths[path][method].responses[status]).toBeDefined();
    }
    const guide = await readFile("docs/triage.md", "utf8");
    for (const requirement of [/session cookie[\s\S]*CSRF/i, /same `idempotencyKey`[\s\S]*replay/i, /stale-version[\s\S]*current version/i, /manual[\s\S]*reason/i, /does not[\s\S]*autonom/i]) expect(guide).toMatch(requirement);
  });

  it("preserves exact external executor ownership", async () => {
    const reads: PropertyKey[] = []; const close = vi.fn(); const end = vi.fn(); const dispose = vi.fn();
    const protectedKeys = new Set<PropertyKey>(["close", "end", Symbol.asyncDispose]);
    const external = new Proxy({ execute: vi.fn(), close, end, [Symbol.asyncDispose]: dispose }, { get(target, key, receiver) { if (protectedKeys.has(key)) reads.push(key); return Reflect.get(target, key, receiver); } });
    let registered: ConfigurationExecutor | undefined; const failure = new Error("listen failed");
    await expect(startApi({ configurationExecutor: external, identityProvider: productionIdentityProvider, cursorSecret, port: "3111", logError: () => undefined, buildApi: async (options) => { const app = await registeredApp(options, (executor) => { registered = executor; }); vi.spyOn(app, "listen").mockRejectedValue(failure); return app; } })).rejects.toBe(failure);
    expect(registered).toBe(external); expect(reads).toEqual([]);
    expect(close).not.toHaveBeenCalled(); expect(end).not.toHaveBeenCalled(); expect(dispose).not.toHaveBeenCalled();
  });

  it("closes partial app and uses pool fallback exactly once", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://shelfops:test@localhost:5432/shelfops"); const failure = new Error("registration failed"); const cleanupFailure = new Error("close failed");
    const pool = { connect: vi.fn(() => { throw new Error("unexpected connect"); }), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined) }; const errors: unknown[] = []; const closed = vi.fn();
    await expect(startApi({ cursorSecret, createPool: vi.fn(() => pool), logError: (error) => errors.push(error), buildApi: (options) => buildApi({ ...options, registerApi: async (app) => { app.addHook("onClose", async () => { closed(); throw cleanupFailure; }); throw failure; } }) })).rejects.toBe(failure);
    expect(closed).toHaveBeenCalledOnce(); expect(pool.end).toHaveBeenCalledOnce();
    expect(errors).toEqual([cleanupFailure, failure]);
  });

  it("requires an explicit production provider with an externally owned executor", async () => {
    const external: ConfigurationExecutor = { execute: vi.fn() }; const app = await buildApi({ configurationExecutor: external }); vi.spyOn(app, "listen").mockResolvedValue(undefined);
    try { const error = await startApi({ configurationExecutor: external, cursorSecret, port: "3111", logError: () => undefined, buildApi: async () => app }).then(() => undefined, (caught: unknown) => caught); expect(error).toBeInstanceOf(Error); expect((error as Error).message).toBe("A production identity provider is required with an external configuration executor"); } finally { await app.close(); }
  });

  it("rejects development identity adapters from production startup", async () => {
    const external: ConfigurationExecutor = { execute: vi.fn() }; let started: Awaited<ReturnType<typeof buildApi>> | undefined;
    try { const error = await startApi({ configurationExecutor: external, identityProvider: createDevelopmentIdentityProvider(() => undefined), cursorSecret, port: "3111", logError: () => undefined, buildApi: async (options) => { started = await buildApi(options); vi.spyOn(started, "listen").mockResolvedValue(undefined); return started; } }).then(() => undefined, (caught: unknown) => caught); expect(error).toBeInstanceOf(Error); expect((error as Error).message).toBe("Development identity adapters cannot run in production"); } finally { await started?.close(); }
  });
});
