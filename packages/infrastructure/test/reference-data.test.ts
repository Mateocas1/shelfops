import { readFile } from "node:fs/promises";

import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const ids = {
  organization: "00000000-0000-7000-8000-000000000001",
  anotherOrganization: "00000000-0000-7000-8000-000000000002",
  storeA: "00000000-0000-7000-8000-000000000003",
  storeB: "00000000-0000-7000-8000-000000000004",
  sectorA: "00000000-0000-7000-8000-000000000005"
};

describe("reference-data migration", () => {
  it("enforces one organization and rejects cross-store locations", async () => {
    let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | undefined;
    let client: Client | undefined;

    try {
      container = await new PostgreSqlContainer(image).withDatabase("reference_data").start();
      client = new Client({ connectionString: container.getConnectionUri() });
      await client.connect();
      await client.query(await readFile("migrations/001_reference-data.sql", "utf8"));
      expect((await client.query("SELECT key FROM categories")).rowCount).toBe(7);
      expect((await client.query<{ key: string; guidance: string }>("SELECT key, guidance FROM severities ORDER BY sort_order")).rows).toEqual([
        { key: "low", guidance: "Limited impact with a workaround" }, { key: "medium", guidance: "Material local disruption without immediate safety or store-wide impact" }, { key: "high", guidance: "Major operational impact, substantial loss risk, or no practical workaround" }, { key: "critical", guidance: "Immediate safety, regulatory, severe loss, or store-wide continuity risk" }
      ]);
      expect((await client.query<{ organization_id: string; active: boolean }>("SELECT organization_id, active FROM categories UNION ALL SELECT organization_id, active FROM severities")).rows).toEqual(Array.from({ length: 11 }, () => ({ organization_id: ids.organization, active: true })));
      expect((await client.query("SELECT created_at FROM categories UNION ALL SELECT created_at FROM severities")).rowCount).toBe(11);
      await expect(client.query("INSERT INTO organizations (id, name) VALUES ($1, $2)", [ids.anotherOrganization, "Second"])).rejects.toThrow();
      await client.query("INSERT INTO stores (id, organization_id, name) VALUES ($1, $2, $3), ($4, $2, $5)", [ids.storeA, ids.organization, "Store A", ids.storeB, "Store B"]);
      await client.query("INSERT INTO sectors (id, organization_id, store_id, name) VALUES ($1, $2, $3, $4)", [ids.sectorA, ids.organization, ids.storeA, "Sector A"]);
      await expect(client.query("INSERT INTO locations (id, organization_id, store_id, sector_id, name) VALUES ('00000000-0000-7000-8000-000000000006', $1, $2, $3, 'Wrong store')", [ids.organization, ids.storeB, ids.sectorA])).rejects.toThrow();
    } finally {
      try { await client?.end(); } finally { await container?.stop(); }
    }
  }, 120_000);
});
