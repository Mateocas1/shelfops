import { randomUUID } from "node:crypto";
import { Client } from "pg";

import type { DatabaseConnectionConfig } from "@shelfops/infrastructure/postgres/database-config";

export const TENANT_USER_ROLES = ["collaborator", "sector-lead", "supervisor", "inventory-team", "central-operations"] as const;
export type TenantUserRole = typeof TENANT_USER_ROLES[number];

export interface TenantSeedInput {
  organizationSlug: string;
  organizationName: string;
  storeCode: string;
  storeName: string;
  userEmail: string;
  userName: string;
  userRole: TenantUserRole;
  oidcIssuer: string;
  oidcSubject: string;
}

interface TenantSeedRawInput {
  organizationSlug?: string;
  organizationName?: string;
  storeCode?: string;
  storeName?: string;
  userEmail?: string;
  userName?: string;
  userRole?: string;
  oidcIssuer?: string;
  oidcSubject?: string;
}

export interface TenantSeedResult {
  status: "created" | "updated" | "unchanged";
  organizationId: string;
  storeId: string;
  userId: string;
  identityMapping: { issuer: string; subject: string };
  created: string[];
  updated: string[];
}

export class TenantSeedError extends Error {
  constructor(readonly code: string, readonly detail?: string) {
    super(code);
  }
}

const OPTIONS = [
  { flag: "--org-slug", environment: "SHELFOPS_SEED_ORG_SLUG", field: "organizationSlug", required: true },
  { flag: "--org-name", environment: "SHELFOPS_SEED_ORG_NAME", field: "organizationName", required: true },
  { flag: "--store-code", environment: "SHELFOPS_SEED_STORE_CODE", field: "storeCode", required: true },
  { flag: "--store-name", environment: "SHELFOPS_SEED_STORE_NAME", field: "storeName", required: true },
  { flag: "--user-email", environment: "SHELFOPS_SEED_USER_EMAIL", field: "userEmail", required: true },
  { flag: "--user-name", environment: "SHELFOPS_SEED_USER_NAME", field: "userName", required: false },
  { flag: "--user-role", environment: "SHELFOPS_SEED_USER_ROLE", field: "userRole", required: false },
  { flag: "--oidc-issuer", environment: "SHELFOPS_SEED_OIDC_ISSUER", field: "oidcIssuer", required: true },
  { flag: "--oidc-subject", environment: "SHELFOPS_SEED_OIDC_SUBJECT", field: "oidcSubject", required: true }
] as const;

function invalid(flag: string, expectation: string): never {
  throw new TenantSeedError("tenant-seed-input-invalid", `${flag} must be ${expectation}`);
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim() ?? "";
  if (trimmed === "") throw new TenantSeedError("tenant-seed-input-required", `${name} is required`);
  return trimmed;
}

function readArguments(argv: readonly string[]): Map<string, string> {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index] ?? "";
    const separator = token.indexOf("=");
    const flag = separator === -1 ? token : token.slice(0, separator);
    if (!flag.startsWith("--")) throw new TenantSeedError("tenant-seed-input-invalid", `unexpected argument: ${token}`);
    if (separator !== -1) { values.set(flag, token.slice(separator + 1)); continue; }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new TenantSeedError("tenant-seed-input-invalid", `${flag} requires a value`);
    values.set(flag, value);
    index += 1;
  }
  const known = new Set<string>(OPTIONS.map((option) => option.flag));
  for (const flag of values.keys()) if (!known.has(flag)) throw new TenantSeedError("tenant-seed-input-invalid", `unknown argument: ${flag}`);
  return values;
}

