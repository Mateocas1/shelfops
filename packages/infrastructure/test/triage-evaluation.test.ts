import { readFile } from "node:fs/promises";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { TriageForbiddenError, TriageIdempotencyConflictError, TriageInvalidTransitionError, TriageStaleVersionError } from "@shelfops/application/triage/authority";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const id = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { organization: id(1), store: id(10), sector: id(11), location: id(12), otherStore: id(13), actor: id(14), assignee: id(15), unauthorized: id(16), incident: id(17), classified: id(18), stale: id(19), revoked: id(20), rollback: id(21), lost: id(22), noMatch: id(23), unavailable: id(24), scopeRevoked: id(25), grantRevoked: id(26) };
const migrations = ["001_reference-data.sql", "002_identity-sessions.sql", "003_configuration-events.sql", "004_reference-configuration-idempotency.sql", "005_incidents-core.sql", "006_team-assignments.sql", "007_incident-creation.sql", "008_sla-policy-and-cycles.sql", "009_sla-policy-configuration.sql", "010_recurrence-authority.sql", "011_triage.sql"];
const principal: AuthorizedPrincipal = { id: ids.actor, active: true, roleScopes: [{ role: "central-operations", storeIds: [ids.store], sectorIds: [], categoryResponsibilities: ["equipment-failure", "out-of-stock"], teamIds: [] }], grants: [{ action: "triage", role: "central-operations" }] };

type TriageExecutor = Readonly<{ execute(principal: AuthorizedPrincipal, input: Readonly<{ incidentId: string; expectedVersion: number; idempotencyKey: string; correlationId: string }>): Promise<unknown> }>;
type TriageExecutorModule = Readonly<{ PostgresTriageAuthorityExecutor: new(pool: Pool) => TriageExecutor }>;

async function executor(pool: Pool): Promise<TriageExecutor> {
  const module = await import("../src/triage/postgres-triage-authority-executor.js") as TriageExecutorModule;
  return new module.PostgresTriageAuthorityExecutor(pool);
}

function lostCommit(pool: Pool): Pool {
  return { connect: async () => { const client = await pool.connect(); return { query: async <Row extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => { if (sql === "COMMIT") { await client.query("COMMIT"); throw new Error("acknowledgement lost"); } return values === undefined ? client.query<Row>(sql) : client.query<Row>(sql, [...values]); }, release: (error?: Error | boolean) => client.release(error) }; } } as unknown as Pool;
}

function alterAuthorityAfterLock(pool: Pool, sql: string): Pool {
  return { connect: async () => { const client = await pool.connect(); return { query: async <Row extends Record<string, unknown>>(query: string, values?: readonly unknown[]) => { const result = values === undefined ? await client.query<Row>(query) : await client.query<Row>(query, [...values]); if (query === "SELECT pg_advisory_xact_lock($1::bigint)") await client.query(sql, [ids.actor]); return result; }, release: (error?: Error | boolean) => client.release(error) }; } } as unknown as Pool;
}

