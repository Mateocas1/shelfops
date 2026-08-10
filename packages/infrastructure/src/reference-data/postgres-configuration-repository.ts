import type { ConfigurationCommand, ConfigurationRepository, ConfigurationResult } from "@shelfops/application/ports/configuration-repository";
export type SqlResult<Row extends Record<string, unknown> = Record<string, unknown>> = Readonly<{ rowCount: number | null; rows: Row[] }>;
export interface SqlClient { query<Row extends Record<string, unknown> = Record<string, unknown>>(sql: string, values?: readonly unknown[]): Promise<SqlResult<Row>>; }
export class PostgresConfigurationRepository implements ConfigurationRepository {
  constructor(private readonly database: SqlClient) {}
  async apply(command: ConfigurationCommand): Promise<ConfigurationResult> {
    if (command.target !== "store-reference") throw new Error("unsupported-target"); const result = await this.database.query<{ label: string; active: boolean; version: number }>("SELECT name AS label, active, version FROM locations WHERE id = $1 AND store_id = $2 FOR UPDATE", [command.referenceId, command.storeId]); const current = result.rows[0]; if (!current) throw new Error("not-found"); if (current.version !== command.expectedVersion) throw new Error("stale-version"); const before = { label: current.label, active: current.active }; const after = { label: command.label ?? current.label, active: command.active }; const version = current.version + 1; await this.database.query("UPDATE locations SET name = $1, active = $2, version = $3, updated_at = now() WHERE id = $4", [after.label, after.active, version, command.referenceId]); await this.database.query("INSERT INTO configuration_events (id, reference_id, actor_id, effective_at, effective_until, before_snapshot, after_snapshot, version) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)", [command.eventId, command.referenceId, command.actorId, command.effectiveAt, command.effectiveUntil ?? null, before, after, version]); return { version, before, after };
  }
  async history(): Promise<ReadonlyArray<Readonly<{ effectiveAt: string; before: Record<string, unknown>; after: Record<string, unknown> }>>> {
    const result = await this.database.query<{ effective_at: string | Date; before_snapshot: Record<string, unknown>; after_snapshot: Record<string, unknown> }>("SELECT effective_at, before_snapshot, after_snapshot FROM configuration_events ORDER BY effective_at, id");
    return result.rows.map((row) => ({ effectiveAt: row.effective_at instanceof Date ? row.effective_at.toISOString() : row.effective_at, before: row.before_snapshot, after: row.after_snapshot }));
  }
}
