import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { Client } from "pg";
import { describe, expect, it } from "vitest";

const databaseName = "shelfops_harness";
const postgresImage = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";

describe("PostgreSQL Testcontainers harness", () => {
  it("connects to a disposable PostgreSQL 16 database", async () => {
    let container: Awaited<ReturnType<PostgreSqlContainer["start"]>> | undefined;
    let client: Client | undefined;

    try {
      container = await new PostgreSqlContainer(postgresImage)
        .withDatabase(databaseName)
        .start();
      client = new Client({ connectionString: container.getConnectionUri() });
      await client.connect();

      const selectResult = await client.query<{ value: number }>("SELECT 1 AS value");
      const databaseResult = await client.query<{ database_name: string }>(
        "SELECT current_database() AS database_name"
      );

      expect(selectResult.rows).toEqual([{ value: 1 }]);
      expect(databaseResult.rows).toEqual([{ database_name: databaseName }]);
    } finally {
      try {
        await client?.end();
      } finally {
        await container?.stop();
      }
    }
  }, 120_000);
});
