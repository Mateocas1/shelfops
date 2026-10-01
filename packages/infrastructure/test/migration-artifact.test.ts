import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const artifact = resolve("dist/migrate/migrate.js");

function runArtifact(environment: NodeJS.ProcessEnv, args: string[] = []): string {
  return execFileSync(process.execPath, [artifact, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
}

describe("compiled migration artifact", () => {
  let container: Awaited<ReturnType<PostgreSqlContainer["start"]>>;

  beforeAll(async () => {
    // Producer packages must be built first; the image and CI build them before this suite.
    execFileSync("pnpm", ["run", "build:migrate"], { cwd: process.cwd(), stdio: "pipe" });
    container = await new PostgreSqlContainer(image).withDatabase("migration_artifact").start();
  }, 180_000);

  afterAll(async () => {
    await container?.stop();
  });

  it("applies every migration against a fresh database without tsx", () => {
    const result = JSON.parse(runArtifact({ DATABASE_URL: container.getConnectionUri() }));

    expect(result).toMatchObject({ status: "current", current: 12, pending: [], drift: [] });
    expect(result.applied).toHaveLength(12);
  }, 120_000);

  it("reports current on a repeated status run without reapplying", () => {
    const result = JSON.parse(runArtifact({ DATABASE_URL: container.getConnectionUri() }, ["status"]));

    expect(result).toEqual({ status: "current", current: 12, pending: [], applied: [], drift: [] });
  }, 120_000);

  it("fails fast with a diagnostic for an invalid DATABASE_SSL_MODE", () => {
    let failure: { stderr?: string } | undefined;
    try {
      runArtifact({ DATABASE_URL: container.getConnectionUri(), DATABASE_SSL_MODE: "prefer" });
    } catch (error) {
      failure = error as { stderr?: string };
    }
    expect(failure?.stderr).toContain("database-config-invalid");
    expect(failure?.stderr).toContain("DATABASE_SSL_MODE must be one of disable, require, verify-full");
  }, 120_000);
});
