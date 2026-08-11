import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { describe, expect, it, vi } from "vitest";

import { registerOidcRoutes, type OidcRouteDependencies } from "../src/auth/oidc-routes.js";
import { startApi } from "../src/startup.js";

const sessionId = "s".repeat(43);
const csrfToken = "c".repeat(43);
const principal = { id: "user-1", active: true, roleScopes: [], grants: [] };
const config = {
  issuer: new URL("https://issuer.example.com"), clientId: "client", clientSecret: "secret",
  callbackUrl: new URL("https://shelfops.example.com/auth/callback"),
  destinationUrl: new URL("https://shelfops.example.com/incidents"),
  organizationId: "123e4567-e89b-42d3-a456-426614174000", sessionTtlSeconds: 3600,
  providerTimeoutSeconds: 5, allowInsecureRequests: false
};

function dependencies(revoke = vi.fn(async () => ({ kind: "revoked" as const }))): OidcRouteDependencies {
  return {
    config, revoke,
    identityProvider: { kind: "production", lookupSession: vi.fn(async (id) => id === sessionId ? { id, expiresAt: Date.now() + 60_000, principal, matchesCsrfToken: (value: string) => value === csrfToken } : undefined) },
    protocol: { begin: vi.fn(), exchange: vi.fn(), close: vi.fn() },
    persistence: { beginAuthorization: vi.fn(), consumeAuthorization: vi.fn(), findMappedUser: vi.fn(), createSession: vi.fn() }
  };
}

async function appFor(input: OidcRouteDependencies) { const app = Fastify(); await registerOidcRoutes(app, input); return app; }
const logout = (app: FastifyInstance, token = csrfToken) => app.inject({ method: "POST", url: "/auth/logout", headers: { cookie: `shelfops_session=${sessionId}; shelfops_csrf=${csrfToken}`, "x-csrf-token": token } });

describe("OIDC logout and runtime boundary", () => {
  it("revokes under configured authority before expiring both cookies", async () => {
    const input = dependencies(); const app = await appFor(input); const response = await logout(app);
    expect(response.statusCode).toBe(204);
    expect(input.revoke).toHaveBeenCalledWith(sessionId, principal.id);
    expect(response.headers["set-cookie"]).toEqual([
      expect.stringMatching(/^shelfops_session=; Max-Age=0; Path=\/; HttpOnly; Secure; SameSite=Lax$/),
      expect.stringMatching(/^shelfops_csrf=; Max-Age=0; Path=\/; Secure; SameSite=Lax$/)
    ]);
    await app.close();
  });

  it.each([
    ["bad-csrf", undefined, 403],
    [csrfToken, { kind: "not-found" }, 401],
    [csrfToken, new Error("token=secret"), 503]
  ] as const)("withholds cookie expiry for every failed revocation outcome %#", async (token, outcome, status) => {
    const revoke = outcome instanceof Error ? vi.fn().mockRejectedValue(outcome) : vi.fn(async () => outcome ?? { kind: "revoked" as const });
    const input = dependencies(revoke); const app = await appFor(input); const response = await logout(app, token);
    expect(response.statusCode).toBe(status); expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body).not.toMatch(/secret|token|s{43}|c{43}/); await app.close();
  });

  it("keeps the runtime proof fixed, bounded, shell-free, and cleanup-safe", async () => {
    const source = await readFile("scripts/prove-oidc-runtime.ts", "utf8");
    expect(source).toContain('const COMPOSE = "infra/compose.oidc.yml"');
    expect(source).toContain('const PROJECT = "shelfops-oidc-proof"');
    expect(source).toMatch(/spawn\("docker", \["compose", "--project-name", PROJECT, "--file", COMPOSE/);
    expect(source).toContain("shell: false"); expect(source).toContain("finally"); expect(source).toContain("AbortSignal.timeout");
    expect(source).not.toMatch(/access_token|refresh_token|provider logout|setTimeout\([^,]+\)/i);
  });

  it("composes OIDC from the shared pool and closes protocol and pool once", async () => {
    vi.stubEnv("DATABASE_URL", "postgres://proof:proof@127.0.0.1/proof");
    const pool = { connect: vi.fn(), query: vi.fn().mockResolvedValue({ rows: [] }), end: vi.fn().mockResolvedValue(undefined), on: vi.fn() };
    const close = vi.fn().mockResolvedValue(undefined); let captured: OidcRouteDependencies | undefined; let closeOwned: (() => Promise<void>) | undefined;
    const app = { listen: vi.fn().mockResolvedValue(undefined), close: vi.fn(async () => closeOwned?.()) };
    const environment = { SHELFOPS_OIDC_ISSUER: "http://127.0.0.1:18080/default", SHELFOPS_OIDC_CLIENT_ID: "client", SHELFOPS_OIDC_CLIENT_SECRET: "secret", SHELFOPS_OIDC_CALLBACK_URL: "http://127.0.0.1:18181/auth/callback", SHELFOPS_OIDC_DESTINATION_URL: "http://127.0.0.1:18181/complete", SHELFOPS_OIDC_ORGANIZATION_ID: config.organizationId, SHELFOPS_OIDC_SESSION_TTL_SECONDS: "60", SHELFOPS_OIDC_PROVIDER_TIMEOUT_SECONDS: "5" };
    const started = await startApi({ cursorSecret: "oidc-runtime-contract-secret-32-bytes", createPool: () => pool as never, oidcEnvironment: environment, allowOidcLoopbackHttp: true, createOidcProtocol: vi.fn(async () => ({ begin: vi.fn(), exchange: vi.fn(), close })), buildApi: vi.fn(async (options) => { captured = options.oidc; closeOwned = options.closeOwnedResource; return app as never; }) });
    expect(captured?.identityProvider).toBeDefined(); expect(captured?.revoke).toBeTypeOf("function"); expect(pool.query).toHaveBeenCalledWith("SELECT 1");
    await started.close(); await started.close(); expect(close).toHaveBeenCalledOnce(); expect(pool.end).toHaveBeenCalledOnce(); vi.unstubAllEnvs();
  });
});
