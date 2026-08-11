import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi } from "../src/app.js";
import { bindShutdownSignals, createLifecycle, shutdownWithin } from "../src/lifecycle.js";
import { startApi } from "../src/startup.js";

const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.unstubAllEnvs(); vi.useRealTimers(); });
const cursorSecret = "readiness-shutdown-cursor-secret-32-bytes";

describe("API readiness and shutdown", () => {
  it("keeps liveness unconditional while readiness probes the dependency", async () => {
    const probe = vi.fn().mockResolvedValue(undefined);
    const app = await buildApi({ configurationExecutor: { execute: vi.fn() }, readiness: { isDraining: () => false, probe } }); apps.push(app);

    expect((await app.inject("/health")).json()).toEqual({ status: "ok" });
    expect(await app.inject("/ready")).toMatchObject({ statusCode: 200 });
    expect((await app.inject("/ready")).json()).toEqual({ status: "ready" });
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("returns one closed 503 contract when PostgreSQL is down or draining", async () => {
    const dependencyDown = await buildApi({ configurationExecutor: { execute: vi.fn() }, readiness: { isDraining: () => false, probe: vi.fn().mockRejectedValue(new Error("password leaked")) } }); apps.push(dependencyDown);
    const lifecycle = createLifecycle();
    const draining = await buildApi({ configurationExecutor: { execute: vi.fn() }, readiness: { ...lifecycle, probe: vi.fn() } }); apps.push(draining); lifecycle.beginDrain();

    for (const app of [dependencyDown, draining]) {
      const response = await app.inject("/ready");
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: "unavailable" });
    }
  });

  it("proves the owned pool before listen and closes it after probe failure", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://unused"); const failure = new Error("database down");
    const pool = { connect: vi.fn(), query: vi.fn().mockRejectedValue(failure), end: vi.fn().mockResolvedValue(undefined) };
    const listen = vi.fn();
    await expect(startApi({ cursorSecret, createPool: () => pool, logError: () => undefined, buildApi: async (options) => { const app = await buildApi(options); vi.spyOn(app, "listen").mockImplementation(listen); return app; } })).rejects.toBe(failure);
    expect(pool.query).toHaveBeenCalledWith("SELECT 1"); expect(listen).not.toHaveBeenCalled(); expect(pool.end).toHaveBeenCalledOnce();
  });

  it("refuses to listen for external production composition without an injected probe", async () => {
    const build = vi.fn();
    await expect(startApi({ configurationExecutor: { execute: vi.fn() }, identityProvider: { kind: "production", lookupSession: vi.fn() }, cursorSecret, buildApi: build, logError: () => undefined })).rejects.toThrow("A production dependency probe is required");
    expect(build).not.toHaveBeenCalled();
  });

  it("drains once for concurrent signals and removes every listener", async () => {
    const signals = new EventEmitter(); const lifecycle = createLifecycle(); let release!: () => void;
    const close = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const forcedFailure = vi.fn(); bindShutdownSignals(signals, () => shutdownWithin(lifecycle.beginDrain, close, 1000), forcedFailure);

    signals.emit("SIGTERM"); signals.emit("SIGINT");
    expect(lifecycle.isDraining()).toBe(true); expect(close).toHaveBeenCalledOnce();
    expect(signals.listenerCount("SIGTERM")).toBe(0); expect(signals.listenerCount("SIGINT")).toBe(0);
    release(); await vi.waitFor(() => expect(forcedFailure).not.toHaveBeenCalled());
  });

  it("reports forced failure at the deadline without leaking its timer", async () => {
    vi.useFakeTimers(); const beginDrain = vi.fn();
    const result = shutdownWithin(beginDrain, () => new Promise<void>(() => undefined), 25);
    await vi.advanceTimersByTimeAsync(25);
    await expect(result).resolves.toBe(false); expect(beginDrain).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  });
});
