import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/**
 * PostgreSQL connection configuration shared by the API process and the one-off
 * migration CLI. The API imports this module through its package subpath; the
 * migration CLI loads it at run time so both apply the same SSL and timeout rules.
 */
export type DatabaseSslMode = "disable" | "require" | "verify-full";

export interface DatabasePoolSettings {
  max: number;
  statement_timeout: number;
  idleTimeoutMillis: number;
}

export interface DatabaseConnectionConfig extends DatabasePoolSettings {
  ssl: false | { ca?: string; rejectUnauthorized: boolean };
}

export interface DatabaseConnectionOptions {
  /** Test seam: reads a CA bundle from disk. */
  readCaBundle?: (path: string) => Promise<string>;
}

/** Bundled Amazon RDS global trust store, downloaded into the image at build time. */
export const DEFAULT_DATABASE_CA_PATH = resolve(process.cwd(), "certs", "global-bundle.pem");

const SSL_MODES: readonly DatabaseSslMode[] = ["disable", "require", "verify-full"];
const SSL_MODE_MESSAGE = "DATABASE_SSL_MODE must be one of disable, require, verify-full";

export function parseDatabaseSslMode(value: string | undefined): DatabaseSslMode {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (normalized === "") return "disable";
  if ((SSL_MODES as readonly string[]).includes(normalized)) return normalized as DatabaseSslMode;
  throw new Error(SSL_MODE_MESSAGE);
}

function positiveInteger(value: string | undefined, fallback: number, name: string): number {
  const raw = value?.trim() ?? "";
  if (raw === "") return fallback;
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new Error(`${name} must be a positive integer`);
  return Number(raw);
}

export function parseDatabasePoolSettings(environment: Readonly<Record<string, string | undefined>>): DatabasePoolSettings {
  return {
    max: positiveInteger(environment.DATABASE_POOL_MAX, 10, "DATABASE_POOL_MAX"),
    statement_timeout: positiveInteger(environment.DATABASE_STATEMENT_TIMEOUT_MS, 30_000, "DATABASE_STATEMENT_TIMEOUT_MS"),
    idleTimeoutMillis: positiveInteger(environment.DATABASE_IDLE_TIMEOUT_MS, 10_000, "DATABASE_IDLE_TIMEOUT_MS")
  };
}

export async function readDatabaseConnectionConfig(
  environment: Readonly<Record<string, string | undefined>>,
  options: DatabaseConnectionOptions = {}
): Promise<DatabaseConnectionConfig> {
  const mode = parseDatabaseSslMode(environment.DATABASE_SSL_MODE);
  const pool = parseDatabasePoolSettings(environment);
  if (mode === "disable") return { ssl: false, ...pool };
  if (mode === "require") return { ssl: { rejectUnauthorized: false }, ...pool };

  const caPath = environment.DATABASE_SSL_CA_PATH?.trim() || DEFAULT_DATABASE_CA_PATH;
  const readCaBundle = options.readCaBundle ?? ((path: string) => readFile(path, "utf8"));
  let ca: string;
  try {
    ca = await readCaBundle(caPath);
  } catch {
    throw new Error(`DATABASE_SSL_CA_PATH could not be read: ${caPath}`);
  }
  return { ssl: { ca, rejectUnauthorized: true }, ...pool };
}
