import { readFile } from "node:fs/promises";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client, Pool } from "pg";
import { describe, expect, it } from "vitest";
import { InvalidIncidentQueryError, PostgresAuthorizedIncidentRepository, type IncidentQueryLog } from "../src/repositories/authorized-incident-repository.js";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const id = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { organization: id(1), storeA: id(2), storeB: id(3), sectorA1: id(4), sectorA2: id(5), sectorB: id(6), locationA1: id(7), locationA2: id(8), locationB: id(9), product: id(10), collaborator: id(11), lead: id(12), supervisor: id(13), inventory: id(14), central: id(15), inactive: id(16), team: id(17), otherTeam: id(18), inactiveTeam: id(19) };
const incidentIds = { ownB: id(101), a1Open: id(102), a1Assigned: id(103), a2Equipment: id(104), bInventory: id(105), bEquipment: id(106), bOther: id(107), a1Category: id(108), a1Team: id(109), a1OtherTeam: id(110), a1InactiveTeam: id(111), bTeam: id(112) };
type Role = AuthorizedPrincipal["roleScopes"][number]["role"];

function principal(userId: string, role: Role, storeIds: string[], sectorIds: string[], categoryResponsibilities: string[] = [], teamIds: string[] = [], active = true): AuthorizedPrincipal {
  return { id: userId, active, roleScopes: [{ role, storeIds, sectorIds, categoryResponsibilities, teamIds }], grants: [] };
}

