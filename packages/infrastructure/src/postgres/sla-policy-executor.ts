import { createHash } from "node:crypto";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { assertFutureSlaPolicyEffectiveAt, prepareSlaPolicyConfiguration, type SlaPolicyConfigurationExecutor, type SlaPolicyConfigurationInput, type SlaPolicyConfigurationOutcome } from "@shelfops/application/sla/configure-policy";
import { IdempotencyConflictError } from "@shelfops/application/ports/configuration-executor";
import { v7 } from "uuid";
import type { SqlClient } from "../reference-data/postgres-configuration-repository.js";

interface TransactionClient extends SqlClient { release(error?: Error | boolean): void; }
export interface SlaPolicyTransactionPool { connect(): Promise<TransactionClient>; }
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const lockKey = (organizationId: string) => createHash("sha256").update(`configure-sla-policy:${organizationId}`).digest().readBigInt64BE(0).toString();
const fingerprint = (input: SlaPolicyConfigurationInput) => digest([input.expectedVersion, input.effectiveAt, [...input.rules].map((rule) => [rule.category, rule.severity, rule.warningAfterSeconds, rule.deadlineAfterSeconds]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))]);

export class PostgresSlaPolicyExecutor implements SlaPolicyConfigurationExecutor {
  constructor(private readonly pool: SlaPolicyTransactionPool, private readonly id = () => v7()) {}
  async execute(principal: AuthorizedPrincipal, input: SlaPolicyConfigurationInput): Promise<SlaPolicyConfigurationOutcome> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); } catch (error) { client.release(error instanceof Error ? error : true); throw error; }
    let outcome: SlaPolicyConfigurationOutcome;
    try {
      const actor = (await client.query<{ organization_id: string }>("SELECT u.organization_id FROM users u JOIN organizations o ON o.id=u.organization_id AND o.active WHERE u.id=$1 AND u.active", [principal.id])).rows[0];
      if (!actor) throw new Error("forbidden");
      const categories = await client.query<{ key: string }>("SELECT key FROM categories WHERE organization_id=$1 AND active ORDER BY key", [actor.organization_id]);
      const severities = await client.query<{ key: string }>("SELECT key FROM severities WHERE organization_id=$1 AND active ORDER BY key", [actor.organization_id]);
      const command = prepareSlaPolicyConfiguration(principal, input, { categories: categories.rows.map((row) => row.key), severities: severities.rows.map((row) => row.key) });
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [lockKey(actor.organization_id)]);
      const hash = fingerprint(command); const previous = (await client.query<{ request_hash: string; outcome: SlaPolicyConfigurationOutcome }>("SELECT request_hash,outcome FROM incident_creation_idempotency WHERE principal_id=$1 AND api_major='v1' AND operation='configure-sla-policy' AND key=$2", [principal.id, command.idempotencyKey])).rows[0];
      if (previous) { if (previous.request_hash !== hash) throw new IdempotencyConflictError(); outcome = previous.outcome; } else {
        const now = await client.query<{ now: Date }>("SELECT transaction_timestamp() now");
        const current = (await client.query<{ version: number; effective_at: Date }>("SELECT version,effective_at FROM sla_policy_versions WHERE organization_id=$1 AND active ORDER BY version DESC LIMIT 1 FOR UPDATE", [actor.organization_id])).rows[0];
        if (!current || current.version !== command.expectedVersion) throw new Error("stale-version"); assertFutureSlaPolicyEffectiveAt(command.effectiveAt, now.rows[0]!.now);
        const policyVersionId = this.id(); outcome = { policyVersionId, version: current.version + 1, effectiveAt: command.effectiveAt };
        await client.query("INSERT INTO sla_policy_versions(id,organization_id,version,active,clock_mode,pauses_when_blocked,effective_at,configured_by_user_id) VALUES($1,$2,$3,true,'continuous-utc',false,$4,$5)", [policyVersionId, actor.organization_id, outcome.version, command.effectiveAt, command.actorId]);
        for (const rule of command.rules) await client.query("INSERT INTO sla_policy_rules(policy_version_id,organization_id,category_key,severity_key,warning_after_seconds,deadline_after_seconds) VALUES($1,$2,$3,$4,$5,$6)", [policyVersionId, actor.organization_id, rule.category, rule.severity, rule.warningAfterSeconds, rule.deadlineAfterSeconds]);
        await client.query("INSERT INTO incident_creation_idempotency(principal_id,api_major,operation,key,request_hash,outcome) VALUES($1,'v1','configure-sla-policy',$2,$3,$4)", [principal.id, command.idempotencyKey, hash, outcome]);
      }
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} client.release(); throw error; }
    try { await client.query("COMMIT"); } catch (error) { client.release(true); throw error; }
    client.release(); return outcome;
  }
}
