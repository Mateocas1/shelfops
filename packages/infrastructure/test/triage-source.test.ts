import { readFile } from "node:fs/promises";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { describe, expect, it } from "vitest";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const id = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { organization: id(1), store: id(10), sector: id(11), location: id(12), hiddenStore: id(13), hiddenSector: id(14), hiddenLocation: id(15), viewer: id(16), reporter: id(17), assignee: id(18), incident: id(19), oldEvaluation: id(20), currentEvaluation: id(21), firstSet: id(22), secondSet: id(23), firstSeverity: id(24), firstCategory: id(25), secondCategory: id(26), legacyIncident: id(27), hiddenIncident: id(28) };
const migrations = ["001_reference-data.sql", "002_identity-sessions.sql", "003_configuration-events.sql", "004_reference-configuration-idempotency.sql", "005_incidents-core.sql", "006_team-assignments.sql", "007_incident-creation.sql", "008_sla-policy-and-cycles.sql", "009_sla-policy-configuration.sql", "010_recurrence-authority.sql", "011_triage.sql"];
const principal: AuthorizedPrincipal = { id: ids.viewer, active: true, roleScopes: [{ role: "supervisor", storeIds: [ids.store], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [] };
const inputs = { storeId: ids.store, sectorId: ids.sector, locationId: ids.location, productId: null, category: "out-of-stock", severity: "high", eligibleAssigneeIds: [ids.assignee] };
const suggested = { category: "out-of-stock", severity: "high", assigneeUserId: ids.assignee, manualFields: [] };
const explanation = { code: "matched-single-eligible", facts: { eligibleAssigneeCount: 1 }, text: "Input category and severity preserved; exactly one eligible assignee suggested." };

type TriageSource = Readonly<{ read(principal: AuthorizedPrincipal, incidentId: string): Promise<unknown> }>;
type TriageSourceModule = Readonly<{ PostgresTriageAuthoritySource: new(pool: Pool) => TriageSource }>;

async function source(pool: Pool): Promise<TriageSource> {
  const module = await import("../src/triage/postgres-triage-authority-source.js") as TriageSourceModule;
  return new module.PostgresTriageAuthoritySource(pool);
}

describe("PostgreSQL triage authority source", () => {
  it("reads a visible incident authority with deterministic evaluation, set, and item order", async () => {
    let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | undefined;
    let pool: Pool | undefined;
    try {
      container = await new PostgreSqlContainer(image).withDatabase("triage_source").start();
      pool = new Pool({ connectionString: container.getConnectionUri() });
      for (const migration of migrations) await pool.query(await readFile(`migrations/${migration}`, "utf8"));
      await pool.query("INSERT INTO stores(id,organization_id,name) VALUES($1,$2,'Visible'),($3,$2,'Hidden')", [ids.store, ids.organization, ids.hiddenStore]);
      await pool.query("INSERT INTO sectors(id,organization_id,store_id,name) VALUES($1,$4,$2,'Visible'),($3,$4,$5,'Hidden')", [ids.sector, ids.store, ids.hiddenSector, ids.organization, ids.hiddenStore]);
      await pool.query("INSERT INTO locations(id,organization_id,store_id,sector_id,name) VALUES($1,$5,$2,$3,'Visible'),($4,$5,$6,$7,'Hidden')", [ids.location, ids.store, ids.sector, ids.hiddenLocation, ids.organization, ids.hiddenStore, ids.hiddenSector]);
      await pool.query("INSERT INTO users(id,organization_id,name) VALUES($1,$4,'Viewer'),($2,$4,'Reporter'),($3,$4,'Assignee')", [ids.viewer, ids.reporter, ids.assignee, ids.organization]);
      await pool.query("INSERT INTO incidents(id,organization_id,store_id,sector_id,location_id,category_key,severity_key,title,description,occurred_at,reporter_user_id,version) VALUES($1,$2,$3,$4,$5,'out-of-stock','high','Incident','Incident','2026-08-01T10:00:00Z',$6,3)", [ids.incident, ids.organization, ids.store, ids.sector, ids.location, ids.reporter]);
      await pool.query("INSERT INTO incidents(id,organization_id,store_id,sector_id,location_id,category_key,severity_key,title,description,occurred_at,reporter_user_id,assignee_user_id,state) VALUES($1,$2,$3,$4,$5,'out-of-stock','high','Legacy','Legacy','2026-08-01T10:00:00Z',$6,$7,'classified'),($8,$2,$9,$10,$11,'out-of-stock','high','Hidden','Hidden','2026-08-01T10:00:00Z',$6,NULL,'open')", [ids.legacyIncident, ids.organization, ids.store, ids.sector, ids.location, ids.reporter, ids.assignee, ids.hiddenIncident, ids.hiddenStore, ids.hiddenSector, ids.hiddenLocation]);
      await pool.query("INSERT INTO triage_evaluations(id,organization_id,incident_id,incident_version,rule_version_id,rule_id,rule_identifier,inputs,suggested,explanation,evaluated_at,action_correlation_id) VALUES($1,$2,$3,2,$4,$5,'default-catch-all',$6::jsonb,$7::jsonb,$8::jsonb,'2026-08-01T10:01:00Z','old'),($9,$2,$3,3,$4,$5,'default-catch-all',$6::jsonb,$7::jsonb,$8::jsonb,'2026-08-01T10:02:00Z','current')", [ids.oldEvaluation, ids.organization, ids.incident, id(3), id(4), JSON.stringify(inputs), JSON.stringify(suggested), JSON.stringify(explanation), ids.currentEvaluation]);
      await pool.query("INSERT INTO triage_decision_sets(id,organization_id,incident_id,evaluation_id,sequence,complete,decided_at,action_correlation_id) VALUES($1,$2,$3,$4,2,true,'2026-08-01T10:04:00Z','second'),($5,$2,$3,$4,1,false,'2026-08-01T10:03:00Z','first')", [ids.secondSet, ids.organization, ids.incident, ids.currentEvaluation, ids.firstSet]);
      await pool.query("INSERT INTO triage_decision_items(id,organization_id,decision_set_id,field,disposition,value_text,actor_user_id,decided_at,action_correlation_id) VALUES($1,$2,$3,'category','confirmed','out-of-stock',$4,'2026-08-01T10:03:00Z','first-category'),($5,$2,$3,'severity','confirmed','high',$4,'2026-08-01T10:03:00Z','first-severity'),($6,$2,$7,'category','corrected','inventory-mismatch',$4,'2026-08-01T10:04:00Z','second-category')", [ids.firstCategory, ids.organization, ids.firstSet, ids.viewer, ids.firstSeverity, ids.secondCategory, ids.secondSet]);

      const authoritySource = await source(pool);
      const authority = await authoritySource.read(principal, ids.incident);

      expect(authority).toEqual({
        incidentId: ids.incident,
        state: "open",
        version: 3,
        evaluations: [
          { id: ids.currentEvaluation, incidentId: ids.incident, incidentVersion: 3, rule: { identifier: "default-catch-all", ruleId: id(4), versionId: id(3), version: 1 }, inputs, suggested, explanation, evaluatedAt: "2026-08-01T10:02:00.000Z", actionCorrelationId: "current" },
          { id: ids.oldEvaluation, incidentId: ids.incident, incidentVersion: 2, rule: { identifier: "default-catch-all", ruleId: id(4), versionId: id(3), version: 1 }, inputs, suggested, explanation, evaluatedAt: "2026-08-01T10:01:00.000Z", actionCorrelationId: "old" }
        ],
        decisionSets: [
          { id: ids.firstSet, evaluationId: ids.currentEvaluation, sequence: 1, complete: false, decidedAt: "2026-08-01T10:03:00.000Z", actionCorrelationId: "first", items: [{ id: ids.firstSeverity, field: "severity", disposition: "confirmed", value: "high", reason: null, actorUserId: ids.viewer, decidedAt: "2026-08-01T10:03:00.000Z", actionCorrelationId: "first-severity" }, { id: ids.firstCategory, field: "category", disposition: "confirmed", value: "out-of-stock", reason: null, actorUserId: ids.viewer, decidedAt: "2026-08-01T10:03:00.000Z", actionCorrelationId: "first-category" }] },
          { id: ids.secondSet, evaluationId: ids.currentEvaluation, sequence: 2, complete: true, decidedAt: "2026-08-01T10:04:00.000Z", actionCorrelationId: "second", items: [{ id: ids.secondCategory, field: "category", disposition: "corrected", value: "inventory-mismatch", reason: null, actorUserId: ids.viewer, decidedAt: "2026-08-01T10:04:00.000Z", actionCorrelationId: "second-category" }] }
        ]
      });
      await expect(authoritySource.read(principal, ids.legacyIncident)).resolves.toEqual({ incidentId: ids.legacyIncident, state: "classified", version: 1, evaluations: [], decisionSets: [] });
      await expect(authoritySource.read(principal, ids.hiddenIncident)).resolves.toBeUndefined();
    } finally {
      try { await pool?.end(); } finally { await container?.stop(); }
    }
  }, 120_000);
});
