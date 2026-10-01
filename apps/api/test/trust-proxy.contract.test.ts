import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildApi } from "../src/app.js";
import { startApi } from "../src/startup.js";

const apps: FastifyInstance[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); vi.unstubAllEnvs(); });

async function clientAddressApp(trustProxy: false | number): Promise<FastifyInstance> {
  const app = await buildApi({
    configurationExecutor: { execute: vi.fn() },
    trustProxy,
    registerApi: async (instance) => { instance.get("/whereami", async (request) => ({ ip: request.ip })); }
  });
  apps.push(app);
  return app;
}

describe("trustProxy", () => {
  it("resolves the client address from X-Forwarded-For when enabled", async () => {
    const app = await clientAddressApp(1);
    const response = await app.inject({ method: "GET", url: "/whereami", headers: { "x-forwarded-for": "203.0.113.7" } });

    expect(response.json()).toEqual({ ip: "203.0.113.7" });
  });

  it("ignores a client-forged X-Forwarded-For prefix behind one trusted hop", async () => {
    const app = await clientAddressApp(1);
    // The client sends a forged address; the load balancer appends the real one.
    const response = await app.inject({ method: "GET", url: "/whereami", headers: { "x-forwarded-for": "198.51.100.66, 203.0.113.7" } });

    expect(response.json()).toEqual({ ip: "203.0.113.7" });
  });

  it("ignores X-Forwarded-For when disabled", async () => {
    const app = await clientAddressApp(false);
    const response = await app.inject({ method: "GET", url: "/whereami", headers: { "x-forwarded-for": "203.0.113.7" } });

    expect(response.json()).toEqual({ ip: "127.0.0.1" });
  });

  it("passes the environment-derived setting into buildApi", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://shelfops:test@localhost:5432/shelfops");
    vi.stubEnv("TRUST_PROXY", "true");
    let received: { trustProxy?: false | number } | undefined;
    const pool = { connect: vi.fn(() => { throw new Error("Unexpected pool.connect invocation"); }), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined) };

    const app = await startApi({
      cursorSecret: "trust-proxy-contract-secret-32-bytes",
      createPool: () => pool,
      port: "3111",
      buildApi: async (options) => { received = options; return { listen: async () => undefined, close: async () => undefined } as never; }
    });

    expect(received?.trustProxy).toBe(1);
    await app.close();
  });
});
