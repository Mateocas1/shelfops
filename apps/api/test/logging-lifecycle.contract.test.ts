import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi } from "../src/app.js";
import { bindShutdownSignals, createLifecycle, shutdownWithin } from "../src/lifecycle.js";
import { createApiLogger, validateLogLevel } from "../src/logging.js";
import { startApi } from "../src/startup.js";

const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

function capture() {
  const lines: string[] = [];
  const logger = createApiLogger({ environment: "test", release: "test-release", level: "debug", write: (line) => lines.push(line) });
  return { logger, records: () => lines.map((line) => JSON.parse(line)) };
}

describe("production API logging", () => {
  it("emits safe request JSON with correlation and no query, body, or nested secrets", async () => {
    const { logger, records } = capture();
    const canary = "NEVER_LOG_THIS_CANARY";
    const app = await buildApi({ configurationExecutor: { execute: vi.fn() }, logger, registerApi: async (instance) => { instance.post("/boom", async () => { throw new Error(canary); }); } }); apps.push(app);

    const response = await app.inject({ method: "POST", url: `/boom?token=${canary}`, headers: { "x-correlation-id": "trace-123", authorization: canary, cookie: `session=${canary}` }, payload: { nested: { password: canary } } });
    const request = records().find((record) => record.event === "request.completed");

    expect(response.headers["x-correlation-id"]).toBe("trace-123");
    expect(request).toMatchObject({ event: "request.completed", level: "info", service: "shelfops-api", release: "test-release", environment: "test", correlationId: "trace-123", method: "POST", path: "/boom", statusCode: 503 });
    expect(records()).toContainEqual(expect.objectContaining({ event: "request.failed", error: { type: "Error", message: "Request failed" } }));
    expect(request).toHaveProperty("requestId"); expect(request).toHaveProperty("timestamp"); expect(request).toHaveProperty("elapsedMs");
    expect(JSON.stringify(records())).not.toContain(canary);
  });

  it("redacts nested sensitive keys and serializes only safe error fields", () => {
    const { logger, records } = capture(); const canary = "SECRET_CANARY";
    logger.info("redaction.probe", { safe: "kept", nested: { DATABASE_URL: canary, cursor_secret: canary, Password: canary, sessionId: canary, raw_sql: canary } });
    logger.error("startup.failed", Object.assign(new Error(`failed ${canary}`), { code: "ECONNREFUSED", config: { DATABASE_URL: canary, rawSql: canary }, token: canary }));
    const record = records()[1];
    expect(record).toMatchObject({ event: "startup.failed", error: { type: "Error", code: "ECONNREFUSED", message: "Startup failed" } });
    expect(records()[0]).toMatchObject({ safe: "kept", nested: {} });
    expect(JSON.stringify(records())).not.toContain(canary); expect(record).not.toHaveProperty("config");
  });

  it("rejects invalid levels before listening and emits a safe startup failure", async () => {
    expect(() => validateLogLevel("verbose")).toThrow("LOG_LEVEL must be one of");
    const { logger, records } = capture(); const listen = vi.fn();
    await expect(startApi({ logLevel: "verbose", logger, cursorSecret: "logging-contract-cursor-secret-32-bytes", buildApi: async () => ({ listen } as never) })).rejects.toThrow("LOG_LEVEL must be one of");
    expect(listen).not.toHaveBeenCalled(); expect(records()).toEqual([expect.objectContaining({ event: "startup.failed" })]);
  });

  it("emits one terminal lifecycle event for repeated signals", async () => {
    const { logger, records } = capture(); const signals = new EventEmitter(); const lifecycle = createLifecycle();
    bindShutdownSignals(signals, () => shutdownWithin(lifecycle.beginDrain, async () => undefined, 100, logger), () => undefined);
    signals.emit("SIGTERM"); signals.emit("SIGINT");
    await vi.waitFor(() => expect(records().some((record) => record.event === "shutdown.completed")).toBe(true));
    expect(records().filter((record) => record.event === "shutdown.begin")).toHaveLength(1);
    expect(records().filter((record) => record.event === "shutdown.completed")).toHaveLength(1);
  });
});