export function validateTenantSeedInput(input: TenantSeedRawInput): TenantSeedInput {
  const organizationName = required(input.organizationName, "--org-name");
  if (organizationName.length > 200) invalid("--org-name", "at most 200 characters");
  const organizationSlug = required(input.organizationSlug, "--org-slug").toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug) || organizationSlug.length > 64) invalid("--org-slug", "a lowercase hyphenated slug of at most 64 characters");
  const storeCode = required(input.storeCode, "--store-code").toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(storeCode)) invalid("--store-code", "a lowercase code of at most 64 characters");
  const storeName = required(input.storeName, "--store-name");
  if (storeName.length > 200) invalid("--store-name", "at most 200 characters");
  const userEmail = required(input.userEmail, "--user-email").toLowerCase();
  if (userEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(userEmail)) invalid("--user-email", "an email address");
  const userName = required(input.userName || userEmail, "--user-name");
  if (userName.length > 200) invalid("--user-name", "at most 200 characters");
  const userRole = required(input.userRole ?? "supervisor", "--user-role");
  if (!(TENANT_USER_ROLES as readonly string[]).includes(userRole)) invalid("--user-role", `one of ${TENANT_USER_ROLES.join(", ")}`);
  const oidcIssuer = required(input.oidcIssuer, "--oidc-issuer");
  if (oidcIssuer.length > 2048 || !/^https:\/\/\S+$/.test(oidcIssuer) || oidcIssuer.endsWith("/")) invalid("--oidc-issuer", "an HTTPS URL without a trailing slash");
  const oidcSubject = required(input.oidcSubject, "--oidc-subject");
  if (oidcSubject.length > 255) invalid("--oidc-subject", "at most 255 characters");
  return { organizationSlug, organizationName, storeCode, storeName, userEmail, userName, userRole: userRole as TenantUserRole, oidcIssuer, oidcSubject };
}

export function parseTenantSeedInput(argv: readonly string[], environment: Readonly<Record<string, string | undefined>>): TenantSeedInput {
  const provided = readArguments(argv);
  const raw: TenantSeedRawInput = {};
  for (const option of OPTIONS) {
    const value = provided.get(option.flag) ?? environment[option.environment]?.trim();
    if (value === undefined) {
      if (option.required) throw new TenantSeedError("tenant-seed-input-required", `${option.flag} or ${option.environment} is required`);
      continue;
    }
    raw[option.field] = value;
  }
  return validateTenantSeedInput(raw);
}

async function ensureOrganization(client: Client, value: TenantSeedInput, created: string[], updated: string[]): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    "INSERT INTO organizations (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT (singleton) DO NOTHING RETURNING id",
    [randomUUID(), value.organizationName, value.organizationSlug]
  );
  if (inserted.rowCount === 1) { created.push("organization"); return inserted.rows[0]!.id; }
  const existing = await client.query<{ id: string; name: string; slug: string | null }>("SELECT id, name, slug FROM organizations WHERE singleton");
  const row = existing.rows[0];
  if (!row) throw new TenantSeedError("organization-unavailable");
  if (row.name !== value.organizationName || row.slug !== value.organizationSlug) {
    await client.query("UPDATE organizations SET name = $1, slug = $2, updated_at = now() WHERE id = $3", [value.organizationName, value.organizationSlug, row.id]);
    updated.push("organization");
  }
  return row.id;
}

async function ensureStore(client: Client, value: TenantSeedInput, organizationId: string, created: string[], updated: string[]): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    "INSERT INTO stores (id, organization_id, name, code) VALUES ($1, $2, $3, $4) ON CONFLICT (organization_id, code) DO NOTHING RETURNING id",
    [randomUUID(), organizationId, value.storeName, value.storeCode]
  );
  if (inserted.rowCount === 1) { created.push("store"); return inserted.rows[0]!.id; }
  const existing = await client.query<{ id: string; name: string }>("SELECT id, name FROM stores WHERE organization_id = $1 AND code = $2", [organizationId, value.storeCode]);
  const row = existing.rows[0];
  if (!row) throw new TenantSeedError("store-unavailable");
  if (row.name !== value.storeName) {
    await client.query("UPDATE stores SET name = $1, updated_at = now() WHERE id = $2", [value.storeName, row.id]);
    updated.push("store");
  }
  return row.id;
}

