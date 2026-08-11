import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";

import { buildApi } from "../src/app.js";
import { openApiDocument, registerApiFoundation } from "../src/openapi.js";
import { registerOidcRoutes, type OidcLoginPersistence } from "../src/auth/oidc-routes.js";
import type { OidcProtocol } from "../src/auth/oidc-client.js";

const config = {
  issuer: new URL("https://issuer.example.com"), clientId: "client", clientSecret: "secret",
  callbackUrl: new URL("https://shelfops.example.com/auth/callback"),
  destinationUrl: new URL("https://shelfops.example.com/incidents"),
  organizationId: "123e4567-e89b-42d3-a456-426614174000", sessionTtlSeconds: 3600,
  providerTimeoutSeconds: 5, allowInsecureRequests: false
};

function dependencies(overrides: Partial<{ protocol: OidcProtocol; persistence: OidcLoginPersistence }> = {}) {
  const protocol: OidcProtocol = overrides.protocol ?? {
    begin: vi.fn(async () => ({ authorizationUrl: new URL("https://issuer.example.com/authorize?code_challenge_method=S256"), state: "state", nonce: "nonce", verifier: "v".repeat(43) })),
    exchange: vi.fn(async () => ({ issuer: config.issuer.href.replace(/\/$/, ""), subject: "subject", role: "admin" })),
    close: vi.fn()
  };
  const persistence = overrides.persistence ?? {
    beginAuthorization: vi.fn(async () => ({ kind: "started" as const })),
    consumeAuthorization: vi.fn(async () => ({ kind: "consumed" as const, issuer: config.issuer.href.replace(/\/$/, ""), nonce: "nonce", pkceVerifier: "v".repeat(43) })),
    findMappedUser: vi.fn(async () => ({ kind: "mapped" as const, userId: "user-1" })),
    createSession: vi.fn(async () => ({ kind: "created" as const, sessionId: "s".repeat(43), csrfToken: "c".repeat(43) }))
  };
  return { config, protocol, persistence };
}

async function oidcApp(input = dependencies()) {
  const app = Fastify();
  await registerApiFoundation(app, {});
  await registerOidcRoutes(app, input);
  return app;
}

