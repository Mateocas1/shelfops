import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi } from "../src/app.js";
import { createMetrics, validateMetricsCredential } from "../src/metrics.js";
import { startApi } from "../src/startup.js";

const credential = "metrics-contract-bearer-token-32-bytes";
const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.unstubAllEnvs(); });

function metricApp(overrides: Partial<Parameters<typeof createMetrics>[0]> = {}) {
  const readiness = { isDraining: () => false, probe: vi.fn().mockResolvedValue(undefined) };
  const metrics = createMetrics({ credential, environment: "test", release: "release-1", readiness, pool: () => ({ total: 4, idle: 3, waiting: 1 }), ...overrides });
  return buildApi({ configurationExecutor: { execute: vi.fn() }, metrics, registerApi: async (app) => {
    app.get("/items/:itemId", async () => ({ ok: true }));
    app.get("/failure", async (_request, reply) => reply.code(500).send({ status: "failed" }));
  } });
}

describe("production metrics", () => {
  it("validates the dedicated credential before production startup", async () => {
    expect(() => validateMetricsCredential("short")).toThrow("METRICS_BEARER_TOKEN must contain at least 32 bytes");
    const build = vi.fn();
    await expect(startApi({ configurationExecutor: { execute: vi.fn() }, identityProvider: { kind: "production", lookupSession: vi.fn() }, dependencyProbe: async () => undefined, cursorSecret: credential, metricsCredential: "short", metricsDiagnostics: () => ({ total: 0, idle: 0, waiting: 0 }), buildApi: build, logError: () => undefined })).rejects.toThrow("METRICS_BEARER_TOKEN");
    expect(build).not.toHaveBeenCalled();
  });

  it("keeps a hidden scrape endpoint behind stable bearer responses", async () => {
    const app = await metricApp(); apps.push(app); await app.ready();
    expect(await app.inject("/metrics")).toMatchObject({ statusCode: 401, body: "Unauthorized\n" });
    expect(await app.inject({ url: "/metrics", headers: { authorization: "Bearer wrong" } })).toMatchObject({ statusCode: 401, body: "Unauthorized\n" });
    const response = await app.inject({ url: "/metrics", headers: { authorization: `Bearer ${credential}` } });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/plain; version=0.0.4; charset=utf-8");
    expect((app.swagger() as { paths: object }).paths).not.toHaveProperty("/metrics");
  });

  it("renders deterministic bounded request, histogram, error, pool, and process metrics", async () => {
    const canary = "CANARY-NOT-IN-METRICS"; const app = await metricApp(); apps.push(app);
    await app.inject(`/items/${canary}?sessionId=${canary}`);
    await app.inject({ method: "GET", url: `/missing/${canary}`, headers: { "x-correlation-id": canary } });
    await app.inject("/failure");
    const scrape = async () => (await app.inject({ url: "/metrics", headers: { authorization: `Bearer ${credential}` } })).body;
    const first = await scrape(); const second = await scrape();
    const shape = (body: string) => body.split("\n").map((line) => line.replace(/ (?:\d+(?:\.\d+)?(?:e[+-]?\d+)?)$/, " <value>"));
    expect(shape(first)).toEqual(shape(second));
    expect(first).toContain('shelfops_http_requests_total{method="GET",route="/items/:itemId",status_class="2xx"} 1');
    expect(first).toContain('shelfops_http_requests_total{method="GET",route="__unmatched__",status_class="4xx"} 1');
    expect(first).toContain('shelfops_http_errors_total{method="GET",route="/failure",status_class="5xx"} 1');
    expect(first).toContain('shelfops_http_request_duration_seconds_bucket{le="+Inf",method="GET",route="/items/:itemId"} 1');
    expect(first).toContain("shelfops_postgresql_pool_total 4"); expect(first).toContain("shelfops_postgresql_pool_idle 3"); expect(first).toContain("shelfops_postgresql_pool_waiting 1");
    expect(first).toContain('shelfops_build_info{environment="test",release="release-1"} 1');
    expect(first).toMatch(/process_uptime_seconds \d/); expect(first).toMatch(/process_resident_memory_bytes \d/);
    expect(first).not.toContain(canary); expect(first).not.toContain('route="/metrics"');
  });

  it("stays scrapeable and reports not ready when the dependency is down or draining", async () => {
    const canary = "database-password-canary"; const draining = vi.fn(() => false);
    const app = await metricApp({ readiness: { isDraining: draining, probe: vi.fn().mockRejectedValue(new Error(canary)) } }); apps.push(app);
    let body = (await app.inject({ url: "/metrics", headers: { authorization: `Bearer ${credential}` } })).body;
    expect(body).toContain("shelfops_readiness 0"); expect(body).toContain("shelfops_draining 0"); expect(body).not.toContain(canary);
    draining.mockReturnValue(true);
    body = (await app.inject({ url: "/metrics", headers: { authorization: `Bearer ${credential}` } })).body;
    expect(body).toContain("shelfops_readiness 0"); expect(body).toContain("shelfops_draining 1");
  });
});
