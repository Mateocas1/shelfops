import { describe, expect, it, vi } from "vitest";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import {
  createDevelopmentIdentityProvider,
  createOpaqueSessionId
} from "@shelfops/application/identity/session";
import { buildApi } from "../src/app.js";
import { createMutationGuard } from "../src/auth/session-boundary.js";

const activePrincipal: AuthorizedPrincipal = {
  id: "user-a",
  active: true,
  roleScopes: [{ role: "collaborator", storeIds: ["store-a"], sectorIds: ["sector-a"], categoryResponsibilities: [], teamIds: [] }],
  grants: []
};
const futureExpiry = Date.now() + 60_000;
const configurationExecutor = { execute: vi.fn() };

function sessionCookie(sessionId: string): string {
  return `shelfops_session=${sessionId}`;
}

async function applicationWithSession(session: { id: string; expiresAt: number; revokedAt?: number; csrfToken: string; principal: AuthorizedPrincipal }) {
  return buildApi({
    environment: "test",
    configurationExecutor,
    identityProvider: createDevelopmentIdentityProvider((requestedId) => requestedId === session.id ? session : undefined)
  });
}

function expectSafeAuthenticationError(response: { statusCode: number; headers: Record<string, unknown>; body: string; json(): unknown }, secret: string): void {
  expect(response.statusCode).toBe(401);
  expect(response.headers["x-correlation-id"]).toEqual(expect.any(String));
  expect(response.json()).toEqual({
    code: "authentication-required",
    message: "Authentication is required",
    correlationId: expect.any(String)
  });
  expect(response.body).not.toContain(secret);
}

