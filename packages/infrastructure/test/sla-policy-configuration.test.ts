import { readFile } from "node:fs/promises";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import type { CreateIncidentInput } from "@shelfops/application/incidents/create-incident";
import type { SlaPolicyConfigurationInput } from "@shelfops/application/sla/configure-policy";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { PostgresIncidentCreationExecutor } from "../src/incidents/postgres-incident-creation-executor.js";
import { PostgresSlaPolicyExecutor } from "../src/postgres/sla-policy-executor.js";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const id = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { organization: id(1), store: id(2), sector: id(3), location: id(4), product: id(5), reporter: id(6), central: id(7) };
const reporter: AuthorizedPrincipal = { id: ids.reporter, active: true, roleScopes: [{ role: "collaborator", storeIds: [ids.store], sectorIds: [ids.sector], categoryResponsibilities: [], teamIds: [] }], grants: [] };
const central: AuthorizedPrincipal = { id: ids.central, active: true, roleScopes: [{ role: "central-operations", storeIds: [ids.store], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [{ action: "configure-store-policy", role: "central-operations" }] };
const categories = ["equipment-failure", "inventory-mismatch", "misplaced-product", "other", "out-of-stock", "price-or-label", "replenishment-blocked"];
const severities = ["low", "medium", "high", "critical"];
const rules = () => categories.flatMap((category) => severities.map((severity, index) => ({ category, severity, warningAfterSeconds: 60 + index, deadlineAfterSeconds: 120 + index })));
const incident = (key: string): CreateIncidentInput => ({ storeId: ids.store, sectorId: ids.sector, locationId: ids.location, productId: ids.product, category: "out-of-stock", severity: "high", title: key, description: "Policy selection proof", occurredAt: new Date(Date.now() - 60_000).toISOString(), textEvidence: "Shelf checked", idempotencyKey: key, correlationId: key });

describe("PostgreSQL SLA policy configuration", () => {
  it("persists only future complete versions and preserves existing SLA history on every rejected path", async () => {
    const container = await new PostgreSqlContainer(image).withDatabase("sla_policy_configuration").start(); const pool = new Pool({ connectionString: container.getConnectionUri() });
    try {
      for (const migration of ["001_reference-data.sql", "002_identity-sessions.sql", "003_configuration-events.sql", "004_reference-configuration-idempotency.sql", "005_incidents-core.sql", "006_team-assignments.sql", "007_incident-creation.sql", "008_sla-policy-and-cycles.sql", "009_sla-policy-configuration.sql", "010_recurrence-authority.sql", "011_triage.sql"]) await pool.query(await readFile(`migrations/${migration}`, "utf8"));
      await pool.query("INSERT INTO stores(id,organization_id,name) VALUES($1,$2,'A')", [ids.store, ids.organization]);
      await pool.query("INSERT INTO sectors(id,organization_id,store_id,name) VALUES($1,$2,$3,'S')", [ids.sector, ids.organization, ids.store]);
      await pool.query("INSERT INTO locations(id,organization_id,store_id,sector_id,name) VALUES($1,$2,$3,$4,'L')", [ids.location, ids.organization, ids.store, ids.sector]);
      await pool.query("INSERT INTO products(id,organization_id,name) VALUES($1,$2,'P')", [ids.product, ids.organization]);
      await pool.query("INSERT INTO product_store_availability(product_id,organization_id,store_id) VALUES($1,$2,$3)", [ids.product, ids.organization, ids.store]);
      await pool.query("INSERT INTO users(id,organization_id,name) VALUES($1,$2,'Reporter'),($3,$2,'Central')", [ids.reporter, ids.organization, ids.central]);
      const creation = new PostgresIncidentCreationExecutor(pool); const original = await creation.execute(reporter, incident("original")); if (original.status !== "created") throw new Error("expected creation");
      const frozen = await pool.query<{ value: string }>("SELECT jsonb_build_object('snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM incident_sla_rule_snapshots s WHERE s.incident_id=$1),'cycles',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM incident_sla_cycles c JOIN incident_sla_rule_snapshots s ON s.id=c.snapshot_id WHERE s.incident_id=$1),'segments',(SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id) FROM incident_sla_segments g JOIN incident_sla_cycles c ON c.id=g.cycle_id JOIN incident_sla_rule_snapshots s ON s.id=c.snapshot_id WHERE s.incident_id=$1))::text value", [original.incidentId]);
      const effectiveAt = (await pool.query<{ value: Date }>("SELECT transaction_timestamp() + interval '5 seconds' value")).rows[0]!.value.toISOString();
      const input = (overrides: Partial<SlaPolicyConfigurationInput> = {}): SlaPolicyConfigurationInput => ({ expectedVersion: 1, effectiveAt, idempotencyKey: "policy-v2", rules: rules(), ...overrides });
      const executor = new PostgresSlaPolicyExecutor(pool); const counts = async () => (await pool.query<{ versions: number; rules: number }>("SELECT (SELECT count(*) FROM sla_policy_versions)::int versions,(SELECT count(*) FROM sla_policy_rules)::int rules")).rows[0]!; const before = await counts();
      for (const [actor, candidate, message] of [[{ ...central, roleScopes: [{ ...central.roleScopes[0]!, role: "collaborator" }], grants: [] }, input(), "forbidden"], [central, input({ effectiveAt: "invalid", idempotencyKey: "invalid" }), "invalid-sla-policy"], [central, input({ rules: rules().slice(1) }), "invalid-sla-policy"], [central, input({ rules: [{ ...rules()[0]!, warningAfterSeconds: 0 }, ...rules().slice(1)] }), "invalid-sla-policy"], [central, input({ rules: [...rules(), rules()[0]!] }), "invalid-sla-policy"]] as const) await expect(executor.execute(actor, candidate)).rejects.toThrow(message);
      expect(await counts()).toEqual(before);
      const accepted = await executor.execute(central, input()); expect(accepted).toMatchObject({ version: 2, effectiveAt, policyVersionId: expect.any(String) });
      const replay = await executor.execute(central, input()); expect(replay).toEqual(accepted); expect(pool.idleCount).toBe(1);
      const attribution = await pool.query<{ version: number; effective_at: Date; configured_by_user_id: string; rule_count: number }>("SELECT p.version,p.effective_at,p.configured_by_user_id::text,count(r.*)::int rule_count FROM sla_policy_versions p JOIN sla_policy_rules r ON r.policy_version_id=p.id WHERE p.id=$1 GROUP BY p.id", [accepted.policyVersionId]);
      expect(attribution.rows).toEqual([{ version: 2, effective_at: new Date(effectiveAt), configured_by_user_id: ids.central, rule_count: 28 }]);
      const beforeEffective = await creation.execute(reporter, incident("before-effective")); if (beforeEffective.status !== "created") throw new Error("expected pre-effective creation");
      await expect(pool.query<{ version: number }>("SELECT policy_version version FROM incident_sla_rule_snapshots WHERE incident_id=$1", [beforeEffective.incidentId])).resolves.toMatchObject({ rows: [{ version: 1 }] });
      const observedAt = (await pool.query<{ observed_at: Date }>("SELECT clock_timestamp() observed_at FROM pg_sleep(GREATEST(0, EXTRACT(EPOCH FROM $1::timestamptz - clock_timestamp())))", [effectiveAt])).rows[0]!.observed_at;
      expect(observedAt.getTime(), `database clock ${observedAt.toISOString()} must reach persisted effective_at ${effectiveAt}`).toBeGreaterThanOrEqual(new Date(effectiveAt).getTime()); const afterEffective = await creation.execute(reporter, incident("after-effective")); if (afterEffective.status !== "created") throw new Error("expected post-effective creation");
      await expect(pool.query<{ version: number }>("SELECT policy_version version FROM incident_sla_rule_snapshots WHERE incident_id=$1", [afterEffective.incidentId])).resolves.toMatchObject({ rows: [{ version: 2 }] });
      await expect(executor.execute(central, input({ idempotencyKey: "stale", expectedVersion: 1 }))).rejects.toThrow("stale-version");
      await expect(executor.execute(central, input({ rules: rules().map((rule) => ({ ...rule, warningAfterSeconds: rule.warningAfterSeconds + 1 })) }))).rejects.toThrow("idempotency-conflict");
      await pool.query("CREATE FUNCTION reject_sla_policy_rule() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'rule rejected'; END $$; CREATE TRIGGER reject_sla_policy_rule BEFORE INSERT ON sla_policy_rules FOR EACH ROW EXECUTE FUNCTION reject_sla_policy_rule()");
      await expect(executor.execute(central, input({ expectedVersion: 2, idempotencyKey: "rollback", effectiveAt: new Date(Date.now() + 60_000).toISOString() }))).rejects.toThrow("rule rejected"); await pool.query("DROP TRIGGER reject_sla_policy_rule ON sla_policy_rules");
      expect(await counts()).toEqual({ versions: 2, rules: 56 });
      await expect(pool.query<{ value: string }>("SELECT jsonb_build_object('snapshots',(SELECT jsonb_agg(to_jsonb(s) ORDER BY s.id) FROM incident_sla_rule_snapshots s WHERE s.incident_id=$1),'cycles',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM incident_sla_cycles c JOIN incident_sla_rule_snapshots s ON s.id=c.snapshot_id WHERE s.incident_id=$1),'segments',(SELECT jsonb_agg(to_jsonb(g) ORDER BY g.id) FROM incident_sla_segments g JOIN incident_sla_cycles c ON c.id=g.cycle_id JOIN incident_sla_rule_snapshots s ON s.id=c.snapshot_id WHERE s.incident_id=$1))::text value", [original.incidentId])).resolves.toEqual(frozen);
    } finally { await pool.end(); await container.stop(); }
  }, 120_000);
});
