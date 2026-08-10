import { createHash } from "node:crypto";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { IncidentCreationIdempotencyConflictError, IncidentReferenceError, prepareIncidentCreation, type CreateIncidentInput, type IncidentCreated, type IncidentCreationOutcome } from "@shelfops/application/incidents/create-incident";
import type { IdGenerator } from "@shelfops/application/ports/id-generator";
import { v7 } from "uuid";
import type { SqlClient } from "../reference-data/postgres-configuration-repository.js";
import { PostgresSlaCycleExecutor } from "../sla/sla-cycle-executor.js";

interface IncidentTransactionClient extends SqlClient { release(error?: Error | boolean): void }
export interface IncidentTransactionPool { connect(): Promise<IncidentTransactionClient> }
const uuidv7Generator: IdGenerator = { next: () => v7() };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const lockKey = (principalId: string, key: string) => createHash("sha256").update(JSON.stringify([principalId, "v1", "create-incident", key])).digest().readBigInt64BE(0).toString();

export class PostgresIncidentCreationExecutor {
  constructor(private readonly pool: IncidentTransactionPool, private readonly idGenerator: IdGenerator = uuidv7Generator) {}
  async execute(principal: AuthorizedPrincipal, input: CreateIncidentInput): Promise<IncidentCreationOutcome> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); } catch (error) { client.release(error instanceof Error ? error : true); throw error; }
    let outcome: IncidentCreated;
    try {
      const clock = await client.query<{ now: Date }>("SELECT transaction_timestamp() AS now");
      const command = prepareIncidentCreation(principal, input, clock.rows[0]!.now);
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [lockKey(principal.id, command.idempotencyKey)]);
      const hash = digest([command.storeId, command.sectorId, command.locationId, command.productId ?? null, command.category, command.severity, command.title, command.description, command.occurredAt, command.textEvidence]);
      const existing = await client.query<{ request_hash: string; outcome: IncidentCreated }>("SELECT request_hash,outcome FROM incident_creation_idempotency WHERE principal_id=$1 AND api_major='v1' AND operation='create-incident' AND key=$2", [principal.id, command.idempotencyKey]);
      if (existing.rows[0]) {
        if (existing.rows[0].request_hash !== hash) throw new IncidentCreationIdempotencyConflictError();
        outcome = existing.rows[0].outcome;
      } else {
        const incidentId = this.idGenerator.next(), evidenceId = this.idGenerator.next(), eventId = this.idGenerator.next();
        const inserted = await client.query<{ created_at: Date; organization_id: string }>(`INSERT INTO incidents(id,organization_id,store_id,sector_id,location_id,product_id,category_key,severity_key,title,description,occurred_at,reporter_user_id)
          SELECT $1,u.organization_id,s.id,se.id,l.id,p.id,c.key,sv.key,$9,$10,$11,u.id FROM users u JOIN organizations o ON o.id=u.organization_id AND o.active JOIN stores s ON s.id=$3 AND s.organization_id=u.organization_id AND s.active JOIN sectors se ON se.id=$4 AND se.store_id=s.id AND se.organization_id=u.organization_id AND se.active JOIN locations l ON l.id=$5 AND l.sector_id=se.id AND l.store_id=s.id AND l.organization_id=u.organization_id AND l.active JOIN categories c ON c.key=$7 AND c.organization_id=u.organization_id AND c.active JOIN severities sv ON sv.key=$8 AND sv.organization_id=u.organization_id AND sv.active LEFT JOIN products p ON p.id=$6 AND p.organization_id=u.organization_id AND p.active LEFT JOIN product_store_availability pa ON pa.product_id=p.id AND pa.store_id=s.id AND pa.organization_id=u.organization_id AND pa.active WHERE u.id=$2 AND u.active AND ($6::uuid IS NULL OR pa.product_id IS NOT NULL) AND (NOT c.requires_product OR pa.product_id IS NOT NULL) RETURNING created_at,organization_id`, [incidentId, principal.id, command.storeId, command.sectorId, command.locationId, command.productId ?? null, command.category, command.severity, command.title, command.description, command.occurredAt]);
        if (!inserted.rows[0]) throw new IncidentReferenceError();
        await new PostgresSlaCycleExecutor(this.idGenerator).start(client, { incidentId, organizationId: inserted.rows[0].organization_id, category: command.category, severity: command.severity, startedAt: inserted.rows[0].created_at });
        await client.query("INSERT INTO incident_text_evidence(id,incident_id,sequence,actor_user_id,text) VALUES($1,$2,1,$3,$4)", [evidenceId, incidentId, principal.id, command.textEvidence]);
        await client.query("INSERT INTO incident_events(id,incident_id,sequence,event_type,actor_user_id,data) VALUES($1,$2,1,'created',$3,jsonb_build_object('evidenceId',$4::text))", [eventId, incidentId, principal.id, evidenceId]);
        outcome = { status: "created", incidentId, evidenceId, eventId, reporterId: principal.id, createdAt: inserted.rows[0].created_at.toISOString(), state: "open", version: 1 };
        await client.query("INSERT INTO incident_creation_idempotency(principal_id,api_major,operation,key,request_hash,outcome) VALUES($1,'v1','create-incident',$2,$3,$4)", [principal.id, command.idempotencyKey, hash, outcome]);
      }
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} client.release(); throw error; }
    try { await client.query("COMMIT"); } catch { client.release(true); return { status: "indeterminate", correlationId: input.correlationId, retryWithSameKey: true }; }
    client.release(); return outcome;
  }
}