async function ensureUser(client: Client, value: TenantSeedInput, organizationId: string, created: string[], updated: string[]): Promise<string> {
  const inserted = await client.query<{ id: string }>(
    "INSERT INTO users (id, organization_id, name, email) VALUES ($1, $2, $3, $4) ON CONFLICT (organization_id, email) DO NOTHING RETURNING id",
    [randomUUID(), organizationId, value.userName, value.userEmail]
  );
  if (inserted.rowCount === 1) { created.push("user"); return inserted.rows[0]!.id; }
  const existing = await client.query<{ id: string; name: string }>("SELECT id, name FROM users WHERE organization_id = $1 AND email = $2", [organizationId, value.userEmail]);
  const row = existing.rows[0];
  if (!row) throw new TenantSeedError("user-unavailable");
  if (row.name !== value.userName) {
    await client.query("UPDATE users SET name = $1, updated_at = now() WHERE id = $2", [value.userName, row.id]);
    updated.push("user");
  }
  return row.id;
}

async function ensureIdentityMapping(client: Client, value: TenantSeedInput, userId: string): Promise<void> {
  const inserted = await client.query(
    "INSERT INTO oidc_identity_mappings (issuer, subject, user_id) VALUES ($1, $2, $3) ON CONFLICT (issuer, subject) DO NOTHING",
    [value.oidcIssuer, value.oidcSubject, userId]
  );
  if (inserted.rowCount === 1) return;
  const existing = await client.query<{ user_id: string }>("SELECT user_id FROM oidc_identity_mappings WHERE issuer = $1 AND subject = $2", [value.oidcIssuer, value.oidcSubject]);
  const mapped = existing.rows[0]?.user_id;
  if (mapped !== userId) throw new TenantSeedError("oidc-identity-conflict", `subject ${value.oidcSubject} is already mapped to a different user`);
}

export async function seedTenant(client: Client, input: TenantSeedInput): Promise<TenantSeedResult> {
  const value = validateTenantSeedInput(input);
  const created: string[] = [];
  const updated: string[] = [];
  await client.query("BEGIN");
  try {
    const organizationId = await ensureOrganization(client, value, created, updated);
    const storeId = await ensureStore(client, value, organizationId, created, updated);
    const userId = await ensureUser(client, value, organizationId, created, updated);
    const role = await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT (user_id, role) DO NOTHING", [userId, value.userRole]);
    const scope = await client.query("INSERT INTO user_store_scopes (user_id, store_id) VALUES ($1, $2) ON CONFLICT (user_id, store_id) DO NOTHING", [userId, storeId]);
    await ensureIdentityMapping(client, value, userId);
    if (role.rowCount === 1) created.push("user-role");
    if (scope.rowCount === 1) created.push("user-store-scope");
    await client.query("COMMIT");
    const status = created.length > 0 ? "created" : updated.length > 0 ? "updated" : "unchanged";
    return { status, organizationId, storeId, userId, identityMapping: { issuer: value.oidcIssuer, subject: value.oidcSubject }, created, updated };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

type SeedConnection = Pick<DatabaseConnectionConfig, "ssl">;

async function readConnection(): Promise<Partial<SeedConnection>> {
  const { readDatabaseConnectionConfig } = await import("@shelfops/infrastructure/postgres/database-config");
  const { ssl } = await readDatabaseConnectionConfig(process.env);
  return { ssl };
}

async function main(): Promise<void> {
  try {
    if (!process.env.DATABASE_URL) throw new TenantSeedError("database-url-required");
    const input = parseTenantSeedInput(process.argv.slice(2), process.env);
    let connection: Partial<SeedConnection>;
    try {
      connection = await readConnection();
    } catch (error) {
      throw new TenantSeedError("database-config-invalid", error instanceof Error ? error.message : undefined);
    }
    const client = new Client({ connectionString: process.env.DATABASE_URL, ...connection });
    try {
      await client.connect();
      console.log(JSON.stringify(await seedTenant(client, input)));
    } finally {
      await client.end().catch(() => undefined);
    }
  } catch (error) {
    const seedError = error instanceof TenantSeedError ? error : new TenantSeedError("tenant-seed-failed");
    console.error(JSON.stringify({ status: "failed", error: seedError.code, ...(seedError.detail ? { detail: seedError.detail } : {}) }));
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
