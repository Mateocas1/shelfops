import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool } from "pg";

export type AuthorizationResult = Readonly<{ kind: "started" | "duplicate-state" }>;
export type ConsumedAuthorization = Readonly<{ kind: "consumed"; issuer: string; nonce: string; pkceVerifier: string }> | Readonly<{ kind: "not-found" }>;
export type MappedUser = Readonly<{ kind: "mapped"; userId: string }> | Readonly<{ kind: "not-found" }>;
export type SessionResult = Readonly<{ kind: "created"; sessionId: string; csrfToken: string }> | Readonly<{ kind: "user-not-found" }>;
export type RevokeResult = Readonly<{ kind: "revoked" | "not-found" }>;
export class OidcLoginStoreError extends Error { constructor(readonly code: "invalid-input" | "persistence-failure" = "invalid-input") { super(code); } }

const digest = (value: string) => createHash("sha256").update(value).digest();
const validText = (value: string, maximum: number) => value.length > 0 && value.length <= maximum && value.trim() === value;
function canonicalIssuer(value: string): string {
  if (!validText(value, 2048)) throw new OidcLoginStoreError(); let parsed: URL;
  try { parsed = new URL(value); } catch { throw new OidcLoginStoreError(); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) throw new OidcLoginStoreError();
  return parsed.toString().replace(/\/$/, "");
}
function future(value: Date, maximumMs: number): void { const duration = value.getTime() - Date.now(); if (!Number.isFinite(duration) || duration <= 0 || duration > maximumMs) throw new OidcLoginStoreError(); }

export class PostgresOidcLoginStore {
  constructor(private readonly database: Pick<Pool, "query">) {}
  async beginAuthorization(input: Readonly<{ issuer: string; state: string; nonce: string; pkceVerifier: string; expiresAt: Date }>): Promise<AuthorizationResult> {
    const issuer = canonicalIssuer(input.issuer); future(input.expiresAt, 15 * 60_000);
    if (!validText(input.state, 1024) || !validText(input.nonce, 512) || !validText(input.pkceVerifier, 128) || input.pkceVerifier.length < 43) throw new OidcLoginStoreError();
    try { const result = await this.database.query("INSERT INTO oidc_authorization_transactions (state_hash,issuer,nonce,pkce_verifier,expires_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (state_hash) DO NOTHING RETURNING 1", [digest(input.state), issuer, input.nonce, input.pkceVerifier, input.expiresAt]); return { kind: result.rowCount === 1 ? "started" : "duplicate-state" }; } catch { throw new OidcLoginStoreError("persistence-failure"); }
  }
  async consumeAuthorization(state: string): Promise<ConsumedAuthorization> {
    if (!validText(state, 1024)) throw new OidcLoginStoreError();
    try { const result = await this.database.query<{ issuer: string; nonce: string; pkceVerifier: string }>("UPDATE oidc_authorization_transactions SET consumed_at=now() WHERE state_hash=$1 AND consumed_at IS NULL AND expires_at>now() RETURNING issuer,nonce,pkce_verifier AS \"pkceVerifier\"", [digest(state)]); return result.rows[0] ? { kind: "consumed", ...result.rows[0] } : { kind: "not-found" }; } catch { throw new OidcLoginStoreError("persistence-failure"); }
  }
  async findMappedUser(input: Readonly<{ issuer: string; subject: string; organizationId: string }>): Promise<MappedUser> {
    const issuer = canonicalIssuer(input.issuer); if (!validText(input.subject, 255)) throw new OidcLoginStoreError();
    try { const result = await this.database.query<{ userId: string }>("SELECT u.id AS \"userId\" FROM oidc_identity_mappings m JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=u.organization_id WHERE m.issuer=$1 AND m.subject=$2 AND u.organization_id=$3 AND u.active AND o.active", [issuer, input.subject, input.organizationId]); return result.rows[0] ? { kind: "mapped", ...result.rows[0] } : { kind: "not-found" }; } catch { throw new OidcLoginStoreError("persistence-failure"); }
  }
  async createSession(input: Readonly<{ userId: string; organizationId: string; expiresAt: Date }>): Promise<SessionResult> {
    future(input.expiresAt, 30 * 86_400_000); const sessionId = randomBytes(32).toString("base64url"); const csrfToken = randomBytes(32).toString("base64url");
    try { const result = await this.database.query("INSERT INTO sessions (id,session_id_hash,csrf_token_hash,user_id,expires_at) SELECT $1,$2,$3,u.id,$4 FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.id=$5 AND u.organization_id=$6 AND u.active AND o.active RETURNING 1", [randomUUID(), digest(sessionId), digest(csrfToken), input.expiresAt, input.userId, input.organizationId]); return result.rowCount === 1 ? { kind: "created", sessionId, csrfToken } : { kind: "user-not-found" }; } catch { throw new OidcLoginStoreError("persistence-failure"); }
  }
  async revoke(input: Readonly<{ sessionId: string; userId: string; organizationId: string }>): Promise<RevokeResult> {
    if (!validText(input.sessionId, 1024)) throw new OidcLoginStoreError();
    try { const result = await this.database.query("UPDATE sessions s SET revoked_at=now() FROM users u WHERE s.user_id=u.id AND s.session_id_hash=$1 AND s.user_id=$2 AND u.organization_id=$3 AND s.revoked_at IS NULL RETURNING 1", [digest(input.sessionId), input.userId, input.organizationId]); return { kind: result.rowCount === 1 ? "revoked" : "not-found" }; } catch { throw new OidcLoginStoreError("persistence-failure"); }
  }
  scopedRevoker(organizationId: string): Readonly<{ revoke(sessionId: string, userId: string): Promise<RevokeResult> }> {
    return { revoke: (sessionId, userId) => this.revoke({ sessionId, userId, organizationId }) };
  }
}
