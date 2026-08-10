import { createHash } from "node:crypto";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { IdempotencyConflictError, type ConfigurationExecutor, type ConfigurationInput, type ConfigurationOutcome } from "@shelfops/application/ports/configuration-executor";
import type { IdGenerator } from "@shelfops/application/ports/id-generator";
import type { IdempotencyScope } from "@shelfops/application/ports/idempotency-store";
import { configureReferenceData } from "@shelfops/application/reference-data/configure-reference-data";
import { v7 } from "uuid";
import { PostgresIdempotencyStore } from "../idempotency/postgres-idempotency-store.js";
import { PostgresConfigurationRepository, type SqlClient } from "./postgres-configuration-repository.js";

export interface TransactionClient extends SqlClient { release(error?: Error | boolean): void; }
export interface TransactionPool { connect(): Promise<TransactionClient>; }
export class IndeterminateCommitError extends Error { constructor(correlationId: string) { super(`indeterminate-commit:${correlationId}`); } }
const scopeFor = (principal: AuthorizedPrincipal, input: ConfigurationInput): IdempotencyScope => ({ principalId: principal.id, apiMajor: "v1", operation: "configure-location", targetKey: `${input.storeId}/${input.locationId}`, key: input.idempotencyKey });
const digest = (values: readonly unknown[]) => createHash("sha256").update(JSON.stringify(values)).digest("hex");
const fingerprint = (input: ConfigurationInput) => digest([input.storeId, input.locationId, input.expectedVersion, input.effectiveAt, input.effectiveUntil ?? null, input.active, input.label ?? null]);
const lockKey = (scope: IdempotencyScope) => createHash("sha256").update(JSON.stringify([scope.principalId, scope.apiMajor, scope.operation, scope.targetKey, scope.key])).digest().readBigInt64BE(0).toString();
const uuidv7Generator: IdGenerator = { next: () => v7() };
export class PostgresConfigurationExecutor implements ConfigurationExecutor {
  constructor(private readonly pool: TransactionPool, private readonly idGenerator: IdGenerator = uuidv7Generator) {}
  async execute(principal: AuthorizedPrincipal, input: ConfigurationInput): Promise<ConfigurationOutcome> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); } catch (error) { client.release(error instanceof Error ? error : true); throw error; }
    const scope = scopeFor(principal, input); const store = new PostgresIdempotencyStore(client);
    let outcome: ConfigurationOutcome;
    try {
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [lockKey(scope)]);
      const hash = fingerprint(input); const previous = await store.find(scope);
      if (previous?.state === "completed") {
        if (previous.requestHash !== hash) throw new IdempotencyConflictError();
        if (!previous.outcome) throw new Error("missing-idempotency-outcome");
        outcome = previous.outcome;
      } else {
        if (previous?.state === "pending") throw new Error("idempotency-pending");
        const eventId = this.idGenerator.next(); await store.insertPending(scope, hash, new Date(Date.now() + 86_400_000).toISOString()); const result = await configureReferenceData(principal, { eventId, target: "store-reference", referenceId: input.locationId, storeId: input.storeId, expectedVersion: input.expectedVersion, effectiveAt: input.effectiveAt, effectiveUntil: input.effectiveUntil, active: input.active, label: input.label }, new PostgresConfigurationRepository(client)); outcome = { status: 200 as const, eventId, ...result, effectiveAt: input.effectiveAt, correlationId: input.correlationId }; await store.complete(scope, outcome);
      }
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch {}
      client.release();
      throw error;
    }
    try { await client.query("COMMIT"); } catch { client.release(true); throw new IndeterminateCommitError(input.correlationId); }
    client.release(); return outcome;
  }
}
