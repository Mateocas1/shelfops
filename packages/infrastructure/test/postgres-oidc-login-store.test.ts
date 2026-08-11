import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgresOidcLoginStore } from "../src/identity/postgres-oidc-login-store.js";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const organizationId = "00000000-0000-7000-8000-000000000001";
const userId = "00000000-0000-7000-8000-000000000070";
const legacySessionId = "00000000-0000-7000-8000-000000000071";
const issuer = "https://identity.example.test/tenant";
let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>; let pool: Pool; let store: PostgresOidcLoginStore;
const hash = (value: string) => createHash("sha256").update(value).digest();
const begin = (state: string, expiresAt = new Date(Date.now() + 60_000)) => store.beginAuthorization({ issuer, state, nonce: "nonce", pkceVerifier: "v".repeat(43), expiresAt });

beforeAll(async () => {
  container = await new PostgreSqlContainer(image).withDatabase("oidc_login").start(); pool = new Pool({ connectionString: container.getConnectionUri() });
  for (let version = 1; version <= 11; version++) { const name = (await import("node:fs/promises")).readdir("migrations").then((names) => names.find((item) => item.startsWith(`${String(version).padStart(3, "0")}_`))); await pool.query(await readFile(`migrations/${await name}`, "utf8")); }
  await pool.query("INSERT INTO users (id, organization_id, name) VALUES ($1,$2,'OIDC User')", [userId, organizationId]);
  await pool.query("INSERT INTO sessions (id,session_id_hash,csrf_token_hash,user_id,created_at,expires_at) VALUES ($1,decode(repeat('01',32),'hex'),decode(repeat('02',32),'hex'),$2,now(),now()+interval '31 days')", [legacySessionId, userId]);
  await pool.query(await readFile("migrations/012_oidc-login.sql", "utf8"));
  await pool.query("INSERT INTO oidc_identity_mappings VALUES ($1,$2,$3)", [issuer, "subject", userId]); store = new PostgresOidcLoginStore(pool);
}, 120_000);
afterAll(async () => { await pool.end(); await container.stop(); });

describe("PostgreSQL OIDC login store", () => {
  it("retains pre-012 sessions while enforcing bounded expiry on new rows", async () => {
    await expect(pool.query("SELECT id FROM sessions WHERE id=$1", [legacySessionId])).resolves.toMatchObject({ rowCount: 1 });
    await expect(pool.query("INSERT INTO sessions (id,session_id_hash,csrf_token_hash,user_id,expires_at) VALUES (gen_random_uuid(),decode(repeat('03',32),'hex'),decode(repeat('04',32),'hex'),$1,now()+interval '31 days')", [userId])).rejects.toMatchObject({ code: "23514" });
  });

  it("enforces bounded canonical data and stores authorization state only as a hash", async () => {
    await expect(begin("state-a")).resolves.toEqual({ kind: "started" });
    await expect(begin("state-a")).resolves.toEqual({ kind: "duplicate-state" });
    const row = await pool.query("SELECT state_hash, nonce, pkce_verifier FROM oidc_authorization_transactions");
    expect(row.rows).toEqual([{ state_hash: hash("state-a"), nonce: "nonce", pkce_verifier: "v".repeat(43) }]); expect(JSON.stringify(row.rows)).not.toContain("state-a");
    await expect(begin("expired", new Date())).rejects.toMatchObject({ code: "invalid-input" });
    await expect(store.beginAuthorization({ issuer: "http://identity.test", state: "x", nonce: "n", pkceVerifier: "v".repeat(43), expiresAt: new Date(Date.now() + 1_000) })).rejects.toMatchObject({ code: "invalid-input" });
    await expect(pool.query("INSERT INTO oidc_identity_mappings VALUES ('https://id.test','', $1)", [userId])).rejects.toMatchObject({ code: "23514" });
  });

  it("consumes once, maps exactly, creates hash-only sessions, revokes safely, and rolls back failures", async () => {
    await begin("success"); await expect(store.consumeAuthorization("success")).resolves.toEqual({ kind: "consumed", issuer, nonce: "nonce", pkceVerifier: "v".repeat(43) });
    await expect(store.consumeAuthorization("success")).resolves.toEqual({ kind: "not-found" });
    await expect(store.findMappedUser({ issuer, subject: "subject", organizationId })).resolves.toEqual({ kind: "mapped", userId });
    const success = await store.createSession({ userId, organizationId, expiresAt: new Date(Date.now() + 60_000) }); expect(success.kind).toBe("created"); if (success.kind !== "created") throw new Error("missing session");
    const persisted = await pool.query("SELECT session_id_hash, csrf_token_hash, revoked_at FROM sessions WHERE user_id=$1 AND id<>$2", [userId, legacySessionId]);
    expect(persisted.rows[0]).toMatchObject({ session_id_hash: hash(success.sessionId), csrf_token_hash: hash(success.csrfToken), revoked_at: null }); expect(JSON.stringify(persisted.rows)).not.toContain(success.sessionId);
    for (const state of ["unknown", "expired"]) { if (state === "expired") { await begin(state); await pool.query("UPDATE oidc_authorization_transactions SET created_at=now()-interval '2 seconds', expires_at=now()-interval '1 second' WHERE state_hash=$1", [hash(state)]); } await expect(store.consumeAuthorization(state)).resolves.toEqual({ kind: "not-found" }); }
    await expect(store.findMappedUser({ issuer, subject: "other", organizationId })).resolves.toEqual({ kind: "not-found" }); await pool.query("UPDATE users SET active=false WHERE id=$1", [userId]); await expect(store.findMappedUser({ issuer, subject: "subject", organizationId })).resolves.toEqual({ kind: "not-found" }); await pool.query("UPDATE users SET active=true WHERE id=$1", [userId]);
    const client = await pool.connect(); await client.query("BEGIN"); const transactional = new PostgresOidcLoginStore(client); await transactional.beginAuthorization({ issuer, state: "rolled-back", nonce: "nonce", pkceVerifier: "v".repeat(43), expiresAt: new Date(Date.now() + 60_000) }); await client.query("ROLLBACK"); client.release(); await expect(store.consumeAuthorization("rolled-back")).resolves.toEqual({ kind: "not-found" });
    await expect(store.revoke({ sessionId: success.sessionId, userId, organizationId })).resolves.toEqual({ kind: "revoked" }); await expect(store.revoke({ sessionId: success.sessionId, userId, organizationId })).resolves.toEqual({ kind: "not-found" });
    await expect(store.revoke({ sessionId: success.sessionId, userId: "00000000-0000-7000-8000-000000000071", organizationId })).resolves.toEqual({ kind: "not-found" });
  });

  it("scopes revocation to the configured organization authority", async () => {
    const created = await store.createSession({ userId, organizationId, expiresAt: new Date(Date.now() + 60_000) });
    if (created.kind !== "created") throw new Error("missing session");
    const revoker = store.scopedRevoker(organizationId);
    await expect(revoker.revoke(created.sessionId, userId)).resolves.toEqual({ kind: "revoked" });
    await expect(revoker.revoke(created.sessionId, userId)).resolves.toEqual({ kind: "not-found" });
    await expect(store.scopedRevoker("00000000-0000-7000-8000-000000000002").revoke(created.sessionId, userId)).resolves.toEqual({ kind: "not-found" });
  });
});
