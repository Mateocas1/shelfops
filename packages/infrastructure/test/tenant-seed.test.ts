import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { migrate } from "../../../scripts/migrate.js";
import { seedTenant, type TenantSeedInput } from "../../../scripts/seed-tenant.js";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const input: TenantSeedInput = {
  organizationSlug: "acme-retail",
  organizationName: "Acme Retail",
  storeCode: "store-001",
  storeName: "Acme Downtown",
  userEmail: "ops@acme.example",
  userName: "Operations Lead",
  userRole: "supervisor",
  oidcIssuer: "https://idp.acme.example",
  oidcSubject: "subject-001"
};

describe("tenant seed", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
  let client: Client;

  beforeAll(async () => {
    execFileSync("pnpm", ["run", "build:migrate"], { cwd: process.cwd(), stdio: "pipe" });
    container = await new PostgreSqlContainer(image).withDatabase("tenant_seed").start();
    client = new Client({ connectionString: container.getConnectionUri() });
    await client.connect();
  }, 180_000);

  afterAll(async () => {
    await client?.end().catch(() => undefined);
    await container?.stop();
  });

  beforeEach(async () => {
    await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
    await migrate(container.getConnectionUri(), resolve("migrations"), "apply");
  }, 120_000);

  it("creates once and reports unchanged with stable ids on a repeated run", async () => {
    const first = await seedTenant(client, input);
    const second = await seedTenant(client, input);

    expect(first.status).toBe("created");
    expect(second.status).toBe("unchanged");
    expect(second).toMatchObject({ organizationId: first.organizationId, storeId: first.storeId, userId: first.userId });

    const counts = await client.query<{ organizations: number; stores: number; users: number; mappings: number; roles: number; scopes: number }>(
      `SELECT (SELECT count(*)::int FROM organizations) organizations,
              (SELECT count(*)::int FROM stores WHERE code = $1) stores,
              (SELECT count(*)::int FROM users WHERE email = $2) users,
              (SELECT count(*)::int FROM oidc_identity_mappings WHERE issuer = $3 AND subject = $4) mappings,
              (SELECT count(*)::int FROM user_roles WHERE user_id = $5) roles,
              (SELECT count(*)::int FROM user_store_scopes WHERE user_id = $5) scopes`,
      [input.storeCode, input.userEmail, input.oidcIssuer, input.oidcSubject, first.userId]
    );
    expect(counts.rows[0]).toEqual({ organizations: 1, stores: 1, users: 1, mappings: 1, roles: 1, scopes: 1 });
  }, 120_000);

  it("converges mutable display names without creating duplicates", async () => {
    const first = await seedTenant(client, input);
    const renamed = await seedTenant(client, { ...input, organizationName: "Acme Retail Group", storeName: "Acme Downtown Flagship" });

    expect(renamed).toMatchObject({ status: "updated", storeId: first.storeId, userId: first.userId });
    expect(renamed.updated).toEqual(expect.arrayContaining(["organization", "store"]));
    const rows = await client.query<{ organization_name: string; store_name: string; stores: number }>(
      "SELECT (SELECT name FROM organizations WHERE singleton) organization_name, (SELECT name FROM stores WHERE code = $1) store_name, (SELECT count(*)::int FROM stores) stores",
      [input.storeCode]
    );
    expect(rows.rows[0]).toEqual({ organization_name: "Acme Retail Group", store_name: "Acme Downtown Flagship", stores: 1 });
  }, 120_000);

  it("fails closed without partial writes when the subject already maps to another user", async () => {
    await seedTenant(client, input);

    await expect(seedTenant(client, { ...input, userEmail: "other@acme.example", userName: "Other", storeCode: "store-002", storeName: "Acme Second" })).rejects.toThrow("oidc-identity-conflict");

    const rows = await client.query<{ users: number; stores: number; mappings: number }>(
      `SELECT (SELECT count(*)::int FROM users WHERE email = 'other@acme.example') users,
              (SELECT count(*)::int FROM stores WHERE code = 'store-002') stores,
              (SELECT count(*)::int FROM oidc_identity_mappings) mappings`
    );
    expect(rows.rows[0]).toEqual({ users: 0, stores: 0, mappings: 1 });
  }, 120_000);

  it("keeps one organization for conflicting slugs", async () => {
    await seedTenant(client, input);
    await seedTenant(client, { ...input, organizationSlug: "acme-group" });

    const rows = await client.query<{ organizations: number; slug: string }>("SELECT (SELECT count(*)::int FROM organizations) organizations, slug FROM organizations WHERE singleton");
    expect(rows.rows[0]).toEqual({ organizations: 1, slug: "acme-group" });
  }, 120_000);

  it("runs the compiled one-off task idempotently", () => {
    const flags = ["--org-slug", input.organizationSlug, "--org-name", input.organizationName, "--store-code", input.storeCode, "--store-name", input.storeName, "--user-email", input.userEmail, "--user-role", input.userRole, "--oidc-issuer", input.oidcIssuer, "--oidc-subject", input.oidcSubject];
    const compiled = resolve("dist/migrate/seed-tenant.js");
    const run = () => JSON.parse(execFileSync(process.execPath, [compiled, ...flags], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: container.getConnectionUri() }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })) as { status: string; storeId: string };

    const first = run();
    const second = run();
    expect(first.status).toBe("created");
    expect(second.status).toBe("unchanged");
    expect(second.storeId).toBe(first.storeId);
  }, 120_000);

  it("exits nonzero with a JSON error for invalid input", () => {
    const compiled = resolve("dist/migrate/seed-tenant.js");
    let failure: { stderr?: string } | undefined;
    try {
      execFileSync(process.execPath, [compiled, "--org-slug", input.organizationSlug, "--org-name", input.organizationName, "--store-code", input.storeCode, "--store-name", input.storeName, "--user-email", input.userEmail, "--user-role", "administrator", "--oidc-issuer", input.oidcIssuer, "--oidc-subject", input.oidcSubject], { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: container.getConnectionUri() }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (error) {
      failure = error as { stderr?: string };
    }
    expect(failure?.stderr).toContain("tenant-seed-input-invalid");
  }, 120_000);
});
