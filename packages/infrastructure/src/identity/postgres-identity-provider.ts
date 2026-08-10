import { createHash, timingSafeEqual } from "node:crypto";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import type { IdentityProvider, IdentitySession } from "@shelfops/application/ports/identity-provider";
import type { Pool } from "pg";

type Role = AuthorizedPrincipal["roleScopes"][number]["role"];
type Grant = AuthorizedPrincipal["grants"][number];
type GrantRow = Readonly<{ action: string; role: string | null }>;
type SessionRow = Readonly<{ csrfTokenHash: Buffer; expiresAt: Date; revokedAt: Date | null; userId: string; active: boolean; roles: readonly string[]; storeIds: readonly string[]; sectorIds: readonly string[]; categoryResponsibilities: readonly string[]; teamIds: readonly string[]; grants: readonly GrantRow[] }>;

const sessionLookup = `
  SELECT s.csrf_token_hash AS "csrfTokenHash", s.expires_at AS "expiresAt", s.revoked_at AS "revokedAt", u.id AS "userId", u.active,
    COALESCE((SELECT array_agg(DISTINCT role ORDER BY role) FROM user_roles WHERE user_id = u.id), ARRAY[]::text[]) AS roles,
    COALESCE((SELECT array_agg(DISTINCT store_id::text ORDER BY store_id::text) FROM user_store_scopes WHERE user_id = u.id), ARRAY[]::text[]) AS "storeIds",
    COALESCE((SELECT array_agg(DISTINCT sector_id::text ORDER BY sector_id::text) FROM user_sector_scopes WHERE user_id = u.id), ARRAY[]::text[]) AS "sectorIds",
    COALESCE((SELECT array_agg(DISTINCT category_key ORDER BY category_key) FROM category_responsibilities WHERE user_id = u.id), ARRAY[]::text[]) AS "categoryResponsibilities",
    COALESCE((SELECT array_agg(DISTINCT membership.team_id::text ORDER BY membership.team_id::text) FROM team_memberships membership JOIN teams team ON team.id = membership.team_id AND team.organization_id = membership.organization_id WHERE membership.user_id = u.id AND membership.organization_id = u.organization_id AND membership.active AND team.active), ARRAY[]::text[]) AS "teamIds",
    COALESCE((SELECT jsonb_agg(grant_item ORDER BY grant_item) FROM (SELECT DISTINCT jsonb_build_object('action', action, 'role', NULLIF(role, '')) AS grant_item FROM action_grants WHERE user_id = u.id) AS unique_grants), '[]'::jsonb) AS grants
  FROM sessions AS s JOIN users AS u ON u.id = s.user_id
  WHERE s.session_id_hash = $1 AND s.expires_at > now() AND s.revoked_at IS NULL AND u.active
`;

const digest = (value: string) => createHash("sha256").update(value).digest();
const distinct = (values: readonly string[]) => [...new Set(values)].sort();

function grantsFor(values: readonly GrantRow[]): readonly Grant[] {
  const grants = new Map<string, Grant>();
  for (const value of values) {
    const role = value.role === null ? undefined : value.role as Role;
    grants.set(`${value.action}\u0000${value.role ?? ""}`, role === undefined ? { action: value.action as Grant["action"] } : { action: value.action as Grant["action"], role });
  }
  return [...grants.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, grant]) => grant);
}

function principalFor(row: SessionRow): AuthorizedPrincipal {
  const storeIds = distinct(row.storeIds); const sectorIds = distinct(row.sectorIds); const categoryResponsibilities = distinct(row.categoryResponsibilities); const teamIds = distinct(row.teamIds);
  return { id: row.userId, active: row.active, roleScopes: distinct(row.roles).map((role) => ({ role: role as Role, storeIds, sectorIds, categoryResponsibilities, teamIds })), grants: grantsFor(row.grants) };
}

function matchesCsrfToken(candidate: string, storedHash: Buffer): boolean {
  const candidateHash = digest(candidate);
  return storedHash.length === candidateHash.length && timingSafeEqual(storedHash, candidateHash);
}

export class PostgresIdentityProvider implements IdentityProvider {
  readonly kind = "production" as const;

  constructor(private readonly pool: Pick<Pool, "query">) {}

  async lookupSession(sessionId: string): Promise<IdentitySession | undefined> {
    const result = await this.pool.query<SessionRow>(sessionLookup, [digest(sessionId)]);
    const row = result.rows[0];
    if (!row) return undefined;
    return { id: sessionId, expiresAt: row.expiresAt.getTime(), ...(row.revokedAt ? { revokedAt: row.revokedAt.getTime() } : {}), principal: principalFor(row), matchesCsrfToken: (candidate) => matchesCsrfToken(candidate, row.csrfTokenHash) };
  }
}
