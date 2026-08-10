import type { ConfigurationOutcome } from "@shelfops/application/ports/configuration-executor";
import type { IdempotencyRecord, IdempotencyScope, IdempotencyStore } from "@shelfops/application/ports/idempotency-store";
import type { SqlClient } from "../reference-data/postgres-configuration-repository.js";

type Row = { state: "pending" | "completed"; request_hash: string; outcome: ConfigurationOutcome | null; expires_at: string | Date };
const tuple = (scope: IdempotencyScope) => [scope.principalId, scope.apiMajor, scope.operation, scope.targetKey, scope.key];
export class PostgresIdempotencyStore implements IdempotencyStore {
  constructor(private readonly database: SqlClient) {}
  async find(scope: IdempotencyScope): Promise<IdempotencyRecord | undefined> {
    const row = (await this.database.query<Row>("SELECT state, request_hash, outcome, expires_at FROM reference_configuration_idempotency WHERE principal_id = $1 AND api_major = $2 AND operation = $3 AND target_key = $4 AND key = $5", tuple(scope))).rows[0];
    if (!row) return undefined;
    return { state: row.state, requestHash: row.request_hash, outcome: row.outcome ?? undefined, expiresAt: row.expires_at instanceof Date ? row.expires_at.toISOString() : row.expires_at };
  }
  async insertPending(scope: IdempotencyScope, requestHash: string, expiresAt: string): Promise<void> {
    await this.database.query("INSERT INTO reference_configuration_idempotency (principal_id, api_major, operation, target_key, key, request_hash, state, expires_at) VALUES ($1, $2, $3, $4, $5, $6, 'pending', GREATEST($7::timestamptz, transaction_timestamp() + interval '24 hours'))", [...tuple(scope), requestHash, expiresAt]);
  }
  async complete(scope: IdempotencyScope, outcome: ConfigurationOutcome): Promise<void> {
    await this.database.query("UPDATE reference_configuration_idempotency SET state = 'completed', outcome = $6::jsonb WHERE principal_id = $1 AND api_major = $2 AND operation = $3 AND target_key = $4 AND key = $5", [...tuple(scope), JSON.stringify(outcome)]);
  }
}
