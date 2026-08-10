import { readFile } from "node:fs/promises";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const ids = {
  organization: "00000000-0000-7000-8000-000000000001",
  storeA: "00000000-0000-7000-8000-000000000003",
  storeB: "00000000-0000-7000-8000-000000000004",
  sectorA: "00000000-0000-7000-8000-000000000005",
  sectorB: "00000000-0000-7000-8000-000000000006",
  locationA: "00000000-0000-7000-8000-000000000007",
  locationB: "00000000-0000-7000-8000-000000000008",
  product: "00000000-0000-7000-8000-000000000009",
  reporter: "00000000-0000-7000-8000-000000000010",
  assignee: "00000000-0000-7000-8000-000000000011",
  incident: "00000000-0000-7000-8000-000000000012"
};

describe("incidents core schema", () => {
  it("enforces current state, hierarchy, ownership, and scoped-read indexes", async () => {
    let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | undefined;
    let client: Client | undefined;

    try {
      container = await new PostgreSqlContainer(image).withDatabase("incidents_core").start();
      client = new Client({ connectionString: container.getConnectionUri() });
      await client.connect();
      await client.query(await readFile("migrations/001_reference-data.sql", "utf8"));
      await client.query(await readFile("migrations/005_incidents-core.sql", "utf8"));
      await client.query("INSERT INTO stores (id, organization_id, name) VALUES ($1, $2, 'Store A'), ($3, $2, 'Store B')", [ids.storeA, ids.organization, ids.storeB]);
      await client.query("INSERT INTO sectors (id, organization_id, store_id, name) VALUES ($1, $2, $3, 'Sector A'), ($4, $2, $5, 'Sector B')", [ids.sectorA, ids.organization, ids.storeA, ids.sectorB, ids.storeB]);
      await client.query("INSERT INTO locations (id, organization_id, store_id, sector_id, name) VALUES ($1, $2, $3, $4, 'Aisle A'), ($5, $2, $6, $7, 'Aisle B')", [ids.locationA, ids.organization, ids.storeA, ids.sectorA, ids.locationB, ids.storeB, ids.sectorB]);
      await client.query("INSERT INTO products (id, organization_id, name) VALUES ($1, $2, 'Product A')", [ids.product, ids.organization]);
      await client.query("INSERT INTO users (id, organization_id, name) VALUES ($1, $2, 'Reporter'), ($3, $2, 'Assignee')", [ids.reporter, ids.organization, ids.assignee]);

      const columns = await client.query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'incidents' ORDER BY ordinal_position");
      expect(columns.rows.map(({ column_name }) => column_name)).toEqual([
        "id", "organization_id", "store_id", "sector_id", "location_id", "product_id", "category_key", "severity_key",
        "category_provisional", "severity_provisional", "title", "description", "occurred_at", "reporter_user_id",
        "assignee_user_id", "ownership_gap", "state", "reopen_count", "version", "created_at", "updated_at"
      ]);

      const insert = "INSERT INTO incidents (id, organization_id, store_id, sector_id, location_id, product_id, category_key, severity_key, title, description, occurred_at, reporter_user_id) VALUES ($1, $2, $3, $4, $5, $6, 'out-of-stock', 'high', $7, $8, $9, $10)";
      await client.query(insert, [ids.incident, ids.organization, ids.storeA, ids.sectorA, ids.locationA, ids.product, "Missing product", "Shelf is empty", "2026-08-05T10:00:00.000Z", ids.reporter]);
      expect((await client.query("SELECT category_provisional, severity_provisional, assignee_user_id, ownership_gap, state, reopen_count, version, created_at IS NOT NULL AS created, updated_at IS NOT NULL AS updated FROM incidents WHERE id = $1", [ids.incident])).rows).toEqual([{ category_provisional: true, severity_provisional: true, assignee_user_id: null, ownership_gap: false, state: "open", reopen_count: 0, version: 1, created: true, updated: true }]);

      const invalid = (id: string, storeId: string, sectorId: string, locationId: string, title = "Invalid", state = "open", assignee?: string) => client!.query("INSERT INTO incidents (id, organization_id, store_id, sector_id, location_id, category_key, severity_key, title, description, occurred_at, reporter_user_id, state, assignee_user_id) VALUES ($1, $2, $3, $4, $5, 'other', 'low', $6, 'Reason', now(), $7, $8, $9)", [id, ids.organization, storeId, sectorId, locationId, title, ids.reporter, state, assignee]);
      await expect(invalid("00000000-0000-7000-8000-000000000020", ids.storeB, ids.sectorA, ids.locationA)).rejects.toThrow();
      await expect(invalid("00000000-0000-7000-8000-000000000021", ids.storeA, ids.sectorA, ids.locationB)).rejects.toThrow();
      await expect(invalid("00000000-0000-7000-8000-000000000022", ids.storeA, ids.sectorA, ids.locationA, "Invalid", "classified")).rejects.toThrow();
      await expect(invalid("00000000-0000-7000-8000-000000000023", ids.storeA, ids.sectorA, ids.locationA, "Invalid", "open", ids.assignee)).rejects.toThrow();
      await expect(invalid("00000000-0000-7000-8000-000000000024", ids.storeA, ids.sectorA, ids.locationA, " ")).rejects.toThrow();
      await expect(invalid("00000000-0000-7000-8000-000000000025", ids.storeA, ids.sectorA, ids.locationA, "Invalid", "closed")).rejects.toThrow();
      await expect(client.query("UPDATE incidents SET version = 0 WHERE id = $1", [ids.incident])).rejects.toThrow();
      await expect(client.query("DELETE FROM locations WHERE id = $1", [ids.locationA])).rejects.toThrow();

      const indexes = await client.query<{ indexname: string }>("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'incidents' ORDER BY indexname");
      expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
        "incidents_pkey", "incidents_scope_assignee_updated_idx", "incidents_scope_category_updated_idx",
        "incidents_scope_location_updated_idx", "incidents_scope_reporter_updated_idx", "incidents_scope_severity_updated_idx",
        "incidents_scope_state_updated_idx"
      ]);
    } finally {
      try { await client?.end(); } finally { await container?.stop(); }
    }
  }, 120_000);
});
