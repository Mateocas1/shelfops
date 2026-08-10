import { readFile } from "node:fs/promises";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import type { ConfigurationInput } from "@shelfops/application/ports/configuration-executor";
import type { IdGenerator } from "@shelfops/application/ports/id-generator";
import { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { PostgresConfigurationExecutor, IndeterminateCommitError, type TransactionPool } from "../src/reference-data/postgres-configuration-executor.js";

const image = "postgres:16.10-alpine@sha256:029660641a0cfc575b14f336ba448fb8a75fd595d42e1fa316b9fb4378742297";
const ids = { organization: "00000000-0000-7000-8000-000000000001", store: "00000000-0000-7000-8000-000000000003", sector: "00000000-0000-7000-8000-000000000005", location: "00000000-0000-7000-8000-000000000006", otherLocation: "00000000-0000-7000-8000-000000000007" };
const principal: AuthorizedPrincipal = { id: "central", active: true, roleScopes: [{ role: "central-operations", storeIds: [ids.store], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [{ action: "configure-store-policy", role: "central-operations" }] };
const request = (overrides: Partial<ConfigurationInput> = {}): ConfigurationInput => ({ storeId: ids.store, locationId: ids.location, expectedVersion: 1, effectiveAt: "2026-08-01T09:00:00.000Z", active: false, label: "Aisle 2", idempotencyKey: "key-a", correlationId: "correlation-a", ...overrides });
const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const idempotencyStoreSpecifier = ["@shelfops/infrastructure", "idempotency/postgres-idempotency-store"].join("/");

async function fixture(fault = false, idGenerator?: IdGenerator) {
  const container = await new PostgreSqlContainer(image).withDatabase("reference_idempotency").start();
  const pool = new Pool({ connectionString: container.getConnectionUri() });
  const client = await pool.connect();
  try {
    for (const migration of ["001_reference-data.sql", "003_configuration-events.sql", "004_reference-configuration-idempotency.sql"]) await client.query(await readFile(`migrations/${migration}`, "utf8"));
    await client.query("INSERT INTO stores (id, organization_id, name) VALUES ($1, $2, 'Store A')", [ids.store, ids.organization]);
    await client.query("INSERT INTO sectors (id, organization_id, store_id, name) VALUES ($1, $2, $3, 'Sector A')", [ids.sector, ids.organization, ids.store]);
    await client.query("INSERT INTO locations (id, organization_id, store_id, sector_id, name) VALUES ($1, $2, $3, $4, 'Aisle 1'), ($5, $2, $3, $4, 'Aisle 9')", [ids.location, ids.organization, ids.store, ids.sector, ids.otherLocation]);
  } finally { client.release(); }
  const transactionPool: TransactionPool = fault ? faultingPool(pool) : pool;
  return { executor: new PostgresConfigurationExecutor(transactionPool, idGenerator), pool, close: async () => { try { await pool.end(); } finally { await container.stop(); } } };
}

function faultingPool(pool: Pool): TransactionPool & { releaseCalls: Array<Error | boolean | undefined> } {
  const releaseCalls: Array<Error | boolean | undefined> = [];
  return { connect: async () => {
    const client = await pool.connect();
    return { query: async <Row extends Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
      if (sql === "COMMIT") { await client.query("COMMIT"); throw new Error("acknowledgement lost"); }
      return values === undefined ? client.query<Row>(sql) : client.query<Row>(sql, [...values]);
    }, release: (error?: Error | boolean) => { releaseCalls.push(error); client.release(error); } };
  }, releaseCalls };
}

describe("reference configuration idempotency", () => {
  it("exports the idempotency store from its public infrastructure subpath", async () => {
    const manifest = JSON.parse(await readFile("packages/infrastructure/package.json", "utf8")) as Readonly<{ exports: Record<string, unknown> }>;
    expect(manifest.exports["./idempotency/postgres-idempotency-store"]).toEqual({ types: "./dist/idempotency/postgres-idempotency-store.d.ts", default: "./dist/idempotency/postgres-idempotency-store.js" });
    const adapter = await import(idempotencyStoreSpecifier) as { PostgresIdempotencyStore: unknown };
    expect(adapter.PostgresIdempotencyStore).toBeTypeOf("function");
  });

  it("reads a completed claim through the public idempotency-store adapter", async () => {
    const calls: Array<Readonly<{ sql: string; values?: readonly unknown[] }>> = [];
    const adapter = await import(idempotencyStoreSpecifier) as { PostgresIdempotencyStore: new (database: unknown) => { find(scope: unknown): Promise<unknown> } };
    const store = new adapter.PostgresIdempotencyStore({ query: async (sql: string, values?: readonly unknown[]) => { calls.push({ sql, values }); return { rowCount: 1, rows: [{ state: "completed", request_hash: "hash-existing", outcome: { status: 200, eventId: "event-existing", version: 2, before: { active: true }, after: { active: false }, effectiveAt: "2026-08-01T09:00:00.000Z", correlationId: "correlation-existing" }, expires_at: new Date("2026-08-03T09:00:00.000Z") }] }; } });
    const scope = { principalId: "central", apiMajor: "v1", operation: "configure-location", targetKey: `${ids.store}/${ids.location}`, key: "key-existing" };
    await expect(store.find(scope)).resolves.toEqual({ state: "completed", requestHash: "hash-existing", outcome: { status: 200, eventId: "event-existing", version: 2, before: { active: true }, after: { active: false }, effectiveAt: "2026-08-01T09:00:00.000Z", correlationId: "correlation-existing" }, expiresAt: "2026-08-03T09:00:00.000Z" });
    expect(calls).toEqual([expect.objectContaining({ values: ["central", "v1", "configure-location", `${ids.store}/${ids.location}`, "key-existing"] })]);
  });

  it("preserves the pre-commit failure when best-effort rollback also fails", async () => {
    const original = new Error("pre-commit failure"); const rollback = new Error("rollback failure"); const queries: string[] = []; const releases: Array<Error | boolean | undefined> = [];
    const pool: TransactionPool = { connect: async () => ({ query: async <Row extends Record<string, unknown>>(sql: string) => { queries.push(sql); if (sql === "SELECT pg_advisory_xact_lock($1::bigint)") throw original; if (sql === "ROLLBACK") throw rollback; return { rowCount: 0, rows: [] as Row[] }; }, release: (error?: Error | boolean) => { releases.push(error); } }) };
    await expect(new PostgresConfigurationExecutor(pool).execute(principal, request())).rejects.toBe(original);
    expect(queries).toEqual(["BEGIN", "SELECT pg_advisory_xact_lock($1::bigint)", "ROLLBACK"]);
    expect(releases).toEqual([undefined]);
  });

  it("destroys the client with its typed begin failure", async () => {
    const begin = new Error("begin failure"); const releases: Array<Error | boolean | undefined> = [];
    const pool = { connect: async () => ({ query: async () => { throw begin; }, release: (error?: Error | boolean) => { releases.push(error); } }) } as TransactionPool;
    await expect(new PostgresConfigurationExecutor(pool).execute(principal, request())).rejects.toBe(begin);
    expect(releases).toEqual([begin]);
  });

  it("generates one UUIDv7 for a new event and replays its exact stored ID", async () => {
    const idGenerator: IdGenerator = { next: vi.fn(() => "01941f29-7c00-73e4-a310-744d2167fc5b") };
    const test = await fixture(false, idGenerator);
    try {
      const first = await test.executor.execute(principal, request());
      const replay = await test.executor.execute(principal, request());
      const persisted = await test.pool.query<{ id: string }>("SELECT id::text FROM configuration_events");
      expect(first.eventId).toMatch(uuidV7Pattern);
      expect(replay).toEqual(first); expect(persisted.rows).toEqual([{ id: first.eventId }]);
      expect(idGenerator.next).toHaveBeenCalledOnce();
    } finally { await test.close(); }
  }, 120_000);

  it("keeps same keys for distinct target tuples independent", async () => {
    const test = await fixture();
    try {
      const outcomes = await Promise.all([test.executor.execute(principal, request()), test.executor.execute(principal, request({ locationId: ids.otherLocation, label: "Aisle 10" }))]);
      expect(outcomes).toEqual(expect.arrayContaining([expect.objectContaining({ version: 2, after: { label: "Aisle 2", active: false } }), expect.objectContaining({ version: 2, after: { label: "Aisle 10", active: false } })]));
    } finally { await test.close(); }
  }, 120_000);

  it("locks the complete tuple and retains, persists, replays, and conflicts deterministically", async () => {
    const test = await fixture();
    try {
      const first = await test.executor.execute(principal, request());
      const replay = await test.executor.execute(principal, request());
      await expect(test.executor.execute(principal, request({ label: "Different" }))).rejects.toThrow("idempotency-conflict");
      const claim = await test.pool.query<{ expires_at: Date; created_at: Date }>("SELECT expires_at, created_at FROM reference_configuration_idempotency");
      expect(first).toMatchObject({ status: 200, eventId: expect.stringMatching(uuidV7Pattern), version: 2, before: { label: "Aisle 1", active: true }, after: { label: "Aisle 2", active: false } });
      expect(replay).toEqual(first); expect(claim.rows[0]?.expires_at.getTime()).toBeGreaterThanOrEqual((claim.rows[0]?.created_at.getTime() ?? Infinity) + 86_400_000);
    } finally { await test.close(); }
  }, 120_000);

  it("serializes same-scope callers, executes once, and rolls back failed claims", async () => {
    const test = await fixture();
    try {
      const [first, replay] = await Promise.all([test.executor.execute(principal, request()), test.executor.execute(principal, request())]);
      await expect(test.executor.execute(principal, request({ idempotencyKey: "rollback", expectedVersion: 99 }))).rejects.toThrow("stale-version");
      const counts = await test.pool.query<{ events: string; claims: string }>("SELECT (SELECT count(*) FROM configuration_events)::text AS events, (SELECT count(*) FROM reference_configuration_idempotency)::text AS claims");
      expect(replay).toEqual(first); expect(counts.rows[0]).toEqual({ events: "1", claims: "1" });
    } finally { await test.close(); }
  }, 120_000);

  it("reports an indeterminate commit but replays the durable version-three outcome", async () => {
    const baseline = await fixture();
    try {
      await baseline.executor.execute(principal, request());
      const faulting = faultingPool(baseline.pool);
      const fault = new PostgresConfigurationExecutor(faulting);
      const lost = request({ idempotencyKey: "lost", expectedVersion: 2, active: true, label: "Aisle 3", correlationId: "correlation-lost" });
      await expect(fault.execute(principal, lost)).rejects.toBeInstanceOf(IndeterminateCommitError);
      expect(faulting.releaseCalls).toEqual([true]);
      await expect(baseline.executor.execute(principal, lost)).resolves.toMatchObject({ version: 3, eventId: expect.any(String), after: { label: "Aisle 3", active: true } });
    } finally { await baseline.close(); }
  }, 120_000);
});
