import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/ci.yml";

describe("CI workflow", () => {
  it("runs the frozen Linux check matrix with bounded authority", async () => {
    const workflow = await readFile(workflowPath, "utf8");
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as { packageManager: string; engines: { node: string } };
    const pnpmVersion = manifest.packageManager.split("@")[1]; const nodeVersion = manifest.engines.node.replace(">=", "");
    const actions = [...workflow.matchAll(/uses: ([^\s]+)/g)].map((match) => match[1]);
    const commands = [...workflow.matchAll(/^\s+run: (.+)$/gm)].map((match) => match[1]);

    expect(workflow).toMatch(/^name: CI$/m);
    expect(workflow).toMatch(/permissions:\s*\n\s+contents: read/);
    expect(workflow).toMatch(/concurrency:[\s\S]*group: ci-[\s\S]*cancel-in-progress: true/);
    expect(workflow).toMatch(/runs-on: ubuntu-latest/);
    expect(actions).toEqual(["actions/checkout@v4", "pnpm/action-setup@v4", "actions/setup-node@v4"]);
    expect(workflow).toContain(`version: ${pnpmVersion}`); expect(workflow).toContain(`node-version: ${nodeVersion}`);
    expect(commands).toEqual([
      "pnpm install --frozen-lockfile",
      "pnpm build:producers",
      "pnpm typecheck",
      "pnpm test:unit",
      "docker info",
      "pnpm test:integration",
      "pnpm test:contract",
      "pnpm openapi:generate",
      "git diff --exit-code -- openapi/openapi.json",
      "pnpm build"
    ]);
    expect(workflow).not.toMatch(/continue-on-error|secrets\.|publish|deploy|seed/i);
    expect(commands.join("\n")).not.toMatch(/playwright|test:e2e/i);
  });

  it("preserves serial shell-free integration cleanup and documents local parity", async () => {
    const integrationConfig = await readFile("vitest.integration.config.ts", "utf8");
    const runner = await readFile("scripts/run-integration-tests.ts", "utf8");
    const docs = await readFile("docs/development.md", "utf8");

    expect(integrationConfig).toMatch(/fileParallelism:\s*false/);
    expect(runner).toMatch(/spawn\(command, args,[\s\S]*shell:\s*false/);
    expect(runner).toMatch(/label=\$\{cleanupLabel\}/);
    for (const guidance of [
      /pnpm install --frozen-lockfile/,
      /pnpm build:producers[\s\S]*pnpm typecheck[\s\S]*pnpm test:unit[\s\S]*pnpm test:integration[\s\S]*pnpm test:contract/,
      /pnpm openapi:generate[\s\S]*git diff --exit-code -- openapi\/openapi.json[\s\S]*pnpm build/,
      /Docker[\s\S]*PostgreSQL 16[\s\S]*Testcontainers/i,
      /failure[\s\S]*generated output[\s\S]*dist/i,
      /Playwright[\s\S]*future[\s\S]*not run/i,
      /does not[\s\S]*publish[\s\S]*deploy/i
    ]) expect(docs).toMatch(guidance);
  });
});
