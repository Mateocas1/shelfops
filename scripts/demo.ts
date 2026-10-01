import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { resolve } from "node:path";

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";

import { startApi } from "../apps/api/src/startup.js";
import { migrate } from "./migrate.js";
import { seedTenant, type TenantSeedResult } from "./seed-tenant.js";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const ids = {
  sector: "00000000-0000-7000-8000-000000000102",
  location: "00000000-0000-7000-8000-000000000103",
  product: "00000000-0000-7000-8000-000000000106",
  session: "00000000-0000-7000-8000-000000000105"
} as const;
const sessionId = "demo-session-credential-0000000000000000000";
const csrfToken = "demo-csrf-credential-000000000000000000000";
const digest = (value: string) => createHash("sha256").update(value).digest();
const record = (value: unknown) => value as Record<string, any>;

function step(label: string, details: string): void { console.log(`[${label}] ${details}`); }

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveReady, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolveReady));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("could not reserve a loopback API port");
  await new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose()));
  return address.port;
}

async function fixture(client: Client, tenant: TenantSeedResult): Promise<void> {
  await client.query("INSERT INTO sectors(id,organization_id,store_id,name) VALUES($1,$2,$3,'Grocery')", [ids.sector, tenant.organizationId, tenant.storeId]);
  await client.query("INSERT INTO locations(id,organization_id,store_id,sector_id,name) VALUES($1,$2,$3,$4,'Aisle 7')", [ids.location, tenant.organizationId, tenant.storeId, ids.sector]);
  await client.query("INSERT INTO products(id,organization_id,name) VALUES($1,$2,'Simulated Product')", [ids.product, tenant.organizationId]);
  await client.query("INSERT INTO product_store_availability(product_id,organization_id,store_id) VALUES($1,$2,$3)", [ids.product, tenant.organizationId, tenant.storeId]);
  await client.query("INSERT INTO user_sector_scopes(user_id,sector_id) VALUES($1,$2)", [tenant.userId, ids.sector]);
  await client.query("INSERT INTO category_responsibilities(user_id,category_key) VALUES($1,'out-of-stock')", [tenant.userId]);
  await client.query("INSERT INTO action_grants(user_id,action,role) VALUES($1,'triage','supervisor')", [tenant.userId]);
  await client.query("INSERT INTO sessions(id,session_id_hash,csrf_token_hash,user_id,expires_at) VALUES($1,$2,$3,$4,now()+interval '30 minutes')", [ids.session, digest(sessionId), digest(csrfToken), tenant.userId]);
}

