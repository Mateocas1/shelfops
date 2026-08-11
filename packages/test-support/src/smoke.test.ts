import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi } from "../../../apps/api/src/app.js";
import { parsePort, startApi } from "../../../apps/api/src/startup.js";

describe("workspace smoke", () => {
  const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
  const configurationExecutor = { execute: vi.fn() };
  const productionIdentityProvider = { kind: "production" as const, lookupSession: async () => undefined };
  const cursorSecret = "workspace-smoke-cursor-secret-32-bytes";

  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    vi.unstubAllEnvs();
  });

  it("serves the health route", async () => {
    const app = await buildApi({ configurationExecutor });
    apps.push(app);

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("accepts a complete TCP port value", () => {
    expect(parsePort("3111")).toBe(3111);
  });

  it.each(["3111oops", "0", "65536"])("rejects invalid PORT value %s", (port) => {
    expect(() => parsePort(port)).toThrow("PORT must be a TCP port between 1 and 65535");
  });

  it("reports startup failures through an enabled diagnostic sink and closes the app", async () => {
    const app = await buildApi({ configurationExecutor });
    const startupFailure = new Error("address unavailable");
    const close = vi.spyOn(app, "close");
    const diagnostics: unknown[] = [];

    vi.spyOn(app, "listen").mockRejectedValue(startupFailure);

    await expect(
      startApi({
        configurationExecutor,
        identityProvider: productionIdentityProvider,
        dependencyProbe: async () => undefined,
        cursorSecret,
        port: "3111",
        buildApi: async () => app,
        logError: (error) => diagnostics.push(error)
      })
    ).rejects.toBe(startupFailure);

    expect(diagnostics).toEqual([startupFailure]);
    expect(close).toHaveBeenCalledOnce();
  });

  it("retains an injected executor while existing requests allocate no owned pool", async () => {
    const injectedExecutor = { execute: vi.fn() };
    const createPool = vi.fn();
    let receivedOptions: unknown;
    const app = await buildApi({ configurationExecutor: injectedExecutor });
    apps.push(app);
    vi.spyOn(app, "listen").mockResolvedValue(undefined);

    await startApi({
      configurationExecutor: injectedExecutor,
      identityProvider: productionIdentityProvider,
      dependencyProbe: async () => undefined,
      cursorSecret,
      createPool,
      port: "3111",
      buildApi: async (options) => {
        receivedOptions = options;
        return app;
      }
    });

    expect(receivedOptions).toMatchObject({ configurationExecutor: injectedExecutor });
    expect((await app.inject("/health")).json()).toEqual({ status: "ok" });
    expect((await app.inject("/api/v1/me")).statusCode).toBe(401);
    expect(createPool).not.toHaveBeenCalled();
  });

  it("closes one owned pool once across repeated and concurrent API closes", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://shelfops:test@localhost:5432/shelfops");
    const pool = { connect: vi.fn(() => { throw new Error("Unexpected pool.connect invocation"); }), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined) };
    const createPool = vi.fn(() => pool);
    const app = await startApi({
      cursorSecret,
      createPool,
      port: "3111",
      buildApi: async (options) => {
        const built = await buildApi(options);
        vi.spyOn(built, "listen").mockResolvedValue(undefined);
        return built;
      }
    });

    await Promise.all([app.close(), app.close(), app.close()]);

    expect(createPool).toHaveBeenCalledOnce();
    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("closes an owned pool once when registration fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://shelfops:test@localhost:5432/shelfops");
    const failure = new Error("registration failed");
    const pool = { connect: vi.fn(() => { throw new Error("Unexpected pool.connect invocation"); }), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined) };

    await expect(startApi({
      cursorSecret,
      createPool: vi.fn(() => pool),
      buildApi: async (options) => buildApi({
        ...options,
        registerApi: async () => { throw failure; }
      })
    })).rejects.toBe(failure);

    expect(pool.end).toHaveBeenCalledOnce();
  });

  it("closes an owned pool once when listen fails after registration", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://shelfops:test@localhost:5432/shelfops");
    const failure = new Error("address unavailable");
    const pool = { connect: vi.fn(() => { throw new Error("Unexpected pool.connect invocation"); }), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined) };

    await expect(startApi({
      cursorSecret,
      createPool: vi.fn(() => pool),
      port: "3111",
      buildApi: async (options) => {
        const app = await buildApi(options);
        vi.spyOn(app, "listen").mockRejectedValue(failure);
        return app;
      }
    })).rejects.toBe(failure);

    expect(pool.end).toHaveBeenCalledOnce();
  });
});
