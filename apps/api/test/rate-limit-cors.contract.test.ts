import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi, type BuildApiOptions } from "../src/app.js";

const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });

async function appWith(routes: (instance: FastifyInstance) => Promise<void>, options: Partial<BuildApiOptions> = {}): Promise<FastifyInstance> {
  const app = await buildApi({ configurationExecutor: { execute: vi.fn() }, registerApi: routes, ...options });
  apps.push(app);
  return app;
}

describe("API rate limiting", () => {
  it("returns 429 after the configured maximum and exempts health", async () => {
    const app = await appWith(async (instance) => {
      instance.get("/health", async () => ({ status: "ok" }));
      instance.get("/limited", async () => ({ ok: true }));
    }, { rateLimit: { max: 2, timeWindow: 60_000 } });

    expect((await app.inject("/limited")).statusCode).toBe(200);
    expect((await app.inject("/limited")).statusCode).toBe(200);
    const limited = await app.inject("/limited");
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["content-type"]).toContain("application/json");
    expect(limited.json()).toMatchObject({ code: "rate-limit-exceeded" });
    for (let attempt = 0; attempt < 5; attempt += 1) expect((await app.inject("/health")).statusCode).toBe(200);
  });
});

describe("API CORS policy", () => {
  it("denies cross-origin requests by default", async () => {
    const app = await appWith(async (instance) => { instance.get("/data", async () => ({ ok: true })); });
    const response = await app.inject({ method: "GET", url: "/data", headers: { origin: "https://evil.example" } });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows only configured origins and answers their preflight", async () => {
    const app = await appWith(async (instance) => { instance.get("/data", async () => ({ ok: true })); }, { cors: { allowedOrigins: ["https://app.example"] } });

    const allowed = await app.inject({ method: "GET", url: "/data", headers: { origin: "https://app.example" } });
    expect(allowed.headers["access-control-allow-origin"]).toBe("https://app.example");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");

    const denied = await app.inject({ method: "GET", url: "/data", headers: { origin: "https://evil.example" } });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();

    const preflight = await app.inject({ method: "OPTIONS", url: "/data", headers: { origin: "https://app.example", "access-control-request-method": "GET" } });
    expect(preflight.statusCode).toBeLessThan(300);
    expect(preflight.headers["access-control-allow-origin"]).toBe("https://app.example");
  });
});
