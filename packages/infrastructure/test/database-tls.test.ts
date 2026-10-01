import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { readDatabaseConnectionConfig } from "../src/postgres/database-config.js";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const tlsOnlyHba = ["local all all trust", "hostssl all all all scram-sha-256", "hostnossl all all all reject", ""].join("\n");
const tlsHealthCheck = "PGPASSWORD=test psql 'host=localhost port=5432 dbname=tls_only user=test sslmode=require' -tAc 'SELECT 1'";

let certificates: string;
let caCertificatePath: string;
let unrelatedCaPath: string;
let tlsOnly: Awaited<ReturnType<PostgreSqlContainer["start"]>>;
let plaintext: Awaited<ReturnType<PostgreSqlContainer["start"]>>;

function openssl(directory: string, args: string[]): void {
  execFileSync("openssl", args, { cwd: directory, stdio: "pipe" });
}

async function connect(connectionString: string, environment: NodeJS.ProcessEnv) {
  const config = await readDatabaseConnectionConfig(environment);
  const client = new Client({ connectionString, ...config });
  try {
    await client.connect();
    return (await client.query<{ value: number }>("SELECT 1 AS value")).rows;
  } finally {
    await client.end().catch(() => undefined);
  }
}

describe("PostgreSQL TLS configuration", () => {
  beforeAll(async () => {
    certificates = await mkdtemp(join(tmpdir(), "shelfops-tls-"));
    openssl(certificates, ["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "2", "-nodes", "-keyout", "ca.key", "-out", "ca.crt", "-subj", "/CN=shelfops-test-ca"]);
    openssl(certificates, ["req", "-x509", "-newkey", "rsa:2048", "-sha256", "-days", "2", "-nodes", "-keyout", "other-ca.key", "-out", "other-ca.crt", "-subj", "/CN=shelfops-other-ca"]);
    openssl(certificates, ["req", "-newkey", "rsa:2048", "-sha256", "-nodes", "-keyout", "server.key", "-out", "server.csr", "-subj", "/CN=localhost"]);
    await writeFile(
      join(certificates, "server.cnf"),
      "[server]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n"
    );
    openssl(certificates, ["x509", "-req", "-in", "server.csr", "-CA", "ca.crt", "-CAkey", "ca.key", "-CAcreateserial", "-out", "server.crt", "-days", "2", "-sha256", "-extfile", "server.cnf", "-extensions", "server"]);
    caCertificatePath = join(certificates, "ca.crt");
    unrelatedCaPath = join(certificates, "other-ca.crt");

    tlsOnly = await new PostgreSqlContainer(image)
      .withDatabase("tls_only")
      .withSSL(join(certificates, "server.crt"), join(certificates, "server.key"), caCertificatePath)
      .withCopyContentToContainer([{ content: tlsOnlyHba, target: "/tmp/testcontainers-node/postgres/pg_hba.conf", mode: 0o644 }])
      .withCommand(["postgres", "-c", "hba_file=/tmp/testcontainers-node/postgres/pg_hba.conf"])
      .withHealthCheck({ test: ["CMD-SHELL", tlsHealthCheck], interval: 250, timeout: 1_000, retries: 1_000 })
      .start();
    plaintext = await new PostgreSqlContainer(image).withDatabase("plaintext").start();
  }, 180_000);

  afterAll(async () => {
    await Promise.all([tlsOnly?.stop(), plaintext?.stop()]);
    if (certificates) await rm(certificates, { recursive: true, force: true });
  });

  it("connects with verify-full to a TLS-only server using the generated CA", async () => {
    await expect(connect(tlsOnly.getConnectionUri(), {
      DATABASE_SSL_MODE: "verify-full",
      DATABASE_SSL_CA_PATH: caCertificatePath
    })).resolves.toEqual([{ value: 1 }]);
  });

  it("rejects verify-full when the CA does not sign the server certificate", async () => {
    await expect(connect(tlsOnly.getConnectionUri(), {
      DATABASE_SSL_MODE: "verify-full",
      DATABASE_SSL_CA_PATH: unrelatedCaPath
    })).rejects.toThrow();
  });

  it("encrypts without verification in require mode against a TLS-only server", async () => {
    await expect(connect(tlsOnly.getConnectionUri(), { DATABASE_SSL_MODE: "require" }))
      .resolves.toEqual([{ value: 1 }]);
  });

  it("rejects a non-encrypted connection to a TLS-only server", async () => {
    await expect(connect(tlsOnly.getConnectionUri(), { DATABASE_SSL_MODE: "disable" })).rejects.toThrow();
  });

  it("rejects require mode against a server without TLS", async () => {
    await expect(connect(plaintext.getConnectionUri(), { DATABASE_SSL_MODE: "require" })).rejects.toThrow();
  });

  it("connects with ssl disabled against a server without TLS", async () => {
    await expect(connect(plaintext.getConnectionUri(), { DATABASE_SSL_MODE: "disable" }))
      .resolves.toEqual([{ value: 1 }]);
  });

  it("keeps the generated CA material available for the server chain", async () => {
    expect(await readFile(caCertificatePath, "utf8")).toContain("BEGIN CERTIFICATE");
  });
});
