import { spawn } from "node:child_process";
import { resolve } from "node:path";

const cleanupLabel = "org.testcontainers=true";
const cleanupIntervalMs = 250;
const cleanupTimeoutMs = 30_000;

type CommandResult = {
  exitCode: number;
  stderr: string;
  stdout: string;
};

function run(command: string, args: string[], inheritOutput = false, timeoutMs?: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      stdio: inheritOutput ? "inherit" : "pipe"
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;

    const settle = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      callback();
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk;
    });
    child.on("error", (error) => settle(() => reject(error)));
    child.on("close", (code) => settle(() => resolve({ exitCode: code ?? 1, stderr, stdout })));

    if (timeoutMs !== undefined) {
      timeout = setTimeout(() => {
        child.kill();
        settle(() => reject(new Error(`Command timed out after ${timeoutMs}ms: ${command}`)));
      }, timeoutMs);
    }
  });
}

async function labelledResources(deadline: number): Promise<string[]> {
  const remainingMs = deadline - Date.now();
  if (remainingMs <= 0) {
    throw new Error(`Docker cleanup query timed out after ${cleanupTimeoutMs / 1_000}s`);
  }

  const result = await run("docker", ["ps", "-aq", "--filter", `label=${cleanupLabel}`], false, remainingMs);

  if (result.exitCode !== 0) {
    throw new Error(`Docker cleanup query failed: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  return result.stdout.split(/\r?\n/).filter(Boolean);
}

async function waitForCleanup(): Promise<void> {
  const deadline = Date.now() + cleanupTimeoutMs;
  let resources = await labelledResources(deadline);

  while (resources.length > 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, cleanupIntervalMs));
    resources = await labelledResources(deadline);
  }

  if (resources.length > 0) {
    throw new Error(
      `Timed out after ${cleanupTimeoutMs / 1_000}s waiting for Testcontainers-labelled resources to stop: ${resources.join(", ")}`
    );
  }
}

async function main(): Promise<void> {
  const vitestCli = resolve("node_modules", "vitest", "vitest.mjs");
  let testExitCode = 1;

  try {
    const result = await run(process.execPath, [vitestCli, "run", "--config", "vitest.integration.config.ts", ...process.argv.slice(2)], true);
    testExitCode = result.exitCode;
  } catch (error) {
    console.error(`Could not start Vitest: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await waitForCleanup();
  } catch (error) {
    const cleanupError = error instanceof Error ? error.message : String(error);
    console.error(`Testcontainers cleanup failed: ${cleanupError}`);

    if (testExitCode !== 0) {
      console.error(`Integration tests also failed with exit code ${testExitCode}; preserving that exit code.`);
    } else {
      process.exitCode = 1;
      return;
    }
  }

  process.exitCode = testExitCode;
}

void main();
