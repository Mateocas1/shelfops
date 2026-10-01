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
      "pnpm lint",
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

describe("AWS delivery workflows", () => {
  const workflows = ["deploy.yml", "infra-plan.yml", "infra-apply.yml"] as const;
  const read = (name: string) => readFile(`.github/workflows/${name}`, "utf8");

  it("pins every third-party action to a commit SHA", async () => {
    for (const name of workflows) {
      const workflow = await read(name);
      const actions = [...workflow.matchAll(/uses:\s*([^\s#]+)/g)].map((match) => match[1]);
      expect(actions.length).toBeGreaterThan(0);
      for (const action of actions) expect(action, `${name}: ${action}`).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
  });

  it("deploys on main with OIDC and is a no-op when the environment is not deployed", async () => {
    const workflow = await read("deploy.yml");

    expect(workflow).toMatch(/branches:\s*\n\s+- main/);
    expect(workflow).toMatch(/id-token:\s*write/);
    expect(workflow).toMatch(/group: deploy-demo/);
    expect(workflow).toContain("aws-actions/configure-aws-credentials@");
    expect(workflow).toContain("--target runtime");
    expect(workflow).toContain("--target migrate");
    expect(workflow).toContain("aws ecs run-task");
    expect(workflow).toContain("aws ecs wait tasks-stopped");
    expect(workflow).toContain("aws ecs update-service");
    expect(workflow).toContain("aws ecs wait services-stable");
    expect(workflow).toContain("SMOKE_URL");
    expect(workflow).toMatch(/Environment not deployed/);
    expect(workflow).not.toMatch(/secrets\.|AWS_ACCESS_KEY_ID|aws-access-key-id/i);
  });

  it("plans infra pull requests into a single sticky comment", async () => {
    const workflow = await read("infra-plan.yml");

    expect(workflow).toMatch(/pull_request:[\s\S]*paths:[\s\S]*- "infra\/\*\*"/);
    expect(workflow).toMatch(/pull-requests:\s*write/);
    expect(workflow).toMatch(/id-token:\s*write/);
    expect(workflow).toContain("<!-- shelfops-terraform-plan -->");
    expect(workflow).toContain("github.rest.issues.updateComment");
    expect(workflow).toContain("aws-actions/configure-aws-credentials@");
  });

  it("gates apply and destroy behind a manual, protected dispatch", async () => {
    const workflow = await read("infra-apply.yml");

    expect(workflow).toMatch(/workflow_dispatch:/);
    expect(workflow).toMatch(/type:\s*choice/);
    expect(workflow).toMatch(/environment:\s*demo-apply/);
    expect(workflow).toContain("terraform apply");
    expect(workflow).toContain("terraform destroy");
    expect(workflow).toMatch(/confirm/i);
  });

  it("never embeds an AWS account id or access key", async () => {
    for (const name of workflows) {
      const workflow = await read(name);
      expect(workflow).not.toMatch(/AKIA[0-9A-Z]{16}/);
      expect(workflow).not.toMatch(/arn:aws:[^\s"']*:[0-9]{12}:/);
    }
  });
});
