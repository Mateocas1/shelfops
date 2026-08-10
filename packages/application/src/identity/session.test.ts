import { describe, expect, it } from "vitest";

import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";
import {
  createDevelopmentIdentityProvider,
  createOpaqueSessionId,
  resolveSession,
  resolveSessionPrincipal
} from "./session.js";

const activePrincipal: AuthorizedPrincipal = {
  id: "user-a",
  active: true,
  roleScopes: [{ role: "collaborator", storeIds: ["store-a"], sectorIds: ["sector-a"], categoryResponsibilities: [], teamIds: [] }],
  grants: []
};

describe("identity sessions", () => {
  it("uses opaque high-entropy session identifiers and returns the current principal", async () => {
    const sessionId = createOpaqueSessionId();
    const anotherSessionId = createOpaqueSessionId();
    const provider = createDevelopmentIdentityProvider((requestedId) => requestedId === sessionId
      ? { id: sessionId, expiresAt: 2_000, principal: activePrincipal, csrfToken: "csrf-token" }
      : undefined);

    expect(sessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(anotherSessionId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(anotherSessionId).not.toBe(sessionId);
    await expect(resolveSessionPrincipal(provider, sessionId, 1_000)).resolves.toEqual(activePrincipal);
  });

  it("delegates CSRF candidate validation to the opaque-session verifier", async () => {
    const sessionId = createOpaqueSessionId();
    const provider = createDevelopmentIdentityProvider((requestedId) => requestedId === sessionId
      ? { id: sessionId, expiresAt: 2_000, principal: activePrincipal, csrfToken: "csrf-token" }
      : undefined);

    const session = await resolveSession(provider, sessionId, 1_000);
    expect(session?.matchesCsrfToken("csrf-token")).toBe(true);
    expect(session?.matchesCsrfToken("different-token")).toBe(false);
  });

  it("re-evaluates expiry, revocation, and principal activity on every lookup", async () => {
    const sessionId = createOpaqueSessionId();
    let active = true;
    let revokedAt: number | undefined;
    const provider = createDevelopmentIdentityProvider((requestedId) => requestedId === sessionId
      ? { id: sessionId, expiresAt: 2_000, revokedAt, csrfToken: "csrf-token", principal: { ...activePrincipal, active } }
      : undefined);

    await expect(resolveSessionPrincipal(provider, sessionId, 1_000)).resolves.toMatchObject({ id: "user-a", active: true });
    revokedAt = 1_000;
    await expect(resolveSessionPrincipal(provider, sessionId, 1_000)).resolves.toBeUndefined();
    revokedAt = undefined;
    active = false;
    await expect(resolveSessionPrincipal(provider, sessionId, 1_000)).resolves.toBeUndefined();
    await expect(resolveSessionPrincipal(provider, sessionId, 2_000)).resolves.toBeUndefined();
  });
});
