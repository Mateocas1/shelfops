import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

import type { DatabaseConnectionConfig } from "@shelfops/infrastructure/postgres/database-config";

export type Migration = { version: number; filename: string; checksum: string; sql: Buffer };
type Mode = "apply" | "status";
type Result = { status: "current" | "pending"; current: number; pending: string[]; applied: string[]; drift: string[] };
type MigrationConnection = Pick<DatabaseConnectionConfig, "ssl" | "statement_timeout">;

class MigrationError extends Error {
  constructor(readonly code: string, readonly drift: string[] = [], readonly detail?: string) {
    super(code);
  }
}

export async function discoverMigrations(directory: string): Promise<Migration[]> {
  const names = await readdir(directory);
  const invalid = names.filter((name) => name.endsWith(".sql") && !/^\d{3}_[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/.test(name));
  const migrations = await Promise.all(names.filter((name) => /^\d{3}_[a-z0-9]+(?:-[a-z0-9]+)*\.sql$/.test(name)).map(async (filename) => {
    const sql = await readFile(resolve(directory, filename));
    return { version: Number(filename.slice(0, 3)), filename, checksum: createHash("sha256").update(sql).digest("hex"), sql };
  }));
  migrations.sort((left, right) => left.version - right.version || left.filename.localeCompare(right.filename));
  const versions = new Set<number>();
  for (const [index, migration] of migrations.entries()) {
    if (versions.has(migration.version) || migration.version !== index + 1) invalid.push(migration.filename);
    versions.add(migration.version);
  }
  if (invalid.length > 0 || migrations.length === 0) throw new MigrationError("migration-files-invalid", invalid.sort());
  return migrations;
}

export async function migrate(connectionString: string, directory: string, mode: Mode, connection: Partial<MigrationConnection> = {}): Promise<Result> {
  const migrations = await discoverMigrations(directory);
  const client = new Client({ connectionString, ...connection });
  let locked = false;
  try {
    await client.connect();
    const lock = await client.query<{ locked: boolean }>("SELECT pg_try_advisory_lock(hashtextextended('shelfops:migrations', 0)) AS locked");
    if (!lock.rows[0]?.locked) throw new MigrationError("migration-lock-unavailable");
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS shelfops_migrations (
      version integer PRIMARY KEY CHECK (version > 0), filename text NOT NULL UNIQUE,
      checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT transaction_timestamp()
    )`);
    const ledger = await client.query<{ version: number; filename: string; checksum: string }>(
      "SELECT version, filename, checksum FROM shelfops_migrations ORDER BY version"
    );
    const drift: string[] = [];
    for (const row of ledger.rows) {
      const expected = migrations[row.version - 1];
      if (!expected) drift.push(`unknown-ledger:${row.filename}`);
      else if (row.filename !== expected.filename) drift.push(`order-mismatch:${row.filename}`);
      else if (row.checksum !== expected.checksum) drift.push(`checksum-mismatch:${row.filename}`);
    }
    if (drift.length > 0) throw new MigrationError("migration-drift", drift);
    const pending = migrations.slice(ledger.rowCount ?? 0);
    const applied: string[] = [];
    if (mode === "apply") {
      for (const migration of pending) {
        await client.query("BEGIN");
        try {
          await client.query(migration.sql.toString("utf8"));
          await client.query(
            "INSERT INTO shelfops_migrations(version, filename, checksum) VALUES ($1, $2, $3)",
            [migration.version, migration.filename, migration.checksum]
          );
          await client.query("COMMIT");
          applied.push(migration.filename);
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      }
    }
    const remaining = mode === "apply" ? [] : pending.map(({ filename }) => filename);
    return { status: remaining.length === 0 ? "current" : "pending", current: ledger.rows.length + applied.length, pending: remaining, applied, drift: [] };
  } finally {
    try {
      if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended('shelfops:migrations', 0))");
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}

async function readConnection(): Promise<Partial<MigrationConnection>> {
  const { readDatabaseConnectionConfig } = await import("@shelfops/infrastructure/postgres/database-config");
  return readDatabaseConnectionConfig(process.env);
}

async function main(): Promise<void> {
  let mode: Mode | undefined;
  try {
    mode = process.argv[2] === "status" ? "status" : process.argv[2] === undefined ? "apply" : undefined;
    if (!mode) throw new MigrationError("migration-mode-invalid");
    if (!process.env.DATABASE_URL) throw new MigrationError("database-url-required");
    let connection: Partial<MigrationConnection>;
    try {
      connection = await readConnection();
    } catch (error) {
      throw new MigrationError("database-config-invalid", [], error instanceof Error ? error.message : undefined);
    }
    const directory = resolve(process.cwd(), "migrations");
    console.log(JSON.stringify(await migrate(process.env.DATABASE_URL, directory, mode, connection)));
  } catch (error) {
    const migrationError = error instanceof MigrationError ? error : new MigrationError("database-or-migration-failed");
    const status = migrationError.code === "migration-drift" ? "drift" : mode === "apply" ? "failed" : "unavailable";
    console.error(JSON.stringify({ status, error: migrationError.code, drift: migrationError.drift, ...(migrationError.detail ? { detail: migrationError.detail } : {}) }));
    process.exitCode = 1;
  }
}

if (require.main === module) void main();
