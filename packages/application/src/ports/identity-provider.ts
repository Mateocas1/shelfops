import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";

export type IdentitySession = Readonly<{
  id: string;
  matchesCsrfToken(candidate: string): boolean;
  expiresAt: number;
  revokedAt?: number;
  principal: AuthorizedPrincipal;
}>;

export interface IdentityProvider {
  readonly kind: "development" | "production";
  lookupSession(sessionId: string): Promise<IdentitySession | undefined>;
}
