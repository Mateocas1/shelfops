import { createHash } from "node:crypto";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { IncidentCreationIdempotencyConflictError, IncidentReferenceError, prepareIncidentCreation, type CreateIncidentInput, type IncidentCreated, type IncidentCreationOutcome, type InitialTriageProjection } from "@shelfops/application/incidents/create-incident";
import type { IdGenerator } from "@shelfops/application/ports/id-generator";
import { SlaRuleUnavailableError, startInitialSlaCycle, type SlaRule } from "@shelfops/application/sla/start-cycle";
import { reduceTriageProjection } from "@shelfops/application/triage/authority";
import { assignmentEligibility } from "@shelfops/domain/authorization/assignment-eligibility";
import { evaluateTriage, type TriageEvaluationResult, type TriageRule } from "@shelfops/domain/triage/evaluator";
import { v7 } from "uuid";
import type { SqlClient } from "../reference-data/postgres-configuration-repository.js";
import { PostgresSlaCycleExecutor } from "../sla/sla-cycle-executor.js";

interface IncidentTransactionClient extends SqlClient { release(error?: Error | boolean): void }
export interface IncidentTransactionPool { connect(): Promise<IncidentTransactionClient> }
const uuidv7Generator: IdGenerator = { next: () => v7() };
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const lockKey = (principalId: string, key: string) => createHash("sha256").update(JSON.stringify([principalId, "v1", "create-incident", key])).digest().readBigInt64BE(0).toString();
type SlaPolicyRow = Readonly<{ policy_version_id: string; policy_version: number; category_key: string; severity_key: string; clock_mode: "continuous-utc"; pauses_when_blocked: boolean; warning_after_seconds: number; deadline_after_seconds: number }>;
type CandidateRow = Readonly<{ id: string; active: boolean; roles: string[]; store_ids: string[]; sector_ids: string[]; category_responsibilities: string[]; team_ids: string[] }>;
type RuleRow = Readonly<{ id: string; identifier: string; priority: number; store_id: string | null; sector_id: string | null; location_id: string | null; product_id: string | null; category_key: string | null; severity_key: string | null }>;
type TriageIncident = Readonly<{ id: string; storeId: string; sectorId: string; locationId: string; productId: string | null; category: string; severity: string; reporterId: string }>;

