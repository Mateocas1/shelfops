import { readFile } from "node:fs/promises";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const id = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { organization: id(1), store: id(10), sector: id(11), location: id(12), actor: id(13), assignee: id(14), policy: id(50), warning: id(100), unchanged: id(101), partial: id(102), breached: id(103), rollback: id(104) };
const migrations = ["001_reference-data.sql", "002_identity-sessions.sql", "003_configuration-events.sql", "004_reference-configuration-idempotency.sql", "005_incidents-core.sql", "006_team-assignments.sql", "007_incident-creation.sql", "008_sla-policy-and-cycles.sql", "009_sla-policy-configuration.sql", "010_recurrence-authority.sql", "011_triage.sql"];
const principal: AuthorizedPrincipal = { id: ids.actor, active: true, roleScopes: [{ role: "central-operations", storeIds: [ids.store], sectorIds: [], categoryResponsibilities: ["out-of-stock"], teamIds: [] }], grants: [{ action: "triage", role: "central-operations" }] };

type Decision = Readonly<{ field: "category" | "severity" | "assignee"; disposition: "confirmed" | "corrected" | "manual"; value: string; reason?: string }>;
type DecisionInput = Readonly<{ incidentId: string; evaluationId: string; expectedVersion: number; idempotencyKey: string; correlationId: string; complete: boolean; decisions: readonly Decision[] }>;
type TriageExecutor = Readonly<{ execute(principal: AuthorizedPrincipal, input: Readonly<{ incidentId: string; expectedVersion: number; idempotencyKey: string; correlationId: string }>): Promise<unknown>; decide(principal: AuthorizedPrincipal, input: DecisionInput): Promise<unknown> }>;
type TriageExecutorModule = Readonly<{ PostgresTriageAuthorityExecutor: new(pool: Pool) => TriageExecutor }>;
type CycleSeed = Readonly<{ snapshotId: string; cycleId: string; segmentId: string; startedAt: Date }>;

async function authority(pool: Pool): Promise<TriageExecutor> {
  const module = await import("../src/triage/postgres-triage-authority-executor.js") as TriageExecutorModule;
  return new module.PostgresTriageAuthorityExecutor(pool);
}

async function seedCycle(pool: Pool, incidentId: string, slot: number, secondsAgo: number): Promise<CycleSeed> {
  const startedAt = (await pool.query<{ value: Date }>("SELECT transaction_timestamp() - ($1::text || ' seconds')::interval value", [secondsAgo])).rows[0]!.value;
  const snapshotId = id(slot), cycleId = id(slot + 1), segmentId = id(slot + 2);
  const warningAt = new Date(startedAt.getTime() + 172_800_000), deadlineAt = new Date(startedAt.getTime() + 259_200_000);
  await pool.query("INSERT INTO incidents(id,organization_id,store_id,sector_id,location_id,category_key,severity_key,title,description,occurred_at,reporter_user_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,'out-of-stock','low','Incident','Incident',$6,$7,$6,$6)", [incidentId, ids.organization, ids.store, ids.sector, ids.location, startedAt, ids.actor]);
  await pool.query("INSERT INTO incident_sla_rule_snapshots(id,incident_id,organization_id,policy_version_id,policy_version,category_key,severity_key,clock_mode,pauses_when_blocked,warning_after_seconds,deadline_after_seconds) VALUES($1,$2,$3,$4,1,'out-of-stock','low','continuous-utc',false,172800,259200)", [snapshotId, incidentId, ids.organization, ids.organization]);
  await pool.query("INSERT INTO incident_sla_cycles(id,incident_id,snapshot_id,sequence,condition,started_at,warning_at,deadline_at) VALUES($1,$2,$3,1,'on-track',$4,$5,$6)", [cycleId, incidentId, snapshotId, startedAt, warningAt, deadlineAt]);
  await pool.query("INSERT INTO incident_sla_segments(id,cycle_id,snapshot_id,incident_id,sequence,started_at,warning_at,deadline_at,active) VALUES($1,$2,$3,$4,1,$5,$6,$7,true)", [segmentId, cycleId, snapshotId, incidentId, startedAt, warningAt, deadlineAt]);
  return { snapshotId, cycleId, segmentId, startedAt };
}