describe("scope-safe incident repository", () => {
  it("applies role and scope in SQL for lists, details, filters, cursors, and plans", async () => {
    let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | undefined;
    let client: Client | undefined;
    let pool: Pool | undefined;
    try {
      container = await new PostgreSqlContainer(image).withDatabase("scoped_repository").start();
      client = new Client({ connectionString: container.getConnectionUri() });
      await client.connect();
      for (const migration of ["001_reference-data", "005_incidents-core", "006_team-assignments", "007_incident-creation", "008_sla-policy-and-cycles", "010_recurrence-authority"]) await client.query(await readFile(`migrations/${migration}.sql`, "utf8"));
      await expect(client.query("INSERT INTO organizations (id, name) VALUES ($1, 'Other')", [id(999)])).rejects.toThrow();
      await client.query("INSERT INTO stores (id, organization_id, name) VALUES ($1,$3,'A'),($2,$3,'B')", [ids.storeA, ids.storeB, ids.organization]);
      await client.query("INSERT INTO sectors (id, organization_id, store_id, name) VALUES ($1,$6,$4,'A1'),($2,$6,$4,'A2'),($3,$6,$5,'B1')", [ids.sectorA1, ids.sectorA2, ids.sectorB, ids.storeA, ids.storeB, ids.organization]);
      await client.query("INSERT INTO locations (id, organization_id, store_id, sector_id, name) VALUES ($1,$7,$4,$5,'A1'),($2,$7,$4,$6,'A2'),($3,$7,$8,$9,'B1')", [ids.locationA1, ids.locationA2, ids.locationB, ids.storeA, ids.sectorA1, ids.sectorA2, ids.organization, ids.storeB, ids.sectorB]);
      await client.query("INSERT INTO products (id, organization_id, name) VALUES ($1,$2,'Product')", [ids.product, ids.organization]);
      const users = [ids.collaborator, ids.lead, ids.supervisor, ids.inventory, ids.central, ids.inactive];
      await client.query(`INSERT INTO users (id, organization_id, name, active) VALUES ${users.map((_, index) => `($${index * 2 + 1},$${index * 2 + 2},'User ${index}',${index === 5 ? "false" : "true"})`).join(",")}`, users.flatMap((userId) => [userId, ids.organization]));
      await client.query("INSERT INTO teams (id,organization_id,key,name,active) VALUES ($1,$4,'active','Active',true),($2,$4,'other','Other',true),($3,$4,'inactive','Inactive',false)", [ids.team, ids.otherTeam, ids.inactiveTeam, ids.organization]);
      const rows = [
        [incidentIds.ownB, ids.storeB, ids.sectorB, ids.locationB, "other", "low", ids.collaborator, null, "open", "2026-08-05T10:00:00Z"],
        [incidentIds.a1Open, ids.storeA, ids.sectorA1, ids.locationA1, "out-of-stock", "high", ids.collaborator, null, "open", "2026-08-05T12:00:00Z"],
        [incidentIds.a1Assigned, ids.storeA, ids.sectorA1, ids.locationA1, "inventory-mismatch", "critical", ids.lead, ids.central, "classified", "2026-08-05T12:00:00Z"],
        [incidentIds.a2Equipment, ids.storeA, ids.sectorA2, ids.locationA2, "equipment-failure", "medium", ids.lead, null, "open", "2026-08-05T11:00:00Z"],
        [incidentIds.bInventory, ids.storeB, ids.sectorB, ids.locationB, "replenishment-blocked", "high", ids.lead, ids.central, "classified", "2026-08-05T11:00:00Z"],
        [incidentIds.bEquipment, ids.storeB, ids.sectorB, ids.locationB, "equipment-failure", "medium", ids.lead, null, "open", "2026-08-05T10:00:00Z"],
        [incidentIds.bOther, ids.storeB, ids.sectorB, ids.locationB, "price-or-label", "low", ids.lead, null, "open", "2026-08-05T09:00:00Z", null],
        [incidentIds.a1Category, ids.storeA, ids.sectorA1, ids.locationA1, "equipment-failure", "high", ids.supervisor, ids.supervisor, "classified", "2026-08-05T07:50:00Z", null],
        [incidentIds.a1Team, ids.storeA, ids.sectorA1, ids.locationA1, "price-or-label", "high", ids.supervisor, ids.supervisor, "classified", "2026-08-05T07:40:00Z", ids.team],
        [incidentIds.a1OtherTeam, ids.storeA, ids.sectorA1, ids.locationA1, "price-or-label", "high", ids.supervisor, ids.supervisor, "classified", "2026-08-05T07:30:00Z", ids.otherTeam],
        [incidentIds.a1InactiveTeam, ids.storeA, ids.sectorA1, ids.locationA1, "price-or-label", "high", ids.supervisor, ids.supervisor, "classified", "2026-08-05T07:20:00Z", ids.inactiveTeam],
        [incidentIds.bTeam, ids.storeB, ids.sectorB, ids.locationB, "price-or-label", "high", ids.supervisor, ids.supervisor, "classified", "2026-08-05T07:10:00Z", ids.team]
      ];
      for (const row of rows) await client.query("INSERT INTO incidents (id,organization_id,store_id,sector_id,location_id,product_id,category_key,severity_key,title,description,occurred_at,reporter_user_id,assignee_user_id,state,created_at,updated_at,assignee_team_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$7,'2026-08-05T08:00:00Z',$9,$10,$11,$12,$12,$13)", [row[0], ids.organization, row[1], row[2], row[3], ids.product, row[4], row[5], row[6], row[7], row[8], row[9], row[10] ?? null]);
      const addCycle = async (incidentId: string, condition: string, sequence: number, seed: number, active = true) => {
        const snapshotId = id(200 + seed), cycleId = id(300 + seed), segmentId = id(400 + seed);
        await client!.query("INSERT INTO incident_sla_rule_snapshots(id,incident_id,organization_id,policy_version_id,policy_version,category_key,severity_key,clock_mode,pauses_when_blocked,warning_after_seconds,deadline_after_seconds) SELECT $1,i.id,i.organization_id,p.id,p.version,i.category_key,i.severity_key,p.clock_mode,p.pauses_when_blocked,r.warning_after_seconds,r.deadline_after_seconds FROM incidents i JOIN sla_policy_versions p ON p.organization_id=i.organization_id AND p.active JOIN sla_policy_rules r ON r.policy_version_id=p.id AND r.organization_id=i.organization_id AND r.category_key=i.category_key AND r.severity_key=i.severity_key WHERE i.id=$2", [snapshotId, incidentId]);
        await client!.query("INSERT INTO incident_sla_cycles(id,incident_id,snapshot_id,sequence,condition,started_at,warning_at,deadline_at) VALUES($1,$2,$3,$4,$5,'2026-08-05T08:00:00Z','2026-08-05T09:00:00Z','2026-08-05T10:00:00Z')", [cycleId, incidentId, snapshotId, sequence, condition]);
        await client!.query("INSERT INTO incident_sla_segments(id,cycle_id,snapshot_id,sequence,started_at,warning_at,deadline_at,active) VALUES($1,$2,$3,1,'2026-08-05T08:00:00Z','2026-08-05T09:00:00Z','2026-08-05T10:00:00Z',$4)", [segmentId, cycleId, snapshotId, active]);
      };
      await addCycle(incidentIds.a1Open, "on-track", 1, 1, false); await addCycle(incidentIds.a1Open, "warning", 2, 2); await addCycle(incidentIds.a1Assigned, "on-track", 1, 3); await addCycle(incidentIds.a2Equipment, "breached", 1, 4); await addCycle(incidentIds.a1Category, "paused", 1, 5); await addCycle(incidentIds.bInventory, "breached", 1, 6);
      const suggestions = [[id(601), incidentIds.a1Open, incidentIds.bInventory, 1, undefined], [id(602), incidentIds.a1Open, incidentIds.bEquipment, 2, "confirmed"], [id(603), incidentIds.a1Assigned, incidentIds.bInventory, 1, "dismissed"], [id(604), incidentIds.a2Equipment, incidentIds.bInventory, 1, "confirmed"], [id(605), incidentIds.bInventory, incidentIds.a1Open, 1, "confirmed"]] as const;
      for (const [index, [suggestionId, incidentId, candidateId, occurrence, state]] of suggestions.entries()) { await client.query("INSERT INTO recurrence_suggestions(id,organization_id,incident_id,candidate_incident_id,recurrence_rule_version_id,occurrence,matching_facts,correlation_id) VALUES($1,$2,$3,$4,$5,$6,jsonb_build_object('locationId',$7::text),$8)", [suggestionId, ids.organization, incidentId, candidateId, id(2), occurrence, ids.locationA1, `suggestion-${index}`]); if (state) await client.query("INSERT INTO recurrence_decisions(id,organization_id,suggestion_id,sequence,state,actor_user_id,correlation_id) VALUES($1,$2,$3,1,$4,$5,$6)", [id(700 + index), ids.organization, suggestionId, state, ids.supervisor, `decision-${index}`]); }
      await client.query("INSERT INTO incident_events(id,incident_id,sequence,event_type,actor_user_id,data,origin) VALUES($1,$2,1,'recurrence-decided',$3,jsonb_build_object('state','confirmed'),'human')", [id(800), incidentIds.a1Category, ids.supervisor]);

      pool = new Pool({ connectionString: container.getConnectionUri() });
      const queries: IncidentQueryLog[] = [];
      const repository = new PostgresAuthorizedIncidentRepository(pool, (query) => queries.push(query));
      const collaborator = principal(ids.collaborator, "collaborator", [ids.storeA], [ids.sectorA1]);
      const lead = principal(ids.lead, "sector-lead", [ids.storeA], [ids.sectorA1]);
      const supervisor = principal(ids.supervisor, "supervisor", [ids.storeA], []);
      const inventory = principal(ids.inventory, "inventory-team", [ids.storeA, ids.storeB], [ids.sectorA1, ids.sectorB]);
      const central = principal(ids.central, "central-operations", [ids.storeA], [ids.sectorA1], ["equipment-failure"], [ids.team]);

      expect((await repository.list(collaborator)).items.map(({ id }) => id)).toEqual([incidentIds.a1Open, incidentIds.a1Assigned, incidentIds.ownB, incidentIds.a1Category, incidentIds.a1Team, incidentIds.a1OtherTeam, incidentIds.a1InactiveTeam]);
      expect((await repository.list(lead)).items.map(({ id }) => id)).toEqual([incidentIds.a1Open, incidentIds.a1Assigned, incidentIds.a2Equipment, incidentIds.bInventory, incidentIds.bEquipment, incidentIds.bOther, incidentIds.a1Category, incidentIds.a1Team, incidentIds.a1OtherTeam, incidentIds.a1InactiveTeam]);
      expect((await repository.list(supervisor)).items.map(({ id }) => id)).toEqual([incidentIds.a1Open, incidentIds.a1Assigned, incidentIds.a2Equipment, incidentIds.a1Category, incidentIds.a1Team, incidentIds.a1OtherTeam, incidentIds.a1InactiveTeam]);
      expect((await repository.list(inventory)).items.map(({ id }) => id)).toEqual([incidentIds.a1Open, incidentIds.a1Assigned, incidentIds.bInventory]);
       expect((await repository.list(central)).items.map(({ id }) => id)).toEqual([incidentIds.a1Assigned, incidentIds.a1Category, incidentIds.a1Team]);
       expect((await repository.list(principal(ids.central, "central-operations", [ids.storeA], [ids.sectorB], ["equipment-failure"]))).items).toEqual([]);
       expect((await repository.list(principal(ids.inactive, "supervisor", [ids.storeA], [], [], [], false))).items).toEqual([]);
       const roleAllowsScopeDenies = principal(ids.inventory, "inventory-team", [ids.storeA], [ids.sectorA1]);
       const scopeAllowsRoleDenies = { storeId: ids.storeB, sectorId: ids.sectorB, category: "equipment-failure" };
       await expect(repository.list(roleAllowsScopeDenies, { filters: { storeId: ids.storeB, sectorId: ids.sectorB, category: "replenishment-blocked" } })).resolves.toEqual({ items: [] });
       await expect(repository.list(inventory, { filters: scopeAllowsRoleDenies })).resolves.toEqual({ items: [] });

       await expect(repository.detail(lead, incidentIds.a1Open)).resolves.toMatchObject({ id: incidentIds.a1Open, state: "open", version: 1 });
      await expect(repository.detail(lead, incidentIds.bOther)).resolves.toMatchObject({ id: incidentIds.bOther });
      await expect(repository.detail(lead, incidentIds.ownB)).resolves.toBeUndefined();
      await expect(repository.detail(central, incidentIds.a1Team)).resolves.toMatchObject({ id: incidentIds.a1Team, assigneeId: ids.supervisor, assigneeTeamId: ids.team });
      await expect(repository.detail(lead, id(9999))).resolves.toBeUndefined();
      const filtered = async (filters: Parameters<typeof repository.list>[1] extends infer Query ? Query : never) => (await repository.list(supervisor, filters)).items.map(({ id }) => id);
      await expect(filtered({ filters: { state: "classified" } })).resolves.toEqual([incidentIds.a1Assigned, incidentIds.a1Category, incidentIds.a1Team, incidentIds.a1OtherTeam, incidentIds.a1InactiveTeam]);
      await expect(filtered({ filters: { locationId: ids.locationA1 } })).resolves.toEqual([incidentIds.a1Open, incidentIds.a1Assigned, incidentIds.a1Category, incidentIds.a1Team, incidentIds.a1OtherTeam, incidentIds.a1InactiveTeam]);
        await expect(filtered({ filters: { category: "inventory-mismatch" } })).resolves.toEqual([incidentIds.a1Assigned]);
        await expect(filtered({ filters: { severity: "critical" } })).resolves.toEqual([incidentIds.a1Assigned]);
        await expect(filtered({ filters: { reporterId: ids.lead } })).resolves.toEqual([incidentIds.a1Assigned, incidentIds.a2Equipment]);
        await expect(filtered({ filters: { assigneeId: ids.central } })).resolves.toEqual([incidentIds.a1Assigned]);
       for (const [slaCondition, expected] of [["on-track", [incidentIds.a1Assigned]], ["warning", [incidentIds.a1Open]], ["breached", [incidentIds.a2Equipment]], ["paused", [incidentIds.a1Category]]] as const) await expect(filtered({ filters: { slaCondition } })).resolves.toEqual(expected);
       for (const [recurrenceDecisionState, expected] of [["pending", [incidentIds.a1Open]], ["confirmed", [incidentIds.a1Open, incidentIds.a2Equipment]], ["dismissed", [incidentIds.a1Assigned]]] as const) await expect(filtered({ filters: { recurrenceDecisionState } })).resolves.toEqual(expected);
       await expect(filtered({ filters: { slaCondition: "warning", recurrenceDecisionState: "confirmed" } })).resolves.toEqual([incidentIds.a1Open]);
       await expect(filtered({ filters: { recurrenceDecisionState: "dismissed", category: "equipment-failure" } })).resolves.toEqual([]);
       await expect(filtered({ filters: { slaCondition: "breached", recurrenceDecisionState: "confirmed", storeId: ids.storeB } })).resolves.toEqual([]);
       const filteredFirst = await repository.list(supervisor, { filters: { recurrenceDecisionState: "confirmed" }, limit: 1 }); const filteredSecond = await repository.list(supervisor, { filters: { recurrenceDecisionState: "confirmed" }, limit: 1, cursor: filteredFirst.nextCursor });
       expect(filteredFirst.items.map(({ id }) => id)).toEqual([incidentIds.a1Open]); expect(filteredSecond.items.map(({ id }) => id)).toEqual([incidentIds.a2Equipment]);

       const idsFor = async (filters: Record<string, string>) => (await repository.list(lead, { filters })).items.map(({ id }) => id);
       await expect(idsFor({ storeId: ids.storeA })).resolves.toEqual([incidentIds.a1Open, incidentIds.a1Assigned, incidentIds.a2Equipment, incidentIds.a1Category, incidentIds.a1Team, incidentIds.a1OtherTeam, incidentIds.a1InactiveTeam]);
       await expect(idsFor({ sectorId: ids.sectorA1 })).resolves.toEqual([incidentIds.a1Open, incidentIds.a1Assigned, incidentIds.a1Category, incidentIds.a1Team, incidentIds.a1OtherTeam, incidentIds.a1InactiveTeam]);
       const range = { storeId: ids.storeA, sectorId: ids.sectorA1, createdFrom: "2026-08-05T12:00:00Z", createdTo: "2026-08-05T12:00:00Z", updatedFrom: "2026-08-05T12:00:00Z", updatedTo: "2026-08-05T12:00:00Z" };
       await expect(idsFor(range)).resolves.toEqual([incidentIds.a1Open, incidentIds.a1Assigned]);
       await expect(idsFor({ ...range, updatedFrom: "2026-08-05T11:59:59Z", updatedTo: "2026-08-05T11:59:59Z" })).resolves.toEqual([]);
       await expect(repository.list(lead, { filters: { createdFrom: "2026-08-05T12:00:00Z", createdTo: "2026-08-05T11:59:59Z" } })).rejects.toBeInstanceOf(InvalidIncidentQueryError);

       const first = await repository.list(supervisor, { limit: 1 });
      const second = await repository.list(supervisor, { limit: 1, cursor: first.nextCursor });
      expect(first.items.map(({ id }) => id)).toEqual([incidentIds.a1Open]);
      expect(second.items.map(({ id }) => id)).toEqual([incidentIds.a1Assigned]);
      expect(new Set([...first.items, ...second.items].map(({ id }) => id)).size).toBe(2);
      for (const limit of [0, 201, 1.5]) await expect(repository.list(supervisor, { limit })).rejects.toBeInstanceOf(InvalidIncidentQueryError);

      await client.query("INSERT INTO incidents (id,organization_id,store_id,sector_id,location_id,category_key,severity_key,title,description,occurred_at,reporter_user_id,assignee_user_id,state,created_at,updated_at) SELECT ('00000000-0000-7000-8001-' || lpad(value::text,12,'0'))::uuid,$1,$2,$3,$4,'other','low','Generated','Plan fixture',now(),$5,CASE WHEN value <= 10 THEN NULL::uuid ELSE $6::uuid END,CASE WHEN value <= 10 THEN 'open' ELSE 'classified' END,now(),now() + value * interval '1 second' FROM generate_series(1,1000) value", [ids.organization, ids.storeA, ids.sectorA1, ids.locationA1, ids.lead, ids.central]);
      await client.query("ANALYZE incidents");
      const indexes = (await client.query("SELECT indexname FROM pg_indexes WHERE tablename = 'incidents'")).rows.map(({ indexname }) => indexname as string);
      expect(indexes).toEqual(expect.arrayContaining(["incidents_scope_state_updated_idx", "incidents_scope_category_updated_idx", "incidents_scope_team_state_updated_idx"]));
      for (const [name, actor, filters] of [["state", supervisor, { state: "open" }], ["category", supervisor, { category: "inventory-mismatch" }], ["team", central, {}]] as const) {
        queries.length = 0;
        await repository.list(actor, { filters });
        const query = queries.at(-1)!;
        const plan = await client.query(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`, [...query.parameters]);
        console.log(`06A natural ${name} plan indexes:`, indexes.filter((index) => JSON.stringify(plan.rows).includes(index)).join(",") || "none");
      }
    } finally {
      try { await pool?.end(); } finally { try { await client?.end(); } finally { await container?.stop(); } }
    }
  }, 120_000);
});