function recordFor(incident: TriageIncident) { return { id: incident.id, storeId: incident.storeId, sectorId: incident.sectorId, category: incident.category, reporterId: incident.reporterId }; }
function scopesFor(candidate: CandidateRow): AuthorizedPrincipal["roleScopes"] { return candidate.roles.map((role) => ({ role: role as AuthorizedPrincipal["roleScopes"][number]["role"], storeIds: candidate.store_ids, sectorIds: candidate.sector_ids, categoryResponsibilities: candidate.category_responsibilities, teamIds: candidate.team_ids })); }
async function candidatesFor(client: IncidentTransactionClient, organizationId: string): Promise<CandidateRow[]> {
  return (await client.query<CandidateRow>("SELECT u.id,u.active,COALESCE((SELECT array_agg(DISTINCT role ORDER BY role) FROM user_roles WHERE user_id=u.id),ARRAY[]::text[]) roles,COALESCE((SELECT array_agg(DISTINCT store_id::text ORDER BY store_id::text) FROM user_store_scopes WHERE user_id=u.id),ARRAY[]::text[]) store_ids,COALESCE((SELECT array_agg(DISTINCT sector_id::text ORDER BY sector_id::text) FROM user_sector_scopes WHERE user_id=u.id),ARRAY[]::text[]) sector_ids,COALESCE((SELECT array_agg(DISTINCT category_key ORDER BY category_key) FROM category_responsibilities WHERE user_id=u.id),ARRAY[]::text[]) category_responsibilities,COALESCE((SELECT array_agg(DISTINCT membership.team_id::text ORDER BY membership.team_id::text) FROM team_memberships membership JOIN teams team ON team.id=membership.team_id AND team.organization_id=membership.organization_id WHERE membership.user_id=u.id AND membership.organization_id=u.organization_id AND membership.active AND team.active),ARRAY[]::text[]) team_ids FROM users u WHERE u.organization_id=$1 ORDER BY u.id", [organizationId])).rows;
}
async function startInitialSla(client: IncidentTransactionClient, idGenerator: IdGenerator, input: Readonly<{ incidentId: string; organizationId: string; category: string; severity: string; startedAt: Date }>): Promise<IncidentCreated["sla"]> {
  const policy = (await client.query<SlaPolicyRow>("SELECT p.id policy_version_id,p.version policy_version,r.category_key,r.severity_key,p.clock_mode,p.pauses_when_blocked,r.warning_after_seconds,r.deadline_after_seconds FROM sla_policy_versions p JOIN sla_policy_rules r ON r.policy_version_id=p.id AND r.organization_id=p.organization_id JOIN categories c ON c.key=r.category_key AND c.organization_id=p.organization_id AND c.active JOIN severities s ON s.key=r.severity_key AND s.organization_id=p.organization_id AND s.active WHERE p.organization_id=$1 AND p.active AND p.effective_at<=transaction_timestamp() AND r.category_key=$2 AND r.severity_key=$3 ORDER BY p.effective_at DESC,p.version DESC LIMIT 1", [input.organizationId, input.category, input.severity])).rows[0];
  if (!policy) throw new SlaRuleUnavailableError();
  const rule: SlaRule = { policyVersionId: policy.policy_version_id, policyVersion: policy.policy_version, category: policy.category_key, severity: policy.severity_key, clockMode: policy.clock_mode, pausesWhenBlocked: policy.pauses_when_blocked, warningAfterSeconds: policy.warning_after_seconds, deadlineAfterSeconds: policy.deadline_after_seconds };
  const cycle = startInitialSlaCycle({ incidentId: input.incidentId, startedAt: input.startedAt, rule }); const snapshotId = idGenerator.next(), cycleId = idGenerator.next(), segmentId = idGenerator.next();
  await client.query("INSERT INTO incident_sla_rule_snapshots(id,incident_id,organization_id,policy_version_id,policy_version,category_key,severity_key,clock_mode,pauses_when_blocked,warning_after_seconds,deadline_after_seconds) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [snapshotId, input.incidentId, input.organizationId, rule.policyVersionId, rule.policyVersion, rule.category, rule.severity, rule.clockMode, rule.pausesWhenBlocked, rule.warningAfterSeconds, rule.deadlineAfterSeconds]);
  await client.query("INSERT INTO incident_sla_cycles(id,incident_id,snapshot_id,sequence,condition,started_at,warning_at,deadline_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [cycleId, cycle.incidentId, snapshotId, cycle.sequence, cycle.condition, cycle.startedAt, cycle.warningAt, cycle.deadlineAt]);
  await client.query("INSERT INTO incident_sla_segments(id,cycle_id,snapshot_id,incident_id,sequence,started_at,warning_at,deadline_at,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)", [segmentId, cycleId, snapshotId, input.incidentId, cycle.segmentSequence, cycle.startedAt, cycle.warningAt, cycle.deadlineAt, cycle.active]);
  return { cycleId, cycleSequence: cycle.sequence, condition: cycle.condition, warningAt: cycle.warningAt.toISOString(), deadlineAt: cycle.deadlineAt.toISOString(), policyVersionId: rule.policyVersionId, policyVersion: rule.policyVersion, clockMode: rule.clockMode, pausesWhenBlocked: rule.pausesWhenBlocked };
}
async function evaluateInitialTriage(client: IncidentTransactionClient, organizationId: string, incident: TriageIncident): Promise<TriageEvaluationResult> {
  const effective = (await client.query<{ id: string; version: number }>("SELECT id,version FROM triage_rule_versions WHERE organization_id=$1 AND effective_at<=transaction_timestamp() ORDER BY effective_at DESC,version DESC LIMIT 1", [organizationId])).rows[0];
  if (!effective) throw new Error("triage-unavailable");
  const rules = (await client.query<RuleRow>("SELECT id,identifier,priority,store_id,sector_id,location_id,product_id,category_key,severity_key FROM triage_rules WHERE organization_id=$1 AND rule_version_id=$2 ORDER BY priority,id", [organizationId, effective.id])).rows.map((row): TriageRule => ({ id: row.id, identifier: row.identifier, priority: row.priority, predicates: { storeId: row.store_id, sectorId: row.sector_id, locationId: row.location_id, productId: row.product_id, category: row.category_key, severity: row.severity_key } }));
  if (rules.length === 0) throw new Error("triage-unavailable");
  const eligibleAssigneeIds = (await candidatesFor(client, organizationId)).filter((candidate) => assignmentEligibility(candidate.id, candidate.active, scopesFor(candidate), recordFor(incident)).outcome === "eligible").map((candidate) => candidate.id);
  return evaluateTriage({ effectiveRuleVersion: effective, inputs: { storeId: incident.storeId, sectorId: incident.sectorId, locationId: incident.locationId, productId: incident.productId, category: incident.category, severity: incident.severity, eligibleAssigneeIds }, rules });
}

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
        const triageAvailable = (await client.query<{ available: boolean }>("SELECT to_regclass('triage_rule_versions') IS NOT NULL available")).rows[0]!.available;
        if (!triageAvailable) {
          await new PostgresSlaCycleExecutor(this.idGenerator).start(client, { incidentId, organizationId: inserted.rows[0].organization_id, category: command.category, severity: command.severity, startedAt: inserted.rows[0].created_at });
          await client.query("INSERT INTO incident_text_evidence(id,incident_id,sequence,actor_user_id,text) VALUES($1,$2,1,$3,$4)", [evidenceId, incidentId, principal.id, command.textEvidence]);
          await client.query("INSERT INTO incident_events(id,incident_id,sequence,event_type,actor_user_id,data) VALUES($1,$2,1,'created',$3,jsonb_build_object('evidenceId',$4::text))", [eventId, incidentId, principal.id, evidenceId]);
          outcome = { status: "created", incidentId, evidenceId, eventId, reporterId: principal.id, createdAt: inserted.rows[0].created_at.toISOString(), state: "open", version: 1 } as IncidentCreated;
        } else {
          const sla = await startInitialSla(client, this.idGenerator, { incidentId, organizationId: inserted.rows[0].organization_id, category: command.category, severity: command.severity, startedAt: inserted.rows[0].created_at });
          await client.query("INSERT INTO incident_text_evidence(id,incident_id,sequence,actor_user_id,text) VALUES($1,$2,1,$3,$4)", [evidenceId, incidentId, principal.id, command.textEvidence]);
          await client.query("INSERT INTO incident_events(id,incident_id,sequence,event_type,actor_user_id,origin,data) VALUES($1,$2,1,'created',$3,'human',jsonb_build_object('evidenceId',$4::text,'correlationId',$5::text))", [eventId, incidentId, principal.id, evidenceId, command.actionCorrelationId]);
          const evaluated = await evaluateInitialTriage(client, inserted.rows[0].organization_id, { id: incidentId, storeId: command.storeId, sectorId: command.sectorId, locationId: command.locationId, productId: command.productId ?? null, category: command.category, severity: command.severity, reporterId: principal.id });
          const evaluationId = this.idGenerator.next(), triageEventId = this.idGenerator.next();
          const evaluation = { ...evaluated, id: evaluationId, incidentId, incidentVersion: 1 as const, evaluatedAt: (await client.query<{ evaluated_at: Date }>("INSERT INTO triage_evaluations(id,organization_id,incident_id,incident_version,rule_version_id,rule_id,rule_identifier,inputs,suggested,explanation,action_correlation_id) VALUES($1,$2,$3,1,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10) RETURNING evaluated_at", [evaluationId, inserted.rows[0].organization_id, incidentId, evaluated.rule.versionId, evaluated.rule.ruleId, evaluated.rule.identifier, JSON.stringify(evaluated.inputs), JSON.stringify(evaluated.suggested), JSON.stringify(evaluated.explanation), command.actionCorrelationId])).rows[0]!.evaluated_at.toISOString(), actionCorrelationId: command.actionCorrelationId };
          await client.query("INSERT INTO incident_events(id,incident_id,sequence,event_type,actor_user_id,origin,data) VALUES($1,$2,2,'triage-evaluated',$3,'system',jsonb_build_object('evaluationId',$4::text,'correlationId',$5::text))", [triageEventId, incidentId, principal.id, evaluationId, command.actionCorrelationId]);
          const triage = reduceTriageProjection<typeof evaluation, never>({ incidentId, state: "open", version: 1, evaluations: [evaluation], decisionSets: [] });
          if (triage.state !== "open" || triage.version !== 1 || triage.status !== "awaiting-decision" || triage.currentEvaluation === null || triage.complete) throw new Error("invalid-initial-triage");
          outcome = { status: "created", incidentId, evidenceId, eventId, triageEventId, reporterId: principal.id, createdAt: inserted.rows[0].created_at.toISOString(), state: "open", version: 1, actionCorrelationId: command.actionCorrelationId, sla, triage: triage as InitialTriageProjection };
        }
        await client.query("INSERT INTO incident_creation_idempotency(principal_id,api_major,operation,key,request_hash,outcome) VALUES($1,'v1','create-incident',$2,$3,$4)", [principal.id, command.idempotencyKey, hash, outcome]);
      }
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} client.release(); throw error; }
    try { await client.query("COMMIT"); } catch { client.release(true); return { status: "indeterminate", correlationId: input.correlationId, retryWithSameKey: true }; }
    client.release(); return outcome;
  }
}