describe("OIDC login and callback", () => {
  it("stores fresh protected values and redirects login to an S256 request", async () => {
    const input = dependencies(); const app = await oidcApp(input);
    const response = await app.inject({ method: "GET", url: "/auth/login" });
    expect(response.statusCode).toBe(303);
    expect(response.headers.location).toContain("code_challenge_method=S256");
    expect(input.persistence.beginAuthorization).toHaveBeenCalledWith(expect.objectContaining({ state: "state", nonce: "nonce", pkceVerifier: "v".repeat(43), issuer: "https://issuer.example.com" }));
    expect((vi.mocked(input.persistence.beginAuthorization).mock.calls[0]?.[0].expiresAt.getTime() ?? 0) - Date.now()).toBeGreaterThan(590_000);
    await app.close();
  });

  it("consumes before checked exchange, maps exact configured authority, and issues protected opaque cookies", async () => {
    const order: string[] = []; const input = dependencies();
    vi.mocked(input.persistence.consumeAuthorization).mockImplementation(async () => { order.push("consume"); return { kind: "consumed", issuer: "https://issuer.example.com", nonce: "nonce", pkceVerifier: "v".repeat(43) }; });
    vi.mocked(input.protocol.exchange).mockImplementation(async () => { order.push("exchange"); return { issuer: "https://issuer.example.com", subject: "subject" }; });
    const app = await oidcApp(input);
    const response = await app.inject({ method: "GET", url: "/auth/callback?code=secret-code&state=state&redirect=https://evil.example", headers: { host: "evil.example", "x-forwarded-host": "evil.example" } });
    expect(order).toEqual(["consume", "exchange"]);
    expect(input.protocol.exchange).toHaveBeenCalledWith(new URL("https://shelfops.example.com/auth/callback?code=secret-code&state=state&redirect=https://evil.example"), { state: "state", nonce: "nonce", verifier: "v".repeat(43) });
    expect(input.persistence.findMappedUser).toHaveBeenCalledWith({ issuer: "https://issuer.example.com", subject: "subject", organizationId: config.organizationId });
    expect(response.statusCode).toBe(303); expect(response.headers.location).toBe(config.destinationUrl.href);
    const cookies = response.headers["set-cookie"] as unknown as string[];
    expect(cookies.join("\n")).toMatch(/shelfops_session=s{43};.*Max-Age=3600;.*Path=\/;.*HttpOnly;.*Secure;.*SameSite=Lax/);
    expect(cookies.join("\n")).toMatch(/shelfops_csrf=c{43};.*Max-Age=3600;.*Path=\/;.*Secure;.*SameSite=Lax/);
    expect(cookies.join("\n")).not.toMatch(/Domain=|secret-code|subject|admin/);
    await app.close();
  });

  it("keeps a consumed attempt rejected after provider failure", async () => {
    const input = dependencies({ protocol: { begin: vi.fn(), exchange: vi.fn().mockRejectedValue(new Error("token=provider-secret")), close: vi.fn() } });
    vi.mocked(input.persistence.consumeAuthorization).mockResolvedValueOnce({ kind: "consumed", issuer: "https://issuer.example.com", nonce: "nonce", pkceVerifier: "v".repeat(43) }).mockResolvedValue({ kind: "not-found" });
    const app = await oidcApp(input);
    const first = await app.inject("/auth/callback?code=secret-code&state=state"); const replay = await app.inject("/auth/callback?code=secret-code&state=state");
    expect(first.statusCode).toBe(503); expect(replay.statusCode).toBe(401);
    expect(first.body + replay.body).not.toMatch(/provider-secret|secret-code|state/);
    expect(input.protocol.exchange).toHaveBeenCalledTimes(1); await app.close();
  });

  it("rejects malformed, unknown, and issuer-mismatched callbacks", async () => {
    const input = dependencies(); const app = await oidcApp(input);
    expect((await app.inject("/auth/callback?code=code")).statusCode).toBe(401);
    vi.mocked(input.persistence.consumeAuthorization).mockResolvedValueOnce({ kind: "not-found" });
    expect((await app.inject("/auth/callback?code=code&state=unknown")).statusCode).toBe(401);
    vi.mocked(input.protocol.exchange).mockResolvedValueOnce({ issuer: "https://other.example.com", subject: "subject" });
    expect((await app.inject("/auth/callback?code=code&state=state")).statusCode).toBe(401);
    expect(input.persistence.createSession).not.toHaveBeenCalled(); await app.close();
  });

  it.each(["not-found", "disabled", "wrong-organization", "unmapped"])("rejects %s mappings without a session", async () => {
    const input = dependencies(); vi.mocked(input.persistence.findMappedUser).mockResolvedValue({ kind: "not-found" });
    const app = await oidcApp(input); const response = await app.inject("/auth/callback?code=code&state=state");
    expect(response.statusCode).toBe(401); expect(input.persistence.createSession).not.toHaveBeenCalled(); await app.close();
  });

  it("registers exactly hidden GET routes and preserves committed OpenAPI bytes", async () => {
    const app = await buildApi({ configurationExecutor: { execute: vi.fn() }, oidc: dependencies() }); const routes = app.printRoutes();
    expect(routes).toContain("login (GET, HEAD)"); expect(routes).toContain("callback (GET, HEAD)");
    expect((await app.inject({ method: "POST", url: "/auth/login" })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/auth/callback/other" })).statusCode).toBe(404);
    expect(Object.keys((await app.swagger()).paths ?? {})).not.toContain("/auth/login");
    expect(await openApiDocument()).toEqual(JSON.parse(await readFile("openapi/openapi.json", "utf8")));
    await app.close();
  });

  it("wires the complete bundle atomically through buildApi", async () => {
    const base = { configurationExecutor: { execute: vi.fn() } };
    const disabled = await buildApi(base); expect((await disabled.inject("/auth/login")).statusCode).toBe(404); await disabled.close();
    const enabled = await buildApi({ ...base, oidc: dependencies() }); expect((await enabled.inject("/auth/login")).statusCode).toBe(303); await enabled.close();
  });
});
