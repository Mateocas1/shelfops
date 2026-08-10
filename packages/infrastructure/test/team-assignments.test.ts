import { readFile } from "node:fs/promises";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const id = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { organization: id(1), wrongOrganization: id(999), store: id(20), sector: id(21), location: id(22), reporter: id(23), assignee: id(24), team: id(25), otherTeam: id(26), open: id(27), assigned: id(28) };

describe("team assignments migration", () => {
  it("enforces organization-consistent authority and exposes the exact visibility index", async () => {
    let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | undefined;
    let client: Client | undefined;
    try {
      container = await new PostgreSqlContainer(image).withDatabase("team_assignments").start();
      client = new Client({ connectionString: container.getConnectionUri() });
      await client.connect();
      for (const migration of ["001_reference-data.sql", "002_identity-sessions.sql", "005_incidents-core.sql", "006_team-assignments.sql"]) await client.query(await readFile(`migrations/${migration}`, "utf8"));
      expect((await client.query("SELECT id FROM organizations")).rows).toEqual([{ id: ids.organization }]);
      expect((await client.query("SELECT count(*)::int AS count FROM categories")).rows).toEqual([{ count: 7 }]);
      expect((await client.query("SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'incidents' AND column_name = 'assignee_team_id'")).rows).toEqual([{ column_name: "assignee_team_id", is_nullable: "YES" }]);

      await client.query("INSERT INTO stores (id, organization_id, name) VALUES ($1,$2,'Store')", [ids.store, ids.organization]);
      await client.query("INSERT INTO sectors (id, organization_id, store_id, name) VALUES ($1,$2,$3,'Sector')", [ids.sector, ids.organization, ids.store]);
      await client.query("INSERT INTO locations (id, organization_id, store_id, sector_id, name) VALUES ($1,$2,$3,$4,'Location')", [ids.location, ids.organization, ids.store, ids.sector]);
      await client.query("INSERT INTO users (id, organization_id, name) VALUES ($1,$3,'Reporter'),($2,$3,'Assignee')", [ids.reporter, ids.assignee, ids.organization]);
      await expect(client.query("INSERT INTO teams (id, organization_id, key, name) VALUES ($1,$2,' ','Team')", [id(100), ids.organization])).rejects.toThrow();
      await client.query("INSERT INTO teams (id, organization_id, key, name) VALUES ($1,$3,'primary','Primary'),($2,$3,'other','Other')", [ids.team, ids.otherTeam, ids.organization]);
      await client.query("INSERT INTO team_memberships (organization_id, team_id, user_id) VALUES ($1,$2,$3)", [ids.organization, ids.team, ids.assignee]);
      await expect(client.query("INSERT INTO team_memberships (organization_id, team_id, user_id) VALUES ($1,$2,$3)", [ids.wrongOrganization, ids.team, ids.assignee])).rejects.toThrow();

      const base = "INSERT INTO incidents (id,organization_id,store_id,sector_id,location_id,category_key,severity_key,title,description,occurred_at,reporter_user_id,state,assignee_user_id,assignee_team_id) VALUES ($1,$2,$3,$4,$5,'other','low','Incident','Description',now(),$6,$7,$8,$9)";
      await client.query(base, [ids.open, ids.organization, ids.store, ids.sector, ids.location, ids.reporter, "open", null, null]);
      await expect(client.query(base, [id(101), ids.organization, ids.store, ids.sector, ids.location, ids.reporter, "open", null, ids.team])).rejects.toThrow();
      await expect(client.query(base, [id(102), ids.organization, ids.store, ids.sector, ids.location, ids.reporter, "classified", null, ids.team])).rejects.toThrow();
      await client.query(base, [ids.assigned, ids.organization, ids.store, ids.sector, ids.location, ids.reporter, "classified", ids.assignee, ids.team]);
      await expect(client.query("DELETE FROM teams WHERE id = $1", [ids.team])).rejects.toThrow();
      await expect(client.query("DELETE FROM users WHERE id = $1", [ids.assignee])).rejects.toThrow();

      const metadata = await client.query<{ columns: string[]; descending: boolean[]; predicate: string }>("SELECT array_agg(a.attname::text ORDER BY key.ordinality) AS columns, array_agg((idx.indoption[key.ordinality - 1] & 1) = 1 ORDER BY key.ordinality) AS descending, pg_get_expr(idx.indpred, idx.indrelid) AS predicate FROM pg_index idx JOIN pg_class class ON class.oid = idx.indexrelid CROSS JOIN LATERAL unnest(idx.indkey) WITH ORDINALITY AS key(attnum, ordinality) JOIN pg_attribute a ON a.attrelid = idx.indrelid AND a.attnum = key.attnum WHERE class.relname = 'incidents_scope_team_state_updated_idx' GROUP BY idx.indpred, idx.indrelid");
      expect(metadata.rows).toEqual([{ columns: ["organization_id", "store_id", "assignee_team_id", "state", "updated_at", "id"], descending: [false, false, false, false, true, false], predicate: "(assignee_team_id IS NOT NULL)" }]);

      await client.query("INSERT INTO incidents (id,organization_id,store_id,sector_id,location_id,category_key,severity_key,title,description,occurred_at,reporter_user_id,state,assignee_user_id,assignee_team_id,created_at,updated_at) SELECT ('00000000-0000-7000-8002-' || lpad(value::text,12,'0'))::uuid,$1,$2,$3,$4,'other','low','Plan','Fixture',now(),$5,'classified',$6,CASE WHEN value <= 10 THEN $7::uuid ELSE $8::uuid END,now(),now() + value * interval '1 second' FROM generate_series(1,1000) value", [ids.organization, ids.store, ids.sector, ids.location, ids.reporter, ids.assignee, ids.team, ids.otherTeam]);
      await client.query("ANALYZE incidents");
      const plan = await client.query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) SELECT id FROM incidents WHERE organization_id = $1 AND store_id = $2 AND assignee_team_id = $3 ORDER BY state, updated_at DESC, id LIMIT 50", [ids.organization, ids.store, ids.team]);
      process.stdout.write(`natural team index selected: ${JSON.stringify(plan.rows).includes("incidents_scope_team_state_updated_idx")}\n`);
    } finally {
      try { await client?.end(); } finally { await container?.stop(); }
    }
  }, 120_000);
});
