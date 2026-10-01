import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi } from "../src/app.js";
import { bindShutdownSignals, createLifecycle, shutdownWithin } from "../src/lifecycle.js";
import { createApiLogger, validateLogLevel } from "../src/logging.js";
import { startApi } from "../src/startup.js";

const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

function capture(options: { level?: string; redact?: readonly string[] } = {}) {
  const lines: string[] = [];
  const logger = createApiLogger({ environment: "test", release: "test-release", level: options.level ?? "debug", redact: options.redact, write: (line) => lines.push(line) });
  return { logger, records: () => lines.map((line) => JSON.parse(line)) };
}

describe("production API logging", () => {
  it("logs a 5xx message and stack while omitting query, body, header, and nested secrets", async () => {
    const { logger, records } = capture();
    const canary = "NEVER_LOG_THIS_CANARY";
    const app = await buildApi({ configurationExecutor: { execute: vi.fn() }, logger, registerApi: async (instance) => { instance.post("/boom", async () => { throw new Error("internal boom"); }); } }); apps.push(app);

    const response = await app.inject({ method: "POST", url: `/boom?token=${canary}`, headers: { "x-correlation-id": "trace-123", authorization: canary, cookie: `session=${canary}` }, payload: { nested: { password: canary } } });
    const captured = records();
    const request = captured.find((record) => record.event === "request.completed");
    const failure = captured.find((record) => record.event === "request.failed");

    expect(response.headers["x-correlation-id"]).toBe("trace-123");
    expect(request).toMatchObject({ event: "request.completed", level: "info", service: "shelfops-api", release: "test-release", environment: "test", correlationId: "trace-123", method: "POST", path: "/boom", statusCode: 503 });
    expect(failure).toMatchObject({ event: "request.failed", level: "error", statusCode: 503, error: { type: "Error", message: "internal boom" } });
    expect(failure.error.stack).toContain("internal boom");
    expect(request).toHaveProperty("requestId"); expect(request).toHaveProperty("timestamp"); expect(request).toHaveProperty("elapsedMs");
    expect(JSON.stringify(captured)).not.toContain(canary);
  });

  it("redacts configured secrets from messages and stacks and drops nested sensitive keys", () => {
    const { logger, records } = capture({ redact: ["SECRET_CANARY"] });
    logger.info("redaction.probe", { safe: "kept", nested: { DATABASE_URL: "SECRET_CANARY", cursor_secret: "SECRET_CANARY", Password: "SECRET_CANARY", sessionId: "SECRET_CANARY", raw_sql: "SECRET_CANARY" } });
    logger.error("startup.failed", Object.assign(new Error("failed SECRET_CANARY"), { code: "ECONNREFUSED", config: { DATABASE_URL: "SECRET_CANARY", rawSql: "SECRET_CANARY" }, token: "SECRET_CANARY" }));
    const failure = records()[1];
    expect(records()[0]).toMatchObject({ safe: "kept", nested: {} });
    expect(failure).toMatchObject({ event: "startup.failed", level: "error", error: { type: "Error", code: "ECONNREFUSED", message: "failed [redacted]" } });
    expect(failure.error.stack).toContain("[redacted]");
    expect(failure).not.toHaveProperty("config");
    expect(JSON.stringify(records())).not.toContain("SECRET_CANARY");
  });

  it("logs 4xx rejections at warn, request entry at debug, and respects the configured level", async () => {
    const { logger, records } = capture();
    const app = await buildApi({ configurationExecutor: { execute: vi.fn() }, logger, registerApi: async (instance) => { instance.get("/missing-thing", async () => { throw new Error("not-found"); }); } }); apps.push(app);

    const response = await app.inject({ method: "GET", url: "/missing-thing" });
    expect(response.statusCode).toBe(404);
    expect(records()).toContainEqual(expect.objectContaining({ event: "request.rejected", level: "warn", statusCode: 404 }));
    expect(records()).toContainEqual(expect.objectContaining({ event: "request.received", level: "debug", path: "/missing-thing" }));

    const quiet = capture({ level: "info" });
    quiet.logger.debug("debug.hidden", {});
    quiet.logger.warn("warn.visible", {});
    quiet.logger.info("info.visible", {});
    expect(quiet.records().map((record) => record.event)).toEqual(["warn.visible", "info.visible"]);
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
