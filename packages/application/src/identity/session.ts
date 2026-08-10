import { randomBytes } from "node:crypto";

import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";
import type { IdentityProvider, IdentitySession } from "../ports/identity-provider.js";

type DevelopmentIdentitySession = Omit<IdentitySession, "matchesCsrfToken"> & Readonly<{ csrfToken: string }>;

export function createOpaqueSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function createDevelopmentIdentityProvider(lookup: (sessionId: string) => DevelopmentIdentitySession | undefined): IdentityProvider {
  return {
    kind: "development",
    async lookupSession(sessionId) {
      const session = lookup(sessionId);
      if (!session) return undefined;
      const { csrfToken, ...identitySession } = session;
      return { ...identitySession, matchesCsrfToken: (candidate) => candidate === csrfToken };
    }
  };
}

export async function resolveSession(provider: IdentityProvider, sessionId: string, now: number): Promise<IdentitySession | undefined> {
  const session = await provider.lookupSession(sessionId);
  if (!session || session.id !== sessionId || session.expiresAt <= now || (session.revokedAt !== undefined && session.revokedAt <= now) || !session.principal.active) {
    return undefined;
  }
  return session;
}

export async function resolveSessionPrincipal(provider: IdentityProvider, sessionId: string, now: number): Promise<AuthorizedPrincipal | undefined> {
  return (await resolveSession(provider, sessionId, now))?.principal;
}
