import { readFile } from "node:fs/promises";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { TriageForbiddenError, TriageIdempotencyConflictError, TriageInvalidTransitionError, TriageNotFoundError, TriageStaleVersionError, TriageValidationError } from "@shelfops/application/triage/authority";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const id = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { organization: id(1), store: id(10), otherStore: id(11), sector: id(12), location: id(13), actor: id(14), assignee: id(15), alternate: id(16), viewer: id(17), partial: id(20), manual: id(21), stale: id(22), wrong: id(23), concurrent: id(24), revoked: id(25), forbidden: id(26), forbiddenReplay: id(27), classified: id(28), rollback: id(29) };
const migrations = ["001_reference-data.sql", "002_identity-sessions.sql", "003_configuration-events.sql", "004_reference-configuration-idempotency.sql", "005_incidents-core.sql", "006_team-assignments.sql", "007_incident-creation.sql", "008_sla-policy-and-cycles.sql", "009_sla-policy-configuration.sql", "010_recurrence-authority.sql", "011_triage.sql"];
const principal: AuthorizedPrincipal = { id: ids.actor, active: true, roleScopes: [{ role: "supervisor", storeIds: [ids.store], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [] };
const viewer: AuthorizedPrincipal = { id: ids.viewer, active: true, roleScopes: [{ role: "collaborator", storeIds: [ids.store], sectorIds: [ids.sector], categoryResponsibilities: [], teamIds: [] }], grants: [] };

type Decision = Readonly<{ field: "category" | "severity" | "assignee"; disposition: "confirmed" | "corrected" | "manual"; value: string; reason?: string }>;
type DecisionInput = Readonly<{ incidentId: string; evaluationId: string; expectedVersion: number; idempotencyKey: string; correlationId: string; complete: boolean; decisions: readonly Decision[] }>;
type DecisionReceipt = Readonly<{ status: "decided"; incidentId: string; state: "open" | "classified"; version: number; decisionSet: Readonly<{ id: string; complete: boolean; recordedFields: readonly string[]; actionCorrelationId: string }> }>;
type TriageExecutor = Readonly<{ execute(principal: AuthorizedPrincipal, input: Readonly<{ incidentId: string; expectedVersion: number; idempotencyKey: string; correlationId: string }>): Promise<unknown>; decide(principal: AuthorizedPrincipal, input: DecisionInput): Promise<unknown> }>;
type TriageExecutorModule = Readonly<{ PostgresTriageAuthorityExecutor: new(pool: Pool) => TriageExecutor }>;

async function executor(pool: Pool): Promise<TriageExecutor> {
  const module = await import("../src/triage/postgres-triage-authority-executor.js") as TriageExecutorModule;
  return new module.PostgresTriageAuthorityExecutor(pool);
}

function revokeAfterLock(pool: Pool): Pool {
  return { connect: async () => { const client = await pool.connect(); return { query: async <Row extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => { const result = values === undefined ? await client.query<Row>(sql) : await client.query<Row>(sql, [...values]); if (sql === "SELECT pg_advisory_xact_lock($1::bigint)") await client.query("UPDATE users SET active=false WHERE id=$1", [ids.actor]); return result; }, release: (error?: Error | boolean) => client.release(error) }; } } as unknown as Pool;
}

describe("PostgreSQL triage decision authority", () => {
  it("keeps decisions immutable, authorized, idempotent, concurrent-safe, and effectively classified", async () => {
    const container = await new PostgreSqlContainer(image).withDatabase("triage_decisions").start();
    const pool = new Pool({ connectionString: container.getConnectionUri() });
    const insertIncident = (incidentId: string, state: "open" | "classified" = "open") => pool.query("INSERT INTO incidents(id,organization_id,store_id,sector_id,location_id,category_key,severity_key,title,description,occurred_at,reporter_user_id,assignee_user_id,state) VALUES($1,$2,$3,$4,$5,'out-of-stock','high','Incident','Incident',transaction_timestamp(),$6,$7,$8)", [incidentId, ids.organization, ids.store, ids.sector, ids.location, ids.actor, state === "open" ? null : ids.assignee, state]);
    const input = (incidentId: string, evaluationId: string, overrides: Partial<DecisionInput> = {}): DecisionInput => ({ incidentId, evaluationId, expectedVersion: 2, idempotencyKey: `decision-${incidentId}`, correlationId: "request-a", complete: false, decisions: [{ field: "category", disposition: "confirmed", value: "out-of-stock" }], ...overrides });
    const counts = async (incidentId: string) => (await pool.query("SELECT (SELECT count(*) FROM triage_decision_sets WHERE incident_id=$1)::int sets,(SELECT count(*) FROM triage_decision_items item JOIN triage_decision_sets set ON set.id=item.decision_set_id WHERE set.incident_id=$1)::int items,(SELECT count(*) FROM incident_events WHERE incident_id=$1 AND event_type='triage-decided')::int decisions,(SELECT count(*) FROM incident_events WHERE incident_id=$1 AND event_type='incident-classified')::int classifications,(SELECT count(*) FROM triage_idempotency_outcomes WHERE incident_id=$1 AND action='triage-decide')::int outcomes,(SELECT version FROM incidents WHERE id=$1)::int version,(SELECT state FROM incidents WHERE id=$1) state", [incidentId])).rows[0]!;
    const eventTypes = async (incidentId: string) => (await pool.query<{ event_type: string }>("SELECT event_type FROM incident_events WHERE incident_id=$1 ORDER BY sequence", [incidentId])).rows.map((row) => row.event_type);
    try {
      for (const migration of migrations) await pool.query(await readFile(`migrations/${migration}`, "utf8"));
      await pool.query("INSERT INTO stores(id,organization_id,name) VALUES($1,$2,'Store'),($3,$2,'Other store')", [ids.store, ids.organization, ids.otherStore]);
      await pool.query("INSERT INTO sectors(id,organization_id,store_id,name) VALUES($1,$2,$3,'Sector')", [ids.sector, ids.organization, ids.store]);
      await pool.query("INSERT INTO locations(id,organization_id,store_id,sector_id,name) VALUES($1,$2,$3,$4,'Location')", [ids.location, ids.organization, ids.store, ids.sector]);
      await pool.query("INSERT INTO users(id,organization_id,name) VALUES($1,$4,'Actor'),($2,$4,'Assignee'),($3,$4,'Viewer')", [ids.actor, ids.assignee, ids.viewer, ids.organization]);
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'sector-lead')", [ids.assignee]);
      await pool.query("INSERT INTO user_store_scopes(user_id,store_id) VALUES($1,$2)", [ids.assignee, ids.store]);
      await pool.query("INSERT INTO user_sector_scopes(user_id,sector_id) VALUES($1,$2)", [ids.assignee, ids.sector]);
      await Promise.all([insertIncident(ids.partial), insertIncident(ids.manual), insertIncident(ids.stale), insertIncident(ids.wrong), insertIncident(ids.concurrent), insertIncident(ids.revoked), insertIncident(ids.forbidden), insertIncident(ids.forbiddenReplay), insertIncident(ids.classified, "classified"), insertIncident(ids.rollback)]);

      const authority = await executor(pool);
      const evaluate = async (incidentId: string) => ((await authority.execute(principal, { incidentId, expectedVersion: 1, idempotencyKey: `evaluate-${incidentId}`, correlationId: "evaluation" })) as { evaluation: { id: string } }).evaluation.id;
      const partialEvaluation = await evaluate(ids.partial);
      const staleEvaluation = await evaluate(ids.stale);
      await evaluate(ids.wrong);
      const concurrentEvaluation = await evaluate(ids.concurrent);
      const revokedEvaluation = await evaluate(ids.revoked);
      const rollbackEvaluation = await evaluate(ids.rollback);
      await pool.query("INSERT INTO users(id,organization_id,name) VALUES($1,$2,'Alternate')", [ids.alternate, ids.organization]);
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'sector-lead')", [ids.alternate]);
      await pool.query("INSERT INTO user_store_scopes(user_id,store_id) VALUES($1,$2)", [ids.alternate, ids.store]);
      await pool.query("INSERT INTO user_sector_scopes(user_id,sector_id) VALUES($1,$2)", [ids.alternate, ids.sector]);
      await pool.query("INSERT INTO triage_rule_versions(id,organization_id,version) VALUES($1,$2,2)", [id(50), ids.organization]);
      await pool.query("INSERT INTO triage_rules(id,organization_id,rule_version_id,identifier,priority,store_id,assignee_strategy) VALUES($1,$2,$3,'other-store',1,$4,'single-eligible')", [id(51), ids.organization, id(50), ids.otherStore]);
      const manualEvaluation = await evaluate(ids.manual);

      const untouched = await counts(ids.stale);
      await expect(authority.decide(principal, input(ids.stale, staleEvaluation, { decisions: [{ field: "category", disposition: "corrected", value: "equipment-failure" }] }))).rejects.toThrow(TriageValidationError);
      await expect(authority.decide(principal, input(ids.stale, staleEvaluation, { decisions: [{ field: "category", disposition: "confirmed", value: "out-of-stock" }, { field: "category", disposition: "confirmed", value: "out-of-stock" }] }))).rejects.toThrow(TriageValidationError);
      await expect(authority.decide(principal, input(ids.stale, staleEvaluation, { complete: true, decisions: [{ field: "category", disposition: "confirmed", value: "out-of-stock" }, { field: "severity", disposition: "confirmed", value: "high" }, { field: "assignee", disposition: "corrected", value: ids.viewer, reason: "not eligible" }] }))).rejects.toThrow(TriageValidationError);
      await expect(authority.decide(principal, input(ids.stale, staleEvaluation, { expectedVersion: 1 }))).rejects.toThrow(TriageStaleVersionError);
      expect(await counts(ids.stale)).toEqual(untouched);

      const forbiddenBefore = await counts(ids.forbidden);
      await expect(authority.decide(viewer, input(ids.forbidden, staleEvaluation, { expectedVersion: 1 }))).rejects.toThrow(TriageForbiddenError);
      expect(await counts(ids.forbidden)).toEqual(forbiddenBefore);
      await pool.query("INSERT INTO triage_idempotency_outcomes(organization_id,principal_id,api_major,action,incident_id,key,request_hash,outcome,action_correlation_id) VALUES($1,$2,'v1','triage-decide',$3,'forbidden-replay','hash',$4::jsonb,'stored')", [ids.organization, ids.viewer, ids.forbiddenReplay, JSON.stringify({ status: "decided", leaked: true })]);
      await expect(authority.decide(viewer, input(ids.forbiddenReplay, staleEvaluation, { expectedVersion: 1, idempotencyKey: "forbidden-replay" }))).rejects.toThrow(TriageForbiddenError);
      const classifiedBefore = await counts(ids.classified);
      await expect(authority.decide(principal, input(ids.classified, staleEvaluation, { expectedVersion: 1 }))).rejects.toThrow(TriageInvalidTransitionError);
      expect(await counts(ids.classified)).toEqual(classifiedBefore);
      const wrongBefore = await counts(ids.wrong);
      await expect(authority.decide(principal, input(ids.wrong, staleEvaluation))).rejects.toThrow(TriageNotFoundError);
      expect(await counts(ids.wrong)).toEqual(wrongBefore);
      const revokedBefore = await counts(ids.revoked);
      await expect((await executor(revokeAfterLock(pool))).decide(principal, input(ids.revoked, revokedEvaluation))).rejects.toThrow(TriageForbiddenError);
      expect(await counts(ids.revoked)).toEqual(revokedBefore);
      const rollbackBefore = await counts(ids.rollback);
      await pool.query("CREATE FUNCTION reject_triage_decision_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.event_type='triage-decided' THEN RAISE EXCEPTION 'decision event rejected'; END IF; RETURN NEW; END $$; CREATE TRIGGER reject_triage_decision_event BEFORE INSERT ON incident_events FOR EACH ROW EXECUTE FUNCTION reject_triage_decision_event()");
      await expect(authority.decide(principal, input(ids.rollback, rollbackEvaluation, { idempotencyKey: "rollback" }))).rejects.toThrow("decision event rejected");
      await pool.query("DROP TRIGGER reject_triage_decision_event ON incident_events");
      expect(await counts(ids.rollback)).toEqual(rollbackBefore);

      const partialInput = input(ids.partial, partialEvaluation, { idempotencyKey: "partial", complete: false });
      const partial = await authority.decide(principal, partialInput) as DecisionReceipt;
      expect(partial).toMatchObject({ status: "decided", incidentId: ids.partial, state: "open", version: 3, decisionSet: { complete: false, recordedFields: ["category"], actionCorrelationId: "request-a" } });
      await expect(authority.decide(principal, { ...partialInput, complete: true })).rejects.toThrow(TriageIdempotencyConflictError);
      expect(await counts(ids.partial)).toMatchObject({ sets: 1, items: 1, decisions: 1, classifications: 0, outcomes: 1, version: 3, state: "open" });
      const finishedInput = input(ids.partial, partialEvaluation, { expectedVersion: 3, idempotencyKey: "finish", complete: true, correlationId: "finish-correlation", decisions: [{ field: "severity", disposition: "confirmed", value: "high" }, { field: "assignee", disposition: "corrected", value: ids.alternate, reason: "available lead" }] });
      const finished = await authority.decide(principal, finishedInput) as DecisionReceipt;
      expect(finished).toMatchObject({ state: "classified", version: 4, decisionSet: { complete: true, recordedFields: ["severity", "assignee"], actionCorrelationId: "finish-correlation" } });
      expect(await authority.decide(principal, { ...finishedInput, correlationId: "retry-correlation" })).toEqual(finished);
      expect(await authority.decide(principal, { ...finishedInput, correlationId: "reordered-retry", decisions: [...finishedInput.decisions].reverse() })).toEqual(finished);
      expect(await eventTypes(ids.partial)).toEqual(["triage-evaluated", "triage-decided", "triage-decided", "incident-classified"]);
      expect((await pool.query("SELECT category_key,severity_key,assignee_user_id::text,state,category_provisional,severity_provisional FROM incidents WHERE id=$1", [ids.partial])).rows[0]).toMatchObject({ category_key: "out-of-stock", severity_key: "high", assignee_user_id: ids.alternate, state: "classified", category_provisional: false, severity_provisional: false });
      await expect(pool.query("UPDATE triage_decision_sets SET complete=false WHERE id=$1", [finished.decisionSet.id])).rejects.toThrow("triage authority is immutable");
      await expect(pool.query("UPDATE triage_decision_items SET reason='changed' WHERE decision_set_id=$1", [finished.decisionSet.id])).rejects.toThrow("triage authority is immutable");

      const manualStart = await authority.decide(principal, input(ids.manual, manualEvaluation, { idempotencyKey: "manual-start", complete: true, decisions: [{ field: "category", disposition: "manual", value: "equipment-failure", reason: "no rule matched" }] })) as DecisionReceipt;
      expect(manualStart).toMatchObject({ state: "open", version: 3, decisionSet: { complete: false, recordedFields: ["category"] } });
      expect(await eventTypes(ids.manual)).toEqual(["triage-evaluated", "triage-decided"]);
      const manualFinished = await authority.decide(principal, input(ids.manual, manualEvaluation, { expectedVersion: 3, idempotencyKey: "manual-finish", complete: true, decisions: [{ field: "severity", disposition: "manual", value: "low", reason: "no rule matched" }, { field: "assignee", disposition: "manual", value: ids.alternate, reason: "available lead" }] })) as DecisionReceipt;
      expect(manualFinished).toMatchObject({ state: "classified", version: 4, decisionSet: { complete: true, recordedFields: ["severity", "assignee"] } });
      expect(await eventTypes(ids.manual)).toEqual(["triage-evaluated", "triage-decided", "triage-decided", "incident-classified"]);

      const concurrent = await Promise.allSettled([authority.decide(principal, input(ids.concurrent, concurrentEvaluation, { idempotencyKey: "concurrent-category" })), authority.decide(principal, input(ids.concurrent, concurrentEvaluation, { idempotencyKey: "concurrent-severity", decisions: [{ field: "severity", disposition: "confirmed", value: "high" }] }))]);
      expect(concurrent.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      expect(concurrent.filter((result) => result.status === "rejected")).toHaveLength(1);
      expect(concurrent.find((result) => result.status === "rejected")).toMatchObject({ reason: { message: "stale-version" } });
      expect(await counts(ids.concurrent)).toMatchObject({ sets: 1, items: 1, decisions: 1, classifications: 0, outcomes: 1, version: 3, state: "open" });
    } finally {
      await pool.end();
      await container.stop();
    }
  }, 120_000);
});
