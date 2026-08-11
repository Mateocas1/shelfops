import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const root = new URL("../../../", import.meta.url);
const load = (path: string) => readFile(new URL(path, root), "utf8");

describe("local production smoke topology", () => {
  it("pins and isolates the hardened API and persistent PostgreSQL services", async () => {
    const compose = await load("infra/compose.production-smoke.yml");

    expect(compose).toContain("postgres:16.10-bookworm@sha256:38471f330eb885e04de130b768d6db4e10469e2311879c7e5c699f6d2d8a1c74");
    expect(compose).toContain("dockerfile: Dockerfile.api");
    expect(compose).toContain("shelfops-production-smoke-db:/var/lib/postgresql/data");
    expect(compose).toContain("internal: true");
    expect(compose).toMatch(/127\.0\.0\.1:\$\{SMOKE_(?:DB|API)_PORT/);
    expect(compose).toContain("pg_isready");
    expect(compose).toContain("/ready");
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toContain("restart: unless-stopped");
    for (const line of compose.split("\n").filter((candidate) => /(?:password|secret):/i.test(candidate))) {
      expect(line).toContain("${");
    }
  });

  it("ships rejected placeholders and bounded loopback-only orchestration", async () => {
    const [environment, script, packageJson] = await Promise.all([
      load(".env.production.example"),
      load("scripts/smoke-production.ts"),
      load("package.json"),
    ]);

    expect(environment).toContain("replace-with-");
    expect(environment).not.toMatch(/DATABASE_URL=/);
    expect(script).toContain('const PROJECT = "shelfops-production-smoke"');
    expect(script).toContain("127.0.0.1");
    expect(script).toContain("pnpm");
    expect(script).toContain("migrate:status");
    expect(script).toContain("restart");
    expect(script).toMatch(/\["down", "--volumes"/);
    expect(script).toMatch(/setTimeout|AbortSignal\.timeout/);
    expect(script).not.toMatch(/console\.(?:log|error)\([^\n]*(?:DATABASE_URL|POSTGRES_PASSWORD|CURSOR_SECRET)/);
    expect(JSON.parse(packageJson).scripts["smoke:production"]).toBe("tsx scripts/smoke-production.ts");
  });
});