describe("OIDC session boundary", () => {
  it("registers the protected current-user route from buildApi while preserving health", async () => {
    const app = await applicationWithSession({ id: createOpaqueSessionId(), expiresAt: futureExpiry, csrfToken: "csrf-token", principal: activePrincipal });

    expect((await app.inject("/health")).json()).toEqual({ status: "ok" });
    expectSafeAuthenticationError(await app.inject("/api/v1/me"), "shelfops_session");
    await app.close();
  });

  it("rejects malformed, unknown, expired, revoked, and inactive sessions without leaking credentials", async () => {
    const sessionId = createOpaqueSessionId();
    for (const session of [
      { id: sessionId, expiresAt: futureExpiry, csrfToken: "csrf-token", principal: activePrincipal },
      { id: sessionId, expiresAt: Date.now() - 1, csrfToken: "csrf-token", principal: activePrincipal },
      { id: sessionId, expiresAt: futureExpiry, revokedAt: Date.now() - 1, csrfToken: "csrf-token", principal: activePrincipal },
      { id: sessionId, expiresAt: futureExpiry, csrfToken: "csrf-token", principal: { ...activePrincipal, active: false } }
    ]) {
      const app = await applicationWithSession(session);
      const cookie = sessionCookie(sessionId);
      const response = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie } });
      if (session.expiresAt === futureExpiry && !session.revokedAt && session.principal.active) {
        expect(response.statusCode).toBe(200);
      } else {
        expectSafeAuthenticationError(response, sessionId);
      }
      await app.close();
    }

    const app = await applicationWithSession({ id: sessionId, expiresAt: futureExpiry, csrfToken: "csrf-token", principal: activePrincipal });
    expectSafeAuthenticationError(await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: "shelfops_session=malformed" } }), "malformed");
    expectSafeAuthenticationError(await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: sessionCookie(createOpaqueSessionId()) } }), "unknown");
    await app.close();
  });

  it("ignores client actor claims and reloads current role, scope, and activity", async () => {
    const sessionId = createOpaqueSessionId();
    let principal = activePrincipal;
    const app = await buildApi({
      environment: "test",
      configurationExecutor,
      identityProvider: createDevelopmentIdentityProvider((requestedId) => requestedId === sessionId
        ? { id: sessionId, expiresAt: futureExpiry, csrfToken: "csrf-token", principal }
        : undefined)
    });

    const first = await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: sessionCookie(sessionId), "x-actor-id": "user-b" } });
    expect(first.json()).toMatchObject({ id: "user-a", roleScopes: [{ role: "collaborator", storeIds: ["store-a"] }] });
    principal = { ...activePrincipal, roleScopes: [{ role: "supervisor", storeIds: ["store-b"], sectorIds: [], categoryResponsibilities: [], teamIds: [] }] };
    expect((await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: sessionCookie(sessionId), "x-actor-id": "user-b" } })).json()).toMatchObject({ id: "user-a", roleScopes: [{ role: "supervisor", storeIds: ["store-b"] }] });
    principal = { ...principal, active: false };
    expectSafeAuthenticationError(await app.inject({ method: "GET", url: "/api/v1/me", headers: { cookie: sessionCookie(sessionId) } }), sessionId);
    await app.close();
  });

  it("protects cookie-authenticated current-user mutation seams with CSRF and rejects development adapters in production", async () => {
    const sessionId = createOpaqueSessionId();
    const session = { id: sessionId, expiresAt: futureExpiry, csrfToken: "csrf-token", principal: activePrincipal };
    const provider = createDevelopmentIdentityProvider((requestedId) => requestedId === sessionId ? session : undefined);
    const app = await buildApi({ environment: "test", configurationExecutor, identityProvider: provider });
    app.post("/api/v1/me/mutation", async (request) => ({ actorId: request.principal?.id }));

    const forbidden = await app.inject({ method: "POST", url: "/api/v1/me/mutation", headers: { cookie: sessionCookie(sessionId) } });
    expect(forbidden.statusCode).toBe(403);
    expect(forbidden.json()).toEqual({ code: "forbidden", message: "CSRF validation failed", correlationId: expect.any(String) });
    expect((await app.inject({ method: "POST", url: "/api/v1/me/mutation", headers: { cookie: sessionCookie(sessionId), "x-csrf-token": "csrf-token" } })).json()).toEqual({ actorId: "user-a" });
    await app.close();

    await expect(buildApi({ environment: "production", configurationExecutor, identityProvider: provider })).rejects.toThrow("Development identity adapters cannot run in production");
    const productionApp = await buildApi({ environment: "production", configurationExecutor });
    expectSafeAuthenticationError(await productionApp.inject("/api/v1/me"), "shelfops_session");
    await productionApp.close();
  });

  it("reuses an explicit mutation guard for a future location route", async () => {
    const sessionId = createOpaqueSessionId();
    const unknownSessionId = createOpaqueSessionId();
    const session = { id: sessionId, expiresAt: futureExpiry, csrfToken: "csrf-token", principal: activePrincipal };
    const provider = createDevelopmentIdentityProvider((requestedId) => requestedId === sessionId ? session : undefined);
    const app = await buildApi({ environment: "test", configurationExecutor, identityProvider: provider });
    let handlerCalls = 0;
    app.post("/api/v1/stores/store-a/locations/location-a/configuration", { preHandler: createMutationGuard(provider) }, async (request) => {
      handlerCalls += 1;
      return { actorId: request.principal?.id };
    });

    expectSafeAuthenticationError(await app.inject({ method: "POST", url: "/api/v1/stores/store-a/locations/location-a/configuration", headers: { cookie: sessionCookie(unknownSessionId), "x-csrf-token": "csrf-token" } }), unknownSessionId);
    expect(handlerCalls).toBe(0);
    const invalidCsrf = await app.inject({ method: "POST", url: "/api/v1/stores/store-a/locations/location-a/configuration", headers: { cookie: sessionCookie(sessionId), "x-csrf-token": "wrong" } });
    expect(invalidCsrf.statusCode).toBe(403);
    expect(invalidCsrf.json()).toEqual({ code: "forbidden", message: "CSRF validation failed", correlationId: expect.any(String) });
    expect(handlerCalls).toBe(0);
    expect((await app.inject({ method: "POST", url: "/api/v1/stores/store-a/locations/location-a/configuration", headers: { cookie: sessionCookie(sessionId), "x-csrf-token": "csrf-token" } })).json()).toEqual({ actorId: "user-a" });
    expect(handlerCalls).toBe(1);
    await app.close();
  });

  it("uses the opaque session verifier for CSRF instead of a raw session field", async () => {
    const sessionId = createOpaqueSessionId();
    const provider: IdentityProvider = {
      kind: "production",
      lookupSession: async (requestedId) => requestedId === sessionId ? {
        id: sessionId, expiresAt: futureExpiry, principal: activePrincipal,
        matchesCsrfToken: (candidate) => candidate === "verified-csrf-token"
      } : undefined
    };
    const app = await buildApi({ environment: "test", configurationExecutor, identityProvider: provider });
    app.post("/api/v1/me/mutation", async () => ({ status: "accepted" }));

    expect((await app.inject({ method: "POST", url: "/api/v1/me/mutation", headers: { cookie: sessionCookie(sessionId), "x-csrf-token": "wrong" } })).statusCode).toBe(403);
    expect((await app.inject({ method: "POST", url: "/api/v1/me/mutation", headers: { cookie: sessionCookie(sessionId), "x-csrf-token": "verified-csrf-token" } })).json()).toEqual({ status: "accepted" });
    await app.close();
  });

  it("publishes only the exact production configuration route", async () => {
    const app = await buildApi({ environment: "test", configurationExecutor });
    expect(app.hasRoute({ method: "POST", url: "/api/v1/stores/:storeId/locations/:locationId/configuration" })).toBe(true);
    expect((await app.inject("/api/v1/configuration")).statusCode).toBe(404);
    await app.close();
  });
});
