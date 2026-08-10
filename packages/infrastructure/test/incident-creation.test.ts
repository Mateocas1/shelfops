import { readFile } from "node:fs/promises";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import type { CreateIncidentInput } from "@shelfops/application/incidents/create-incident";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { PostgresAuthorizedIncidentRepository } from "../src/repositories/authorized-incident-repository.js";
import { PostgresIncidentCreationExecutor, type IncidentTransactionPool } from "../src/incidents/postgres-incident-creation-executor.js";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const id = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { organization: id(1), store: id(2), sector: id(3), location: id(4), product: id(5), reporter: id(6) };
const principal: AuthorizedPrincipal = { id: ids.reporter, active: true, roleScopes: [{ role: "collaborator", storeIds: [ids.store], sectorIds: [ids.sector], categoryResponsibilities: [], teamIds: [] }], grants: [] };
const request = (overrides: Partial<CreateIncidentInput> = {}): CreateIncidentInput => ({ storeId: ids.store, sectorId: ids.sector, locationId: ids.location, productId: ids.product, category: "out-of-stock", severity: "high", title: "Empty shelf", description: "No units remain", occurredAt: new Date(Date.now() - 60_000).toISOString(), textEvidence: "Shelf checked", idempotencyKey: "key-a", correlationId: "correlation-a", ...overrides });

function lostCommit(pool: Pool): IncidentTransactionPool {
  return { connect: async () => { const client = await pool.connect(); return { query: async <Row extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => { if (sql === "COMMIT") { await client.query("COMMIT"); throw new Error("acknowledgement lost"); } return values === undefined ? client.query<Row>(sql) : client.query<Row>(sql, [...values]); }, release: (error?: Error | boolean) => client.release(error) }; } };
}

