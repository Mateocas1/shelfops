import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";

const PROJECT = "shelfops-production-smoke";
const COMPOSE = "infra/compose.production-smoke.yml";
const ENV_FILE = process.env.SMOKE_ENV_FILE ?? ".env.production";
const STEP_TIMEOUT_MS = 180_000;

function fail(message: string): never { throw new Error(message); }

async function loadEnvironment(): Promise<NodeJS.ProcessEnv> {
  const values: Record<string, string> = {};
  const source = await readFile(ENV_FILE, "utf8").catch(() => fail(`smoke environment file not found: ${ENV_FILE}`));
  for (const line of source.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) fail("invalid smoke environment line");
    values[line.slice(0, separator)] = line.slice(separator + 1);
  }
  for (const name of ["SMOKE_DB_PASSWORD", "SMOKE_CURSOR_SECRET", "SMOKE_METRICS_BEARER_TOKEN", "SMOKE_DB_PORT", "SMOKE_API_PORT"] as const) {
    if (!values[name] || values[name].includes("replace-with-")) fail(`${name} must replace its example placeholder`);
  }
  const cursorSecret = values.SMOKE_CURSOR_SECRET!;
  if (Buffer.byteLength(cursorSecret) < 32) fail("SMOKE_CURSOR_SECRET must contain at least 32 bytes");
  if (Buffer.byteLength(values.SMOKE_METRICS_BEARER_TOKEN!) < 32) fail("SMOKE_METRICS_BEARER_TOKEN must contain at least 32 bytes");
  for (const name of ["SMOKE_DB_PORT", "SMOKE_API_PORT"] as const) {
    const port = values[name]!;
    if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) fail(`${name} must be a port from 1024 to 65535`);
  }
  if (values.SMOKE_DB_PORT === values.SMOKE_API_PORT) fail("smoke ports must differ");
  if (process.env.DATABASE_URL) fail("DATABASE_URL must be unset; smoke only targets its loopback database");
  return { ...process.env, ...values };
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv, capture = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit" });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    const timer = setTimeout(() => { child.kill("SIGTERM"); reject(new Error(`${command} timed out`)); }, STEP_TIMEOUT_MS);
    child.once("error", (error) => { clearTimeout(timer); reject(error); });
    child.once("exit", (code) => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(`${command} failed with exit ${code ?? "signal"}`)); });
  });
}

const compose = (args: string[], env: NodeJS.ProcessEnv, capture = false) =>
  run("docker", ["compose", "--project-name", PROJECT, "--file", COMPOSE, ...args], env, capture);

async function poll(label: string, probe: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await probe().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  fail(`${label} did not become ready within 90 seconds`);
}

async function main(): Promise<void> {
  const env = await loadEnvironment();
  const databaseUrl = `postgres://shelfops_smoke:${env.SMOKE_DB_PASSWORD}@127.0.0.1:${env.SMOKE_DB_PORT}/shelfops_smoke`;
  const migrationEnv = { ...env, DATABASE_URL: databaseUrl };
  await run("docker", ["info"], env, true);
  await compose(["down", "--volumes", "--remove-orphans"], env);
  let clean = true;
  try {
    await compose(["up", "--detach", "--wait", "db"], env);
    await run("pnpm", ["migrate"], migrationEnv);
    await compose(["up", "--detach", "--build", "--wait", "api"], env);
    const api = `http://127.0.0.1:${env.SMOKE_API_PORT}`;
    for (const path of ["/health", "/ready"]) await poll(path, async () => (await fetch(`${api}${path}`)).ok);
    const canary = "smoke-canary-must-not-appear";
    await fetch(`${api}/health`);
    await fetch(`${api}/unknown/${canary}?sessionId=${canary}`);
    const scrape = async () => fetch(`${api}/metrics`, { headers: { authorization: `Bearer ${env.SMOKE_METRICS_BEARER_TOKEN}` } }).then(async (response) => response.ok ? response.text() : fail(`metrics scrape failed with ${response.status}`));
    const healthyMetrics = await scrape();
    if (!healthyMetrics.includes("shelfops_readiness 1") || !healthyMetrics.includes('route="__unmatched__"') || healthyMetrics.includes(canary)) fail("healthy metrics contract failed");
    const status = await run("pnpm", ["migrate:status"], migrationEnv, true);
    if (!status.includes('"status":"current"') || !status.includes('"current":11')) fail("migration status is not current at version 11");
    await compose(["exec", "-T", "db", "psql", "-U", "shelfops_smoke", "-d", "shelfops_smoke", "-c", "CREATE TABLE smoke_persistence(marker text PRIMARY KEY); INSERT INTO smoke_persistence VALUES ('api-restart');"], env);
    await compose(["restart", "api"], env);
    await poll("restarted API", async () => (await fetch(`${api}/ready`)).ok);
    const persisted = await compose(["exec", "-T", "db", "psql", "-At", "-U", "shelfops_smoke", "-d", "shelfops_smoke", "-c", "SELECT marker FROM smoke_persistence;"], env, true);
    if (persisted.trim() !== "api-restart") fail("database persistence marker was lost");
    const noOp = await run("pnpm", ["migrate"], migrationEnv, true);
    if (!noOp.includes('"applied":[]')) fail("migration reapplication was not a no-op");
    await compose(["stop", "db"], env);
    await poll("database-down readiness", async () => (await fetch(`${api}/ready`)).status === 503);
    const downMetrics = await scrape();
    if (!downMetrics.includes("shelfops_readiness 0") || !downMetrics.includes("shelfops_postgresql_pool_total") || downMetrics.includes(canary)) fail("database-down metrics contract failed");
    await compose(["stop", "api"], env);
    await compose(["down", "--volumes", "--remove-orphans"], env);
    clean = false;
    console.log("production smoke passed: migrations=11 metrics=bounded db-down=visible signal=clean cleanup=complete");
  } finally {
    if (clean) await compose(["down", "--volumes", "--remove-orphans"], env).catch(() => undefined);
  }
}

main().catch((error) => { console.error(`production smoke failed: ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; });