describe("PostgreSQL triage evaluation authority", () => {
  it("evaluates an open authorized incident atomically", async () => {
    const container = await new PostgreSqlContainer(image).withDatabase("triage_evaluation").start();
    const pool = new Pool({ connectionString: container.getConnectionUri() });
    try {
      for (const migration of migrations) await pool.query(await readFile(`migrations/${migration}`, "utf8"));
      await pool.query("INSERT INTO stores(id,organization_id,name) VALUES($1,$2,'Store')", [ids.store, ids.organization]);
      await pool.query("INSERT INTO stores(id,organization_id,name) VALUES($1,$2,'Other store')", [ids.otherStore, ids.organization]);
      await pool.query("INSERT INTO sectors(id,organization_id,store_id,name) VALUES($1,$2,$3,'Sector')", [ids.sector, ids.organization, ids.store]);
      await pool.query("INSERT INTO locations(id,organization_id,store_id,sector_id,name) VALUES($1,$2,$3,$4,'Location')", [ids.location, ids.organization, ids.store, ids.sector]);
      await pool.query("INSERT INTO users(id,organization_id,name) VALUES($1,$4,'Actor'),($2,$4,'Assignee'),($3,$4,'Unauthorized')", [ids.actor, ids.assignee, ids.unauthorized, ids.organization]);
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'central-operations')", [ids.actor]);
      await pool.query("INSERT INTO user_store_scopes(user_id,store_id) VALUES($1,$2)", [ids.actor, ids.store]);
      await pool.query("INSERT INTO category_responsibilities(user_id,category_key) VALUES($1,'out-of-stock'),($1,'equipment-failure')", [ids.actor]);
      await pool.query("INSERT INTO action_grants(user_id,action,role) VALUES($1,'triage','central-operations')", [ids.actor]);
      await pool.query("INSERT INTO user_roles(user_id,role) VALUES($1,'sector-lead')", [ids.assignee]);
      await pool.query("INSERT INTO user_store_scopes(user_id,store_id) VALUES($1,$2)", [ids.assignee, ids.store]);
      await pool.query("INSERT INTO user_sector_scopes(user_id,sector_id) VALUES($1,$2)", [ids.assignee, ids.sector]);
      const insertIncident = (incidentId: string, state: "open" | "classified" = "open") => pool.query("INSERT INTO incidents(id,organization_id,store_id,sector_id,location_id,category_key,severity_key,title,description,occurred_at,reporter_user_id,assignee_user_id,state) VALUES($1,$2,$3,$4,$5,'out-of-stock','high','Incident','Incident',transaction_timestamp(),$6,$7,$8)", [incidentId, ids.organization, ids.store, ids.sector, ids.location, ids.actor, state === "open" ? null : ids.assignee, state]);
      const input = (incidentId: string, overrides: Partial<{ expectedVersion: number; idempotencyKey: string; correlationId: string }> = {}) => ({ incidentId, expectedVersion: 1, idempotencyKey: `evaluate-${incidentId}`, correlationId: "request-a", ...overrides });
      const counts = async (incidentId: string) => (await pool.query("SELECT (SELECT count(*) FROM triage_evaluations WHERE incident_id=$1)::int evaluations,(SELECT count(*) FROM incident_events WHERE incident_id=$1 AND event_type='triage-evaluated')::int events,(SELECT count(*) FROM triage_idempotency_outcomes WHERE incident_id=$1)::int outcomes,(SELECT version FROM incidents WHERE id=$1) version", [incidentId])).rows[0]!;
      await Promise.all([insertIncident(ids.incident), insertIncident(ids.classified, "classified"), insertIncident(ids.stale), insertIncident(ids.revoked), insertIncident(ids.scopeRevoked), insertIncident(ids.grantRevoked), insertIncident(ids.rollback), insertIncident(ids.lost), insertIncident(ids.noMatch), insertIncident(ids.unavailable)]);

      const authority = await executor(pool);
      const outcome = await authority.execute(principal, input(ids.incident, { idempotencyKey: "evaluate-once" })) as { evaluation: { id: string; rule: { versionId: string }; suggested: unknown; explanation: unknown } };

      expect(outcome).toMatchObject({ status: "evaluated", incidentId: ids.incident, version: 2, evaluation: { incidentId: ids.incident, incidentVersion: 2, rule: { identifier: "default-catch-all", ruleId: id(4), versionId: id(3), version: 1 }, inputs: { eligibleAssigneeIds: [ids.actor, ids.assignee] }, suggested: { category: "out-of-stock", severity: "high", assigneeUserId: null, manualFields: ["assignee"] }, explanation: { code: "manual-assignee-ambiguous", facts: { eligibleAssigneeCount: 2 } }, actionCorrelationId: "request-a" } });
      expect(await authority.execute(principal, input(ids.incident, { idempotencyKey: "evaluate-once", correlationId: "request-b" }))).toEqual(outcome);
      await expect(authority.execute(principal, input(ids.incident, { expectedVersion: 2, idempotencyKey: "evaluate-once" }))).rejects.toThrow(TriageIdempotencyConflictError);
      const repeated = await authority.execute(principal, input(ids.incident, { expectedVersion: 2, idempotencyKey: "evaluate-repeat" })) as typeof outcome;
      expect(repeated.evaluation.id).not.toBe(outcome.evaluation.id);
      expect(repeated.evaluation.rule.versionId).toBe(outcome.evaluation.rule.versionId);
      expect(repeated.evaluation.suggested).toEqual(outcome.evaluation.suggested);
      expect(repeated.evaluation.explanation).toEqual(outcome.evaluation.explanation);
      expect(await counts(ids.incident)).toEqual({ evaluations: 2, events: 2, outcomes: 2, version: 3 });

      const unauthorized: AuthorizedPrincipal = { ...principal, id: ids.unauthorized, roleScopes: [{ role: "collaborator", storeIds: [ids.store], sectorIds: [ids.sector], categoryResponsibilities: [], teamIds: [] }] };
      await expect(authority.execute(unauthorized, input(ids.stale, { idempotencyKey: "forbidden" }))).rejects.toThrow(TriageForbiddenError);
      await expect(authority.execute(principal, input(ids.classified))).rejects.toThrow(TriageInvalidTransitionError);
      await expect(authority.execute(principal, input(ids.stale, { expectedVersion: 2 }))).rejects.toThrow(TriageStaleVersionError);
      expect(await Promise.all([counts(ids.stale), counts(ids.classified)])).toEqual([{ evaluations: 0, events: 0, outcomes: 0, version: 1 }, { evaluations: 0, events: 0, outcomes: 0, version: 1 }]);
      await expect((await executor(alterAuthorityAfterLock(pool, "UPDATE users SET active=false WHERE id=$1"))).execute(principal, input(ids.revoked))).rejects.toThrow(TriageForbiddenError);
      await expect((await executor(alterAuthorityAfterLock(pool, "DELETE FROM user_store_scopes WHERE user_id=$1"))).execute(principal, input(ids.scopeRevoked))).rejects.toThrow(TriageForbiddenError);
      await expect((await executor(alterAuthorityAfterLock(pool, "DELETE FROM action_grants WHERE user_id=$1 AND action='triage'"))).execute(principal, input(ids.grantRevoked))).rejects.toThrow(TriageForbiddenError);
      expect(await Promise.all([counts(ids.revoked), counts(ids.scopeRevoked), counts(ids.grantRevoked)])).toEqual(Array(3).fill({ evaluations: 0, events: 0, outcomes: 0, version: 1 }));

      await pool.query("INSERT INTO triage_rule_versions(id,organization_id,version) VALUES($1,$2,2)", [id(50), ids.organization]);
      await pool.query("INSERT INTO triage_rules(id,organization_id,rule_version_id,identifier,priority,store_id,assignee_strategy) VALUES($1,$2,$3,'other-store',1,$4,'single-eligible')", [id(51), ids.organization, id(50), ids.otherStore]);
      await expect(authority.execute(principal, input(ids.noMatch))).resolves.toMatchObject({ status: "evaluated", evaluation: { rule: { identifier: "manual-no-match", ruleId: null, versionId: id(50), version: 2 }, suggested: { category: null, severity: null, assigneeUserId: null, manualFields: ["category", "severity", "assignee"] }, explanation: { code: "manual-no-match" } } });

      await pool.query("CREATE FUNCTION reject_triage_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'event rejected'; END $$; CREATE TRIGGER reject_triage_event BEFORE INSERT ON incident_events FOR EACH ROW EXECUTE FUNCTION reject_triage_event()");
      await expect(authority.execute(principal, input(ids.rollback))).rejects.toThrow("event rejected");
      await pool.query("DROP TRIGGER reject_triage_event ON incident_events");
      expect(await counts(ids.rollback)).toEqual({ evaluations: 0, events: 0, outcomes: 0, version: 1 });

      const uncertain = await (await executor(lostCommit(pool))).execute(principal, input(ids.lost, { idempotencyKey: "lost-commit", correlationId: "lost-correlation" }));
      expect(uncertain).toEqual({ status: "indeterminate", correlationId: "lost-correlation", retryWithSameKey: true });
      await expect(authority.execute(principal, input(ids.lost, { idempotencyKey: "lost-commit", correlationId: "retry-correlation" }))).resolves.toMatchObject({ status: "evaluated", incidentId: ids.lost, version: 2, evaluation: { actionCorrelationId: "lost-correlation" } });
      expect(await counts(ids.lost)).toEqual({ evaluations: 1, events: 1, outcomes: 1, version: 2 });

      await pool.query("INSERT INTO triage_rule_versions(id,organization_id,version) VALUES($1,$2,3)", [id(52), ids.organization]);
      await expect(authority.execute(principal, input(ids.unavailable))).rejects.toThrow("triage-unavailable");
      expect(await counts(ids.unavailable)).toEqual({ evaluations: 0, events: 0, outcomes: 0, version: 1 });
    } finally {
      await pool.end();
      await container.stop();
    }
  }, 120_000);
});