describe("transactional incident creation", () => {
  it("creates atomically, replays safely, and is immediately visible", async () => {
    const container = await new PostgreSqlContainer(image).withDatabase("incident_creation").start();
    const pool = new Pool({ connectionString: container.getConnectionUri() });
    try {
      for (const migration of ["001_reference-data.sql", "005_incidents-core.sql", "006_team-assignments.sql", "007_incident-creation.sql", "008_sla-policy-and-cycles.sql"]) await pool.query(await readFile(`migrations/${migration}`, "utf8"));
      await pool.query("INSERT INTO stores(id,organization_id,name) VALUES($1,$2,'A')", [ids.store, ids.organization]); await pool.query("INSERT INTO sectors(id,organization_id,store_id,name) VALUES($1,$2,$3,'S')", [ids.sector, ids.organization, ids.store]); await pool.query("INSERT INTO locations(id,organization_id,store_id,sector_id,name) VALUES($1,$2,$3,$4,'L')", [ids.location, ids.organization, ids.store, ids.sector]); await pool.query("INSERT INTO products(id,organization_id,name) VALUES($1,$2,'P')", [ids.product, ids.organization]); await pool.query("INSERT INTO product_store_availability(product_id,organization_id,store_id) VALUES($1,$2,$3)", [ids.product, ids.organization, ids.store]); await pool.query("INSERT INTO users(id,organization_id,name) VALUES($1,$2,'Reporter')", [ids.reporter, ids.organization]);
      const matrix = await pool.query<{ severity_key: string; warning_after_seconds: number; deadline_after_seconds: number; cells: number; categories: string[] }>("SELECT severity_key,warning_after_seconds,deadline_after_seconds,count(*)::int cells,array_agg(DISTINCT category_key ORDER BY category_key) categories FROM sla_policy_rules GROUP BY severity_key,warning_after_seconds,deadline_after_seconds ORDER BY deadline_after_seconds");
      expect(matrix.rows).toEqual([{ severity_key: "critical", warning_after_seconds: 3_600, deadline_after_seconds: 7_200, cells: 7, categories: ["equipment-failure", "inventory-mismatch", "misplaced-product", "other", "out-of-stock", "price-or-label", "replenishment-blocked"] }, { severity_key: "high", warning_after_seconds: 14_400, deadline_after_seconds: 28_800, cells: 7, categories: ["equipment-failure", "inventory-mismatch", "misplaced-product", "other", "out-of-stock", "price-or-label", "replenishment-blocked"] }, { severity_key: "medium", warning_after_seconds: 57_600, deadline_after_seconds: 86_400, cells: 7, categories: ["equipment-failure", "inventory-mismatch", "misplaced-product", "other", "out-of-stock", "price-or-label", "replenishment-blocked"] }, { severity_key: "low", warning_after_seconds: 172_800, deadline_after_seconds: 259_200, cells: 7, categories: ["equipment-failure", "inventory-mismatch", "misplaced-product", "other", "out-of-stock", "price-or-label", "replenishment-blocked"] }]);
      await expect(pool.query("SELECT effective_at <= transaction_timestamp() effective FROM sla_policy_versions WHERE active")).resolves.toMatchObject({ rows: [{ effective: true }] });
      const executor = new PostgresIncidentCreationExecutor(pool);
      const creation = request(); const [created, replay] = await Promise.all([executor.execute(principal, creation), executor.execute(principal, { ...creation, title: " Empty shelf " })]);
      expect(created).toEqual(replay); expect(created).toMatchObject({ status: "created", state: "open", version: 1, reporterId: ids.reporter });
      if (created.status !== "created") throw new Error("expected creation");
      const cycle = await pool.query<{ organization_id: string; policy_version: number; category_key: string; severity_key: string; clock_mode: string; pauses_when_blocked: boolean; warning_after_seconds: number; deadline_after_seconds: number; sequence: number; condition: string; active: boolean; started_at: Date; warning_at: Date; deadline_at: Date }>("SELECT s.organization_id,s.policy_version,s.category_key,s.severity_key,s.clock_mode,s.pauses_when_blocked,s.warning_after_seconds,s.deadline_after_seconds,c.sequence,c.condition,g.active,c.started_at,c.warning_at,c.deadline_at FROM incident_sla_rule_snapshots s JOIN incident_sla_cycles c ON c.snapshot_id=s.id JOIN incident_sla_segments g ON g.cycle_id=c.id AND g.snapshot_id=s.id WHERE s.incident_id=$1", [created.incidentId]);
      expect(cycle.rows[0]).toMatchObject({ organization_id: ids.organization, policy_version: 1, category_key: "out-of-stock", severity_key: "high", clock_mode: "continuous-utc", pauses_when_blocked: false, warning_after_seconds: 14_400, deadline_after_seconds: 28_800, sequence: 1, condition: "on-track", active: true });
      expect(cycle.rows[0]!.started_at.toISOString()).toBe(created.createdAt); expect(cycle.rows[0]!.warning_at.toISOString()).toBe(new Date(new Date(created.createdAt).getTime() + 14_400_000).toISOString()); expect(cycle.rows[0]!.deadline_at.toISOString()).toBe(new Date(new Date(created.createdAt).getTime() + 28_800_000).toISOString());
      await expect(pool.query("UPDATE incident_sla_rule_snapshots SET policy_version=2 WHERE incident_id=$1", [created.incidentId])).rejects.toThrow("SLA rule snapshots are immutable");
      await expect(pool.query("DELETE FROM incident_sla_rule_snapshots WHERE incident_id=$1", [created.incidentId])).rejects.toThrow("SLA rule snapshots are immutable");
      await expect(new PostgresAuthorizedIncidentRepository(pool).detail(principal, created.incidentId)).resolves.toMatchObject({ id: created.incidentId, reporterId: ids.reporter, state: "open", version: 1 });
      await expect(executor.execute(principal, { ...creation, textEvidence: "Changed" })).rejects.toThrow("idempotency-conflict");
      await expect(executor.execute(principal, request({ idempotencyKey: "missing-product", productId: undefined }))).rejects.toThrow("invalid-incident-reference");
      await expect(executor.execute(principal, request({ idempotencyKey: "wrong-location", locationId: id(999) }))).rejects.toThrow("invalid-incident-reference");
      await pool.query("UPDATE categories SET active=false WHERE key='out-of-stock'"); await expect(executor.execute(principal, request({ idempotencyKey: "inactive-category" }))).rejects.toThrow("invalid-incident-reference"); await pool.query("UPDATE categories SET active=true WHERE key='out-of-stock'");
      await expect(executor.execute({ ...principal, active: false }, request({ idempotencyKey: "inactive-principal" }))).rejects.toThrow("incident-creation-forbidden");
      await expect(executor.execute({ ...principal, roleScopes: [{ ...principal.roleScopes[0]!, storeIds: [id(999)] }] }, request({ idempotencyKey: "wrong-scope" }))).rejects.toThrow("incident-creation-forbidden");
      await pool.query("CREATE FUNCTION reject_creation_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'event rejected'; END $$; CREATE TRIGGER reject_creation_event BEFORE INSERT ON incident_events FOR EACH ROW EXECUTE FUNCTION reject_creation_event()");
      await expect(executor.execute(principal, request({ idempotencyKey: "atomic-failure" }))).rejects.toThrow("event rejected");
      await pool.query("DROP TRIGGER reject_creation_event ON incident_events");
      const lost = request({ idempotencyKey: "lost", correlationId: "lost-correlation" }); const uncertain = await new PostgresIncidentCreationExecutor(lostCommit(pool)).execute(principal, lost);
      expect(uncertain).toEqual({ status: "indeterminate", correlationId: "lost-correlation", retryWithSameKey: true });
      await expect(executor.execute(principal, lost)).resolves.toMatchObject({ status: "created" });
      await expect(pool.query("UPDATE incident_events SET event_type='changed'")).rejects.toThrow("incident events are immutable");
      await pool.query("CREATE FUNCTION reject_sla_segment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'sla segment rejected'; END $$; CREATE TRIGGER reject_sla_segment BEFORE INSERT ON incident_sla_segments FOR EACH ROW EXECUTE FUNCTION reject_sla_segment()");
      await expect(executor.execute(principal, request({ idempotencyKey: "sla-atomic-failure" }))).rejects.toThrow("sla segment rejected"); await pool.query("DROP TRIGGER reject_sla_segment ON incident_sla_segments");
      await expect(pool.query("INSERT INTO sla_policy_rules(policy_version_id,organization_id,category_key,severity_key,warning_after_seconds,deadline_after_seconds) VALUES($1,$2,'out-of-stock','high',1,2)", [id(7), ids.organization])).rejects.toThrow("foreign key constraint"); await pool.query("UPDATE sla_policy_versions SET active=false WHERE organization_id=$1", [ids.organization]);
      await expect(executor.execute(principal, request({ idempotencyKey: "wrong-organization-policy" }))).rejects.toThrow("missing-sla-rule");
      await expect(pool.query("SELECT incident_events.sequence,event_type,incident_text_evidence.actor_user_id,text FROM incident_events JOIN incident_text_evidence USING(incident_id) WHERE incident_events.incident_id=$1", [created.incidentId])).resolves.toMatchObject({ rows: [{ sequence: 1, event_type: "created", actor_user_id: ids.reporter, text: "Shelf checked" }] });
      const counts = await pool.query("SELECT (SELECT count(*) FROM incidents)::int incidents,(SELECT count(*) FROM incident_text_evidence)::int evidence,(SELECT count(*) FROM incident_events)::int events,(SELECT count(*) FROM incident_creation_idempotency)::int outcomes,(SELECT count(*) FROM incident_sla_rule_snapshots)::int snapshots,(SELECT count(*) FROM incident_sla_cycles)::int cycles,(SELECT count(*) FROM incident_sla_segments)::int segments");
      expect(counts.rows[0]).toEqual({ incidents: 2, evidence: 2, events: 2, outcomes: 2, snapshots: 2, cycles: 2, segments: 2 });
    } finally { await pool.end(); await container.stop(); }
  }, 120_000);
});
