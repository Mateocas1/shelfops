import { afterEach, describe, expect, it, vi } from "vitest";
import type { ConfigurationExecutor } from "@shelfops/application/ports/configuration-executor";
import { createDevelopmentIdentityProvider, createOpaqueSessionId } from "@shelfops/application/identity/session";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import { PostgresIncidentCreationExecutor } from "@shelfops/infrastructure/incidents/postgres-incident-creation-executor";
import { PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";
import { PostgresConfigurationExecutor } from "@shelfops/infrastructure/reference-data/postgres-configuration-executor";
import { PostgresSlaPolicyExecutor } from "@shelfops/infrastructure/postgres/sla-policy-executor";
import { buildApi, type BuildApiOptions } from "../src/app.js";
import { registerApiRoutes } from "../src/routes/register.js";
import { startApi } from "../src/startup.js";

const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.unstubAllEnvs(); });
const productionIdentityProvider: IdentityProvider = { kind: "production", lookupSession: async () => undefined };
const cursorSecret = "composition-lifecycle-cursor-secret-32-bytes";
async function registeredApp(options: BuildApiOptions, capture: (executor: ConfigurationExecutor, incidentRepository: BuildApiOptions["incidentRepository"], incidentExecutor: BuildApiOptions["incidentCreationExecutor"], slaPolicyExecutor: BuildApiOptions["slaPolicyExecutor"]) => void, executor = options.configurationExecutor) {
  const app = await buildApi({ ...options, configurationExecutor: executor, registerApi: async (instance, dependencies) => { capture(dependencies.configurationExecutor, dependencies.incidentRepository, dependencies.incidentCreationExecutor, dependencies.slaPolicyExecutor); await registerApiRoutes(instance, dependencies); } });
  vi.spyOn(app, "listen").mockResolvedValue(undefined);
  return app;
}

describe("API composition lifecycle", () => {
  it("passes one shared production pool to read and mutation adapters", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://shelfops:test@localhost:5432/shelfops"); const sentinel = new Error("connect sentinel");
    const pool = { connect: vi.fn(() => { throw sentinel; }), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined) }; const createPool = vi.fn(() => pool);
    let composed: ConfigurationExecutor | undefined; let registered: ConfigurationExecutor | undefined; let incidentRepository: unknown; let incidentExecutor: unknown; let slaPolicyExecutor: unknown; let identityProvider: IdentityProvider | undefined;
    const app = await startApi({ port: "3111", cursorSecret, createPool, buildApi: async (options) => { composed = options.configurationExecutor; identityProvider = options.identityProvider; return registeredApp(options, (executor, repository, incident, slaPolicy) => { registered = executor; incidentRepository = repository; incidentExecutor = incident; slaPolicyExecutor = slaPolicy; }); } });
    apps.push(app);
    expect(registered).toBe(composed); expect(composed).toBeInstanceOf(PostgresConfigurationExecutor);
    expect(incidentRepository).toBeInstanceOf(PostgresAuthorizedIncidentRepository); if (!(incidentRepository instanceof PostgresAuthorizedIncidentRepository)) throw new Error("registration did not receive the incident repository"); await expect(incidentRepository.list({ id: "00000000-0000-7000-8000-000000000001", active: true, roleScopes: [], grants: [] })).rejects.toBe(sentinel);
    expect(incidentExecutor).toBeInstanceOf(PostgresIncidentCreationExecutor); expect((incidentExecutor as { pool: unknown }).pool).toBe(pool);
    expect(slaPolicyExecutor).toBeInstanceOf(PostgresSlaPolicyExecutor); expect((slaPolicyExecutor as { pool: unknown }).pool).toBe(pool);
    if (!(registered instanceof PostgresConfigurationExecutor)) throw new Error("registration did not receive the production executor");
    expect(identityProvider).toMatchObject({ kind: "production" });
    if (!identityProvider) throw new Error("registration did not receive the production identity provider");
    await expect(identityProvider.lookupSession(createOpaqueSessionId())).resolves.toBeUndefined(); expect(pool.query).toHaveBeenCalledOnce();
    await expect(registered.execute(undefined as never, undefined as never)).rejects.toBe(sentinel);
    expect(createPool).toHaveBeenCalledOnce(); expect(pool.connect).toHaveBeenCalledTimes(2);
    await app.close(); expect(pool.end).toHaveBeenCalledOnce();
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