describe("PostgreSQL triage SLA recalculation", () => {
  it("replaces the active segment prospectively after an effective category or severity correction", async () => {
    const container = await new PostgreSqlContainer(image).withDatabase("triage_sla_recalculation").start();
    const pool = new Pool({ connectionString: container.getConnectionUri() });
    try {
      for (const migration of migrations) await pool.query(await readFile(`migrations/${migration}`, "utf8"));
      await pool.query("INSERT INTO stores(id,organization_id,name) VALUES($1,$2,'Store')", [ids.store, ids.organization]);
      await pool.query("INSERT INTO sectors(id,organization_id,store_id,name) VALUES($1,$2,$3,'Sector')", [ids.sector, ids.organization, ids.store]);
      await pool.query("INSERT INTO locations(id,organization_id,store_id,sector_id,name) VALUES($1,$2,$3,$4,'Location')", [ids.location, ids.organization, ids.store, ids.sector]);
      await pool.query("INSERT INTO users(id,organization_id,name) VALUES($1,$3,'Actor'),($2,$3,'Assignee')", [ids.actor, ids.assignee, ids.organization]);
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'central-operations')", [ids.actor]);
      await pool.query("INSERT INTO user_store_scopes(user_id,store_id) VALUES($1,$2)", [ids.actor, ids.store]);
      await pool.query("INSERT INTO category_responsibilities(user_id,category_key) VALUES($1,'out-of-stock')", [ids.actor]);
      await pool.query("INSERT INTO action_grants(user_id,action,role) VALUES($1,'triage','central-operations')", [ids.actor]);
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'sector-lead')", [ids.assignee]);
      await pool.query("INSERT INTO user_store_scopes(user_id,store_id) VALUES($1,$2)", [ids.assignee, ids.store]);
      await pool.query("INSERT INTO user_sector_scopes(user_id,sector_id) VALUES($1,$2)", [ids.assignee, ids.sector]);
      await pool.query("INSERT INTO sla_policy_versions(id,organization_id,version,active,clock_mode,pauses_when_blocked,effective_at) VALUES($1,$2,2,true,'continuous-utc',false,transaction_timestamp())", [ids.policy, ids.organization]);
      await pool.query("INSERT INTO sla_policy_rules(policy_version_id,organization_id,category_key,severity_key,warning_after_seconds,deadline_after_seconds) VALUES($1,$2,'out-of-stock','high',60,120)", [ids.policy, ids.organization]);
      const seeded = await seedCycle(pool, ids.warning, 101, 90);
      const executor = await authority(pool);
      const evaluation = await executor.execute(principal, { incidentId: ids.warning, expectedVersion: 1, idempotencyKey: "evaluate-warning", correlationId: "evaluation" }) as { evaluation: { id: string } };
      await executor.decide(principal, { incidentId: ids.warning, evaluationId: evaluation.evaluation.id, expectedVersion: 2, idempotencyKey: "decide-warning", correlationId: "decision", complete: true, decisions: [{ field: "category", disposition: "confirmed", value: "out-of-stock" }, { field: "severity", disposition: "corrected", value: "high", reason: "Urgency increased" }, { field: "assignee", disposition: "manual", value: ids.assignee, reason: "Selected eligible assignee" }] });

      const segments = await pool.query<{ id: string; sequence: number; active: boolean; ended_at: Date | null; started_at: Date; snapshot_id: string; policy_version: number; category_key: string; severity_key: string; warning_at: Date; deadline_at: Date }>("SELECT segment.id,segment.sequence,segment.active,segment.ended_at,segment.started_at,segment.snapshot_id,snapshot.policy_version,snapshot.category_key,snapshot.severity_key,segment.warning_at,segment.deadline_at FROM incident_sla_segments segment JOIN incident_sla_rule_snapshots snapshot ON snapshot.id=segment.snapshot_id WHERE segment.incident_id=$1 ORDER BY segment.sequence", [ids.warning]);
      const decidedAt = (await pool.query<{ decided_at: Date }>("SELECT decided_at FROM triage_decision_sets WHERE incident_id=$1", [ids.warning])).rows[0]!.decided_at;
      expect(segments.rows).toHaveLength(2);
      expect(segments.rows[0]).toMatchObject({ id: seeded.segmentId, sequence: 1, active: false, snapshot_id: seeded.snapshotId });
      expect(segments.rows[1]).toMatchObject({ sequence: 2, active: true, ended_at: null, policy_version: 2, category_key: "out-of-stock", severity_key: "high" });
      expect(segments.rows.filter((segment) => segment.active)).toHaveLength(1);
      expect(segments.rows[0]!.ended_at?.toISOString()).toBe(decidedAt.toISOString());
      expect(segments.rows[1]!.started_at.toISOString()).toBe(decidedAt.toISOString());
      expect(segments.rows[1]!.warning_at.toISOString()).toBe(new Date(seeded.startedAt.getTime() + 60_000).toISOString());
      expect(segments.rows[1]!.deadline_at.toISOString()).toBe(new Date(seeded.startedAt.getTime() + 120_000).toISOString());
      await expect(pool.query("SELECT snapshot_id,condition,started_at FROM incident_sla_cycles WHERE id=$1", [seeded.cycleId])).resolves.toMatchObject({ rows: [{ snapshot_id: segments.rows[1]!.snapshot_id, condition: "warning", started_at: seeded.startedAt }] });
      expect((await pool.query<{ event_type: string; origin: string }>("SELECT event_type,origin FROM incident_events WHERE incident_id=$1 ORDER BY sequence", [ids.warning])).rows).toEqual([{ event_type: "triage-evaluated", origin: "system" }, { event_type: "triage-decided", origin: "human" }, { event_type: "incident-classified", origin: "human" }, { event_type: "sla-segment-recalculated", origin: "system" }, { event_type: "sla-warning", origin: "system" }]);

      const eventTypes = async (incidentId: string) => (await pool.query<{ event_type: string }>("SELECT event_type FROM incident_events WHERE incident_id=$1 ORDER BY sequence", [incidentId])).rows.map((row) => row.event_type);
      const evaluate = async (incidentId: string) => ((await executor.execute(principal, { incidentId, expectedVersion: 1, idempotencyKey: `evaluate-${incidentId}`, correlationId: "evaluation" })) as { evaluation: { id: string } }).evaluation.id;
      const complete = (incidentId: string, evaluationId: string, severity: "high" | "critical", key: string): DecisionInput => ({ incidentId, evaluationId, expectedVersion: 2, idempotencyKey: key, correlationId: key, complete: true, decisions: [{ field: "category", disposition: "confirmed", value: "out-of-stock" }, { field: "severity", disposition: "corrected", value: severity, reason: "Urgency changed" }, { field: "assignee", disposition: "manual", value: ids.assignee, reason: "Selected eligible assignee" }] });
      const unchanged = await seedCycle(pool, ids.unchanged, 111, 90);
      const unchangedEvaluation = await evaluate(ids.unchanged);
      await executor.decide(principal, { incidentId: ids.unchanged, evaluationId: unchangedEvaluation, expectedVersion: 2, idempotencyKey: "unchanged", correlationId: "unchanged", complete: true, decisions: [{ field: "category", disposition: "confirmed", value: "out-of-stock" }, { field: "severity", disposition: "confirmed", value: "low" }, { field: "assignee", disposition: "manual", value: ids.assignee, reason: "Selected eligible assignee" }] });
      await expect(pool.query("SELECT count(*)::int count FROM incident_sla_segments WHERE incident_id=$1", [ids.unchanged])).resolves.toMatchObject({ rows: [{ count: 1 }] });
      await expect(pool.query("SELECT snapshot_id,condition FROM incident_sla_cycles WHERE id=$1", [unchanged.cycleId])).resolves.toMatchObject({ rows: [{ snapshot_id: unchanged.snapshotId, condition: "on-track" }] });
      expect(await eventTypes(ids.unchanged)).toEqual(["triage-evaluated", "triage-decided", "incident-classified"]);
      const partial = await seedCycle(pool, ids.partial, 121, 90);
      const partialEvaluation = await evaluate(ids.partial);
      await executor.decide(principal, { incidentId: ids.partial, evaluationId: partialEvaluation, expectedVersion: 2, idempotencyKey: "partial", correlationId: "partial", complete: false, decisions: [{ field: "severity", disposition: "corrected", value: "high", reason: "Still reviewing" }] });
      await expect(pool.query("SELECT count(*)::int count FROM incident_sla_segments WHERE incident_id=$1", [ids.partial])).resolves.toMatchObject({ rows: [{ count: 1 }] });
      await expect(pool.query("SELECT state,version FROM incidents WHERE id=$1", [ids.partial])).resolves.toMatchObject({ rows: [{ state: "open", version: 3 }] });
      expect(await eventTypes(ids.partial)).toEqual(["triage-evaluated", "triage-decided"]);
      expect((await pool.query("SELECT id FROM incident_sla_cycles WHERE id=$1 AND snapshot_id=$2", [partial.cycleId, partial.snapshotId])).rows).toHaveLength(1);

      await pool.query("INSERT INTO sla_policy_rules(policy_version_id,organization_id,category_key,severity_key,warning_after_seconds,deadline_after_seconds) VALUES($1,$2,'out-of-stock','critical',60,120)", [ids.policy, ids.organization]);
      const breached = await seedCycle(pool, ids.breached, 131, 180);
      const breachedEvaluation = await evaluate(ids.breached);
      await executor.decide(principal, complete(ids.breached, breachedEvaluation, "critical", "breach"));
      await expect(pool.query("SELECT condition FROM incident_sla_cycles WHERE id=$1", [breached.cycleId])).resolves.toMatchObject({ rows: [{ condition: "breached" }] });
      expect(await eventTypes(ids.breached)).toEqual(["triage-evaluated", "triage-decided", "incident-classified", "sla-segment-recalculated", "sla-warning", "sla-breached"]);

      const rollback = await seedCycle(pool, ids.rollback, 141, 90);
      const rollbackEvaluation = await evaluate(ids.rollback);
      const effects = async () => (await pool.query("SELECT (SELECT count(*) FROM triage_decision_sets WHERE incident_id=$1)::int sets,(SELECT count(*) FROM triage_decision_items item JOIN triage_decision_sets set ON set.id=item.decision_set_id WHERE set.incident_id=$1)::int items,(SELECT count(*) FROM incident_events WHERE incident_id=$1)::int events,(SELECT count(*) FROM incident_sla_rule_snapshots WHERE incident_id=$1)::int snapshots,(SELECT count(*) FROM incident_sla_segments WHERE incident_id=$1)::int segments,(SELECT state FROM incidents WHERE id=$1) state,(SELECT version FROM incidents WHERE id=$1)::int version,(SELECT snapshot_id FROM incident_sla_cycles WHERE id=$2)::text snapshot_id", [ids.rollback, rollback.cycleId])).rows[0];
      const beforeFailure = await effects();
      await pool.query("CREATE FUNCTION reject_sla_recalculation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='sla-segment-recalculated' THEN RAISE EXCEPTION 'recalculation rejected'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_sla_recalculation BEFORE INSERT ON incident_events FOR EACH ROW EXECUTE FUNCTION reject_sla_recalculation()");
      await expect(executor.decide(principal, complete(ids.rollback, rollbackEvaluation, "high", "rollback"))).rejects.toThrow("recalculation rejected");
      await pool.query("DROP TRIGGER reject_sla_recalculation ON incident_events");
      expect(await effects()).toEqual(beforeFailure);
    } finally {
      await pool.end();
      await container.stop();
    }
  }, 120_000);
});
