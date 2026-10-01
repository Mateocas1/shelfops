import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DATABASE_CA_PATH,
  parseDatabasePoolSettings,
  parseDatabaseSslMode,
  readDatabaseConnectionConfig
} from "./database-config.js";

const resolvedDefaultCaPath = DEFAULT_DATABASE_CA_PATH;

describe("database configuration", () => {
  describe("parseDatabaseSslMode", () => {
    it("defaults to disable when unset or blank", () => {
      expect(parseDatabaseSslMode(undefined)).toBe("disable");
      expect(parseDatabaseSslMode("")).toBe("disable");
      expect(parseDatabaseSslMode("   ")).toBe("disable");
    });

    it.each(["disable", "require", "verify-full"] as const)("accepts %s", (mode) => {
      expect(parseDatabaseSslMode(mode)).toBe(mode);
      expect(parseDatabaseSslMode(`  ${mode.toUpperCase()}  `)).toBe(mode);
    });

    it.each(["prefer", "allow", "verify-ca", "true", "yes"])("rejects unsupported mode %s", (mode) => {
      expect(() => parseDatabaseSslMode(mode)).toThrow("DATABASE_SSL_MODE must be one of disable, require, verify-full");
    });
  });

  describe("parseDatabasePoolSettings", () => {
    it("uses safe defaults when unset", () => {
      expect(parseDatabasePoolSettings({})).toEqual({ max: 10, statement_timeout: 30_000, idleTimeoutMillis: 10_000 });
    });

    it("reads positive integers from the environment", () => {
      expect(parseDatabasePoolSettings({
        DATABASE_POOL_MAX: "25",
        DATABASE_STATEMENT_TIMEOUT_MS: "5000",
        DATABASE_IDLE_TIMEOUT_MS: "1500"
      })).toEqual({ max: 25, statement_timeout: 5_000, idleTimeoutMillis: 1_500 });
    });

    it("treats blank values as unset", () => {
      expect(parseDatabasePoolSettings({ DATABASE_POOL_MAX: "  ", DATABASE_STATEMENT_TIMEOUT_MS: "" }))
        .toMatchObject({ max: 10, statement_timeout: 30_000 });
    });

    it.each([
      ["DATABASE_POOL_MAX", "0"],
      ["DATABASE_POOL_MAX", "-3"],
      ["DATABASE_POOL_MAX", "ten"],
      ["DATABASE_POOL_MAX", "1.5"],
      ["DATABASE_STATEMENT_TIMEOUT_MS", "0"],
      ["DATABASE_STATEMENT_TIMEOUT_MS", "1e3"],
      ["DATABASE_IDLE_TIMEOUT_MS", "-1"]
    ])("rejects invalid %s=%s", (name, value) => {
      expect(() => parseDatabasePoolSettings({ [name]: value })).toThrow(`${name} must be a positive integer`);
    });
  });

  describe("readDatabaseConnectionConfig", () => {
    it("disables SSL without reading any CA bundle", async () => {
      const readCaBundle = vi.fn();
      await expect(readDatabaseConnectionConfig({ DATABASE_SSL_MODE: "disable" }, { readCaBundle }))
        .resolves.toEqual({ ssl: false, max: 10, statement_timeout: 30_000, idleTimeoutMillis: 10_000 });
      expect(readCaBundle).not.toHaveBeenCalled();
    });

    it("requests encryption without verification in require mode", async () => {
      const readCaBundle = vi.fn();
      await expect(readDatabaseConnectionConfig({ DATABASE_SSL_MODE: "require" }, { readCaBundle }))
        .resolves.toMatchObject({ ssl: { rejectUnauthorized: false } });
      expect(readCaBundle).not.toHaveBeenCalled();
    });

    it("loads the configured CA bundle in verify-full mode", async () => {
      const readCaBundle = vi.fn(async () => "-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----\n");
      const config = await readDatabaseConnectionConfig(
        { DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA_PATH: "/etc/shelfops/rds-ca.pem" },
        { readCaBundle }
      );
      expect(readCaBundle).toHaveBeenCalledWith("/etc/shelfops/rds-ca.pem");
      expect(config.ssl).toEqual({ ca: "-----BEGIN CERTIFICATE-----\nca\n-----END CERTIFICATE-----\n", rejectUnauthorized: true });
    });

    it("defaults verify-full to the bundled RDS CA path", async () => {
      const readCaBundle = vi.fn(async () => "ca");
      await readDatabaseConnectionConfig({ DATABASE_SSL_MODE: "verify-full" }, { readCaBundle });
      expect(readCaBundle).toHaveBeenCalledWith(resolvedDefaultCaPath);
      expect(resolvedDefaultCaPath.endsWith("/certs/global-bundle.pem")).toBe(true);
    });

    it("fails fast on an invalid mode before reading the CA bundle", async () => {
      const readCaBundle = vi.fn();
      await expect(readDatabaseConnectionConfig({ DATABASE_SSL_MODE: "probably" }, { readCaBundle }))
        .rejects.toThrow("DATABASE_SSL_MODE must be one of disable, require, verify-full");
      expect(readCaBundle).not.toHaveBeenCalled();
    });

    it("fails fast when the verify-full CA bundle cannot be read", async () => {
      await expect(readDatabaseConnectionConfig(
        { DATABASE_SSL_MODE: "verify-full", DATABASE_SSL_CA_PATH: "/missing/ca.pem" },
        { readCaBundle: async () => { throw new Error("ENOENT"); } }
      )).rejects.toThrow("DATABASE_SSL_CA_PATH could not be read: /missing/ca.pem");
    });
  });
});
