import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { createOpaqueSessionId, resolveSessionPrincipal } from "@shelfops/application/identity/session";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

import { PostgresIdentityProvider } from "../src/identity/postgres-identity-provider.js";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const ids = { organization: "00000000-0000-7000-8000-000000000001", user: "00000000-0000-7000-8000-000000000010", storeA: "00000000-0000-7000-8000-000000000011", storeB: "00000000-0000-7000-8000-000000000012", sectorA: "00000000-0000-7000-8000-000000000013", sectorB: "00000000-0000-7000-8000-000000000014", teamA: "00000000-0000-7000-8000-000000000015", teamB: "00000000-0000-7000-8000-000000000016", inactiveTeam: "00000000-0000-7000-8000-000000000017", inactiveMembership: "00000000-0000-7000-8000-000000000018" };
const digest = (value: string) => createHash("sha256").update(value).digest();

async function fixture() {
  const container = await new PostgreSqlContainer(image).withDatabase("identity_provider").start(); const pool = new Pool({ connectionString: container.getConnectionUri() });
  try {
    for (const migration of ["001_reference-data.sql", "002_identity-sessions.sql", "005_incidents-core.sql", "006_team-assignments.sql"]) await pool.query(await readFile(`migrations/${migration}`, "utf8"));
    await pool.query("INSERT INTO stores (id, organization_id, name) VALUES ($1, $2, 'Store A'), ($3, $2, 'Store B')", [ids.storeA, ids.organization, ids.storeB]);
    await pool.query("INSERT INTO sectors (id, organization_id, store_id, name) VALUES ($1, $2, $3, 'Sector A'), ($4, $2, $5, 'Sector B')", [ids.sectorA, ids.organization, ids.storeA, ids.sectorB, ids.storeB]);
    await pool.query("INSERT INTO users (id, organization_id, name) VALUES ($1, $2, 'Identity User')", [ids.user, ids.organization]);
    await pool.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'supervisor'), ($1, 'central-operations')", [ids.user]);
    await pool.query("INSERT INTO user_store_scopes (user_id, store_id) VALUES ($1, $2), ($1, $3)", [ids.user, ids.storeA, ids.storeB]);
    await pool.query("INSERT INTO user_sector_scopes (user_id, sector_id) VALUES ($1, $2), ($1, $3)", [ids.user, ids.sectorA, ids.sectorB]);
    await pool.query("INSERT INTO category_responsibilities (user_id, category_key) VALUES ($1, 'equipment-failure'), ($1, 'out-of-stock')", [ids.user]);
    await pool.query("INSERT INTO action_grants (user_id, action, role) VALUES ($1, 'triage', 'supervisor'), ($1, 'configure-store-policy', 'central-operations')", [ids.user]);
    await pool.query("INSERT INTO teams (id, organization_id, key, name, active) VALUES ($1,$5,'b','Team B',true),($2,$5,'a','Team A',true),($3,$5,'off','Inactive team',false),($4,$5,'inactive-membership','Inactive membership',true)", [ids.teamB, ids.teamA, ids.inactiveTeam, ids.inactiveMembership, ids.organization]);
    await pool.query("INSERT INTO team_memberships (organization_id, team_id, user_id, active) VALUES ($1,$2,$5,true),($1,$3,$5,true),($1,$4,$5,true),($1,$6,$5,false)", [ids.organization, ids.teamB, ids.teamA, ids.inactiveTeam, ids.user, ids.inactiveMembership]);
    return { provider: new PostgresIdentityProvider(pool), pool, close: async () => { try { await pool.end(); } finally { await container.stop(); } } };
  } catch (error) { await pool.end(); await container.stop(); throw error; }
}

async function insertSession(pool: Pool, sessionId: string, csrfToken: string, state: "current" | "expired" | "revoked" = "current"): Promise<void> {
  const expiresAt = state === "expired" ? "now() - interval '1 hour'" : "now() + interval '1 hour'"; const revokedAt = state === "revoked" ? "now() - interval '1 hour'" : "NULL";
  await pool.query(`INSERT INTO sessions (id, session_id_hash, csrf_token_hash, user_id, expires_at, revoked_at, created_at, last_seen_at) VALUES (gen_random_uuid(), $1, $2, $3, ${expiresAt}, ${revokedAt}, now() - interval '2 hours', now())`, [digest(sessionId), digest(csrfToken), ids.user]);
}

describe("PostgreSQL identity provider", () => {
  it("loads deterministic deduplicated authorities and verifies only the matching CSRF token", async () => {
    const test = await fixture(); const sessionId = createOpaqueSessionId(); const csrfToken = "csrf-token";
    try {
      await insertSession(test.pool, sessionId, csrfToken); const session = await test.provider.lookupSession(sessionId);
      expect(session).toMatchObject({ id: sessionId, principal: { id: ids.user, active: true, roleScopes: [{ role: "central-operations", storeIds: [ids.storeA, ids.storeB], sectorIds: [ids.sectorA, ids.sectorB], categoryResponsibilities: ["equipment-failure", "out-of-stock"], teamIds: [ids.teamA, ids.teamB] }, { role: "supervisor", storeIds: [ids.storeA, ids.storeB], sectorIds: [ids.sectorA, ids.sectorB], categoryResponsibilities: ["equipment-failure", "out-of-stock"], teamIds: [ids.teamA, ids.teamB] }], grants: [{ action: "configure-store-policy", role: "central-operations" }, { action: "triage", role: "supervisor" }] } });
      expect(session?.matchesCsrfToken(csrfToken)).toBe(true); expect(session?.matchesCsrfToken("wrong-token")).toBe(false);
      await expect(resolveSessionPrincipal(test.provider, sessionId, Date.now())).resolves.toEqual(session?.principal);
    } finally { await test.close(); }
  }, 120_000);

  it("does not resolve expired or revoked sessions", async () => {
    const test = await fixture(); const expired = createOpaqueSessionId(); const revoked = createOpaqueSessionId();
    try { await insertSession(test.pool, expired, "expired", "expired"); await insertSession(test.pool, revoked, "revoked", "revoked"); await expect(test.provider.lookupSession(expired)).resolves.toBeUndefined(); await expect(test.provider.lookupSession(revoked)).resolves.toBeUndefined(); } finally { await test.close(); }
  }, 120_000);
});