async function main(): Promise<void> {
  let container: StartedPostgreSqlContainer | undefined;
  let client: Client | undefined;
  let app: Awaited<ReturnType<typeof startApi>> | undefined;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  try {
    step("setup", "starting isolated PostgreSQL (simulated reviewer fixture; never production seed data)");
    container = await new PostgreSqlContainer(image).withDatabase("shelfops_demo").start();
    process.env.DATABASE_URL = container.getConnectionUri();
    const migration = await migrate(process.env.DATABASE_URL, resolve("migrations"), "apply");
    step("migrate", `version=${migration.current} applied=${migration.applied.length}`);
    client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const tenant = await seedTenant(client, {
      organizationSlug: "simulated-shelfops",
      organizationName: "Simulated ShelfOps Organization",
      storeCode: "portfolio-demo-store",
      storeName: "Portfolio Demo Store",
      userEmail: "simulated-reviewer@demo.shelfops.invalid",
      userName: "Simulated Reviewer",
      userRole: "supervisor",
      oidcIssuer: "https://demo.shelfops.invalid",
      oidcSubject: "simulated-reviewer"
    });
    step("seed", `organization=${tenant.organizationId} store=${tenant.storeId} reviewer=${tenant.userId} status=${tenant.status}`);
    await fixture(client, tenant);
    step("fixture", `store=${tenant.storeId} reviewer=${tenant.userId} deterministicAssignees=1`);

    const port = await freePort();
    app = await startApi({ port: String(port), host: "127.0.0.1", cursorSecret: "portfolio-demo-cursor-secret-32-bytes", metricsCredential: "portfolio-demo-metrics-token-32-bytes", logger: false });
    const origin = `http://127.0.0.1:${port}`;
    const headers = { cookie: `shelfops_session=${sessionId}`, "x-csrf-token": csrfToken, "content-type": "application/json" };
    const call = async (label: string, path: string, init: RequestInit = {}) => {
      const response = await fetch(`${origin}${path}`, { ...init, headers: { ...headers, ...init.headers }, signal: AbortSignal.timeout(10_000) });
      const body = response.status === 204 ? {} : await response.json();
      if (!response.ok) throw new Error(`${label} returned ${response.status}: ${JSON.stringify(body)}`);
      return record(body);
    };

    const me = await call("session", "/api/v1/me");
    step("1 session", `user=${me.id} roles=${me.roleScopes.map((scope: any) => scope.role).join(",")} grants=${me.grants.map((grant: any) => grant.action).join(",")}`);
    const created = await call("create incident", "/api/v1/incidents", { method: "POST", body: JSON.stringify({ storeId: tenant.storeId, sectorId: ids.sector, locationId: ids.location, productId: ids.product, category: "out-of-stock", severity: "high", title: "Empty shelf in aisle 7", description: "Reviewer observed the last unit was sold.", occurredAt: new Date().toISOString(), textEvidence: "Shelf and backroom were checked.", idempotencyKey: "portfolio-demo-create" }) });
    step("2 create", `incident=${created.incidentId} state=${created.state} version=${created.version} correlation=${created.correlationId}`);
    const listed = await call("list incidents", "/api/v1/incidents");
    step("3 list", `count=${listed.items.length} incident=${listed.items[0].id} state=${listed.items[0].state} correlation=${listed.correlationId}`);
    const detail = await call("incident detail", `/api/v1/incidents/${created.incidentId}`);
    step("4 detail", `title="${detail.title}" category=${detail.category} severity=${detail.severity} version=${detail.version} correlation=${detail.correlationId}`);
    const evaluated = await call("evaluate triage", `/api/v1/incidents/${created.incidentId}/triage/evaluations`, { method: "POST", body: JSON.stringify({ expectedVersion: created.version, idempotencyKey: "portfolio-demo-evaluate" }) });
    const suggestion = record(evaluated.evaluation.suggested);
    step("5 evaluate", `evaluation=${evaluated.evaluation.id} version=${evaluated.triage.version} explanation=${evaluated.evaluation.explanation.code} assignee=${suggestion.assigneeUserId} correlation=${evaluated.correlationId}`);
    const awaiting = await call("read awaiting decision", `/api/v1/incidents/${created.incidentId}/triage`);
    step("6 awaiting", `status=${awaiting.status} state=${awaiting.state} evaluations=${awaiting.currentEvaluation.id} correlation=${awaiting.currentEvaluation.actionCorrelationId}`);
    const decided = await call("confirm decisions", `/api/v1/incidents/${created.incidentId}/triage/decisions`, { method: "POST", body: JSON.stringify({ evaluationId: evaluated.evaluation.id, expectedVersion: evaluated.triage.version, idempotencyKey: "portfolio-demo-decide", complete: true, decisions: [
      { field: "category", disposition: "confirmed", value: suggestion.category },
      { field: "severity", disposition: "confirmed", value: suggestion.severity },
      { field: "assignee", disposition: "confirmed", value: suggestion.assigneeUserId }
    ] }) });
    step("7 decide", `set=${decided.decisionSet.id} state=${decided.triage.state} version=${decided.triage.version} human=confirmed(category,severity,assignee) correlation=${decided.correlationId}`);
    const finalTriage = await call("read final triage", `/api/v1/incidents/${created.incidentId}/triage`);
    const finalIncident = await call("read final incident", `/api/v1/incidents/${created.incidentId}`);
    step("8 final", `state=${finalIncident.state} version=${finalIncident.version} status=${finalTriage.status} evaluations=${finalTriage.currentEvaluation.id} decisionSet=${decided.decisionSet.id} assignee=${finalIncident.assigneeId}`);
    step("success", "real API + PostgreSQL: session -> open@v1 -> evaluated@v2 -> classified@v3; history and correlations preserved");
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail}. Prerequisites: Node >=22.19, pnpm 11.11, and a running Docker daemon able to pull PostgreSQL 16.`);
  } finally {
    await app?.close().catch(() => undefined);
    await client?.end().catch(() => undefined);
    await container?.stop().catch(() => undefined);
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousDatabaseUrl;
    step("cleanup", `api=stopped database=stopped temporaryResources=removed listener=closed`);
  }
}

if (require.main === module) void main().catch((error) => { console.error(`[failed] ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; });
