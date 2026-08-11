import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { discoverMigrations, migrate } from "../../../scripts/migrate.js";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
let url: string;
const temporaryDirectories: string[] = [];

async function directory(files: Record<string, string>): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), "shelfops-migrations-"));
  temporaryDirectories.push(path);
  await Promise.all(Object.entries(files).map(([name, sql]) => writeFile(join(path, name), sql)));
  return path;
}

async function reset(): Promise<void> {
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
  await client.end();
}

describe("migration command", () => {
  beforeAll(async () => {
    container = await new PostgreSqlContainer(image).start();
    url = container.getConnectionUri();
  }, 120_000);

  afterAll(async () => {
    await Promise.all(temporaryDirectories.map((path) => rm(path, { recursive: true })));
    await container.stop();
  });

  it("discovers only canonical contiguous migrations in numeric order", async () => {
    const path = await directory({ "002_two.sql": "SELECT 2", "001_one.sql": "SELECT 1", "notes.txt": "ignored" });
    await expect(discoverMigrations(path)).resolves.toMatchObject([{ version: 1 }, { version: 2 }]);
    await writeFile(join(path, "01_ambiguous.sql"), "SELECT 1");
    await expect(discoverMigrations(path)).rejects.toThrow("migration-files-invalid");
    await rm(join(path, "01_ambiguous.sql"));
    await writeFile(join(path, "004_gap.sql"), "SELECT 4");
    await expect(discoverMigrations(path)).rejects.toThrow("migration-files-invalid");
  });

  it("applies 001-012 once and reports current", async () => {
    await reset();
    const path = resolve("migrations");
    const first = await migrate(url, path, "apply");
    expect(first).toMatchObject({ status: "current", current: 12 });
    expect(first.applied).toHaveLength(12);
    const repeated = await migrate(url, path, "apply");
    expect(repeated).toEqual({ status: "current", current: 12, pending: [], applied: [], drift: [] });
    expect(await migrate(url, path, "status")).toEqual(repeated);
  }, 120_000);

  it("fails closed for drift, missing files, and unknown ledger rows", async () => {
    await reset();
    const path = await directory({ "001_one.sql": "CREATE TABLE one(id int)", "002_two.sql": "CREATE TABLE two(id int)" });
    await migrate(url, path, "apply");
    await writeFile(join(path, "001_one.sql"), "CREATE TABLE changed(id int)");
    await expect(migrate(url, path, "status")).rejects.toThrow("migration-drift");
    await rm(join(path, "002_two.sql"));
    await expect(migrate(url, path, "apply")).rejects.toThrow("migration-drift");
    await writeFile(join(path, "001_one.sql"), "CREATE TABLE one(id int)");
    const client = new Client({ connectionString: url });
    await client.connect();
    await client.query("DELETE FROM shelfops_migrations WHERE version = 2");
    await client.query("INSERT INTO shelfops_migrations VALUES (3, '003_unknown.sql', repeat('0', 64), now())");
    await client.end();
    await expect(migrate(url, path, "status")).rejects.toThrow("migration-drift");
  });

  it("fails fast when another runner holds the migration lock", async () => {
    await reset();
    const holder = new Client({ connectionString: url });
    await holder.connect();
    await holder.query("SELECT pg_advisory_lock(hashtextextended('shelfops:migrations', 0))");
    await expect(migrate(url, resolve("migrations"), "status")).rejects.toThrow("migration-lock-unavailable");
    await holder.end();
  });

  it("rolls back a failed migration without recording it", async () => {
    await reset();
    const path = await directory({ "001_broken.sql": "CREATE TABLE transient(id int); SELECT missing_column;" });
    await expect(migrate(url, path, "apply")).rejects.toThrow();
    const client = new Client({ connectionString: url });
    await client.connect();
    const result = await client.query("SELECT to_regclass('transient') AS table_name, count(*)::int AS ledger_rows FROM shelfops_migrations");
    expect(result.rows).toEqual([{ table_name: null, ledger_rows: 0 }]);
    await client.end();
  });
});
