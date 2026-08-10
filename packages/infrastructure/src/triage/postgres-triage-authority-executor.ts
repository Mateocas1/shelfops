import { createHash } from "node:crypto";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { TriageForbiddenError, TriageIdempotencyConflictError, TriageInvalidTransitionError, TriageNotFoundError, TriageStaleVersionError, TriageValidationError } from "@shelfops/application/triage/authority";
import { actionDecision } from "@shelfops/domain/authorization/action-policy";
import { assignmentEligibility } from "@shelfops/domain/authorization/assignment-eligibility";
import { visibilityDecision } from "@shelfops/domain/authorization/visibility-policy";
import { evaluateTriage, type TriageEvaluationResult, type TriageRule } from "@shelfops/domain/triage/evaluator";
import { v7 } from "uuid";
import type { SqlClient } from "../reference-data/postgres-configuration-repository.js";

interface TransactionClient extends SqlClient { release(error?: Error | boolean): void; }
export interface TriageAuthorityTransactionPool { connect(): Promise<TransactionClient>; }
export type TriageEvaluationInput = Readonly<{ incidentId: string; expectedVersion: number; idempotencyKey: string; correlationId: string }>;
export type TriageEvaluationReceipt = Readonly<{ status: "evaluated"; incidentId: string; eventId: string; version: number; evaluation: TriageEvaluationResult & Readonly<{ id: string; incidentId: string; incidentVersion: number; evaluatedAt: string; actionCorrelationId: string }> }>;
export type TriageEvaluationOutcome = TriageEvaluationReceipt | Readonly<{ status: "indeterminate"; correlationId: string; retryWithSameKey: true }>;
export type TriageDecision = Readonly<{ field: "category" | "severity" | "assignee"; disposition: "confirmed" | "corrected" | "manual"; value: string; reason?: string }>;
export type TriageDecisionInput = Readonly<{ incidentId: string; evaluationId: string; expectedVersion: number; idempotencyKey: string; correlationId: string; complete: boolean; decisions: readonly TriageDecision[] }>;
export type TriageDecisionReceipt = Readonly<{ status: "decided"; incidentId: string; state: "open" | "classified"; version: number; eventId: string; classificationEventId?: string; decisionSet: Readonly<{ id: string; evaluationId: string; sequence: number; recordedFields: readonly ("category" | "severity" | "assignee")[]; complete: boolean; decidedAt: string; actionCorrelationId: string }> }>;
export type TriageDecisionOutcome = TriageDecisionReceipt | Readonly<{ status: "indeterminate"; correlationId: string; retryWithSameKey: true }>;

type IncidentRow = Readonly<{ id: string; organization_id: string; store_id: string; sector_id: string; location_id: string; product_id: string | null; category_key: string; severity_key: string; reporter_user_id: string; assignee_user_id: string | null; assignee_team_id: string | null; state: "open" | "classified" | "in-progress" | "blocked" | "resolved"; version: number }>;
type CandidateRow = Readonly<{ id: string; active: boolean; roles: string[]; store_ids: string[]; sector_ids: string[]; category_responsibilities: string[]; team_ids: string[] }>;
type RuleRow = Readonly<{ id: string; identifier: string; priority: number; store_id: string | null; sector_id: string | null; location_id: string | null; product_id: string | null; category_key: string | null; severity_key: string | null }>;
type TriageField = TriageDecision["field"];
type NormalizedDecision = Readonly<{ field: TriageField; disposition: TriageDecision["disposition"]; value: string; reason: string | null }>;
type DecisionEvaluationRow = Readonly<{ id: string; suggested: Readonly<{ category: string | null; severity: string | null; assigneeUserId: string | null; manualFields: readonly TriageField[] }> }>;
type DecisionItemRow = Readonly<{ field: TriageField; value_text: string | null; value_user_id: string | null }>;

const lockKey = (principalId: string, incidentId: string, key: string) => createHash("sha256").update(JSON.stringify([principalId, "v1", "triage-evaluate", incidentId, key])).digest().readBigInt64BE(0).toString();
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const decisionLockKey = (principalId: string, incidentId: string, key: string) => createHash("sha256").update(JSON.stringify([principalId, "v1", "triage-decide", incidentId, key])).digest().readBigInt64BE(0).toString();
const fields = ["category", "severity", "assignee"] as const;

function recordFor(incident: IncidentRow) {
  return { id: incident.id, storeId: incident.store_id, sectorId: incident.sector_id, category: incident.category_key, reporterId: incident.reporter_user_id, ...(incident.assignee_user_id ? { assigneeId: incident.assignee_user_id } : {}), ...(incident.assignee_team_id ? { assigneeTeamId: incident.assignee_team_id } : {}) };
}

function scopesFor(candidate: CandidateRow): AuthorizedPrincipal["roleScopes"] {
  return candidate.roles.map((role) => ({ role: role as AuthorizedPrincipal["roleScopes"][number]["role"], storeIds: candidate.store_ids, sectorIds: candidate.sector_ids, categoryResponsibilities: candidate.category_responsibilities, teamIds: candidate.team_ids }));
}

function requireValid(value: unknown): asserts value { if (!value) throw new TriageValidationError(); }
function nonblank(value: unknown): value is string { return typeof value === "string" && value.trim().length > 0; }

function normalizeDecisionInput(input: TriageDecisionInput): Readonly<{ incidentId: string; evaluationId: string; expectedVersion: number; idempotencyKey: string; correlationId: string; complete: boolean; decisions: readonly NormalizedDecision[] }> {
  requireValid(input && nonblank(input.incidentId) && nonblank(input.evaluationId) && Number.isInteger(input.expectedVersion) && input.expectedVersion >= 1 && nonblank(input.idempotencyKey) && nonblank(input.correlationId) && typeof input.complete === "boolean" && Array.isArray(input.decisions) && input.decisions.length >= 1 && input.decisions.length <= 3);
  const decisions = input.decisions.map((decision): NormalizedDecision => {
    requireValid(decision && fields.includes(decision.field) && ["confirmed", "corrected", "manual"].includes(decision.disposition) && nonblank(decision.value) && (decision.reason === undefined || nonblank(decision.reason)));
    return { field: decision.field, disposition: decision.disposition, value: decision.value.trim(), reason: decision.reason?.trim() ?? null };
  });
  requireValid(new Set(decisions.map((decision) => decision.field)).size === decisions.length);
  return { incidentId: input.incidentId.trim(), evaluationId: input.evaluationId.trim(), expectedVersion: input.expectedVersion, idempotencyKey: input.idempotencyKey.trim(), correlationId: input.correlationId.trim(), complete: input.complete, decisions };
}

function assertSuggestedDecision(decision: NormalizedDecision, evaluation: DecisionEvaluationRow): void {
  const suggested = decision.field === "category" ? evaluation.suggested.category : decision.field === "severity" ? evaluation.suggested.severity : evaluation.suggested.assigneeUserId;
  if (decision.disposition === "confirmed") requireValid(suggested !== null && decision.value === suggested && decision.reason === null);
  if (decision.disposition === "corrected") requireValid(suggested !== null && decision.value !== suggested && decision.reason !== null);
  if (decision.disposition === "manual") requireValid(evaluation.suggested.manualFields.includes(decision.field) && decision.reason !== null);
}

async function candidatesFor(client: TransactionClient, organizationId: string, userId?: string): Promise<CandidateRow[]> {
  const filter = userId === undefined ? "" : " AND u.id=$2";
  const values = userId === undefined ? [organizationId] : [organizationId, userId];
  return (await client.query<CandidateRow>(`SELECT u.id,u.active,COALESCE((SELECT array_agg(DISTINCT role ORDER BY role) FROM user_roles WHERE user_id=u.id),ARRAY[]::text[]) roles,COALESCE((SELECT array_agg(DISTINCT store_id::text ORDER BY store_id::text) FROM user_store_scopes WHERE user_id=u.id),ARRAY[]::text[]) store_ids,COALESCE((SELECT array_agg(DISTINCT sector_id::text ORDER BY sector_id::text) FROM user_sector_scopes WHERE user_id=u.id),ARRAY[]::text[]) sector_ids,COALESCE((SELECT array_agg(DISTINCT category_key ORDER BY category_key) FROM category_responsibilities WHERE user_id=u.id),ARRAY[]::text[]) category_responsibilities,COALESCE((SELECT array_agg(DISTINCT membership.team_id::text ORDER BY membership.team_id::text) FROM team_memberships membership JOIN teams team ON team.id=membership.team_id AND team.organization_id=membership.organization_id WHERE membership.user_id=u.id AND membership.organization_id=u.organization_id AND membership.active AND team.active),ARRAY[]::text[]) team_ids FROM users u WHERE u.organization_id=$1${filter} ORDER BY u.id`, values)).rows;
}

export class PostgresTriageAuthorityExecutor {
  constructor(private readonly pool: TriageAuthorityTransactionPool, private readonly id = () => v7()) {}

  async execute(principal: AuthorizedPrincipal, input: TriageEvaluationInput): Promise<TriageEvaluationOutcome> {
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); } catch (error) { client.release(error instanceof Error ? error : true); throw error; }
    let outcome: TriageEvaluationReceipt;
    try {
      const actor = (await client.query<{ organization_id: string; active: boolean }>("SELECT organization_id,active FROM users WHERE id=$1", [principal.id])).rows[0];
      if (!actor || !actor.active || !principal.active) throw new TriageForbiddenError();
      const incident = (await client.query<IncidentRow>("SELECT id,organization_id,store_id,sector_id,location_id,product_id,category_key,severity_key,reporter_user_id,assignee_user_id,assignee_team_id,state,version FROM incidents WHERE id=$1 AND organization_id=$2 FOR UPDATE", [input.incidentId, actor.organization_id])).rows[0];
      if (!incident || visibilityDecision(principal.id, principal.active, principal.roleScopes, recordFor(incident)).outcome !== "visible") throw new TriageNotFoundError();
      if (actionDecision(principal.id, principal.active, principal.roleScopes, principal.grants, recordFor(incident), "triage").outcome !== "allowed") throw new TriageForbiddenError();
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [lockKey(principal.id, input.incidentId, input.idempotencyKey)]);
      const currentActor = (await client.query<{ active: boolean }>("SELECT active FROM users WHERE id=$1 AND organization_id=$2", [principal.id, actor.organization_id])).rows[0];
      if (!currentActor?.active || visibilityDecision(principal.id, principal.active, principal.roleScopes, recordFor(incident)).outcome !== "visible" || actionDecision(principal.id, principal.active, principal.roleScopes, principal.grants, recordFor(incident), "triage").outcome !== "allowed") throw new TriageForbiddenError();
      const requestHash = digest([input.incidentId.trim(), input.expectedVersion]);
      const previous = (await client.query<{ request_hash: string; outcome: TriageEvaluationReceipt }>("SELECT request_hash,outcome FROM triage_idempotency_outcomes WHERE organization_id=$1 AND principal_id=$2 AND api_major='v1' AND action='triage-evaluate' AND incident_id=$3 AND key=$4", [actor.organization_id, principal.id, incident.id, input.idempotencyKey])).rows[0];
      if (previous) {
        if (previous.request_hash !== requestHash) throw new TriageIdempotencyConflictError();
        outcome = previous.outcome;
      } else {
        if (incident.state !== "open") throw new TriageInvalidTransitionError(incident.state);
        if (incident.version !== input.expectedVersion) throw new TriageStaleVersionError(incident.version);

        const effective = (await client.query<{ id: string; version: number }>("SELECT id,version FROM triage_rule_versions WHERE organization_id=$1 AND effective_at<=transaction_timestamp() ORDER BY effective_at DESC,version DESC LIMIT 1", [actor.organization_id])).rows[0];
        if (!effective) throw new Error("triage-unavailable");
        const rules = (await client.query<RuleRow>("SELECT id,identifier,priority,store_id,sector_id,location_id,product_id,category_key,severity_key FROM triage_rules WHERE organization_id=$1 AND rule_version_id=$2 ORDER BY priority,id", [actor.organization_id, effective.id])).rows.map((row): TriageRule => ({ id: row.id, identifier: row.identifier, priority: row.priority, predicates: { storeId: row.store_id, sectorId: row.sector_id, locationId: row.location_id, productId: row.product_id, category: row.category_key, severity: row.severity_key } }));
        if (rules.length === 0) throw new Error("triage-unavailable");
        const candidates = await candidatesFor(client, actor.organization_id);
        const evaluated = evaluateTriage({ effectiveRuleVersion: effective, inputs: { storeId: incident.store_id, sectorId: incident.sector_id, locationId: incident.location_id, productId: incident.product_id, category: incident.category_key, severity: incident.severity_key, eligibleAssigneeIds: candidates.filter((candidate) => assignmentEligibility(candidate.id, candidate.active, scopesFor(candidate), recordFor(incident)).outcome === "eligible").map((candidate) => candidate.id) }, rules });
        const version = (await client.query<{ version: number }>("UPDATE incidents SET version=version+1,updated_at=transaction_timestamp() WHERE id=$1 AND organization_id=$2 RETURNING version", [incident.id, actor.organization_id])).rows[0]!.version;
        const evaluationId = this.id(), eventId = this.id();
        const inserted = await client.query<{ evaluated_at: Date }>("INSERT INTO triage_evaluations(id,organization_id,incident_id,incident_version,rule_version_id,rule_id,rule_identifier,inputs,suggested,explanation,action_correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10::jsonb,$11) RETURNING evaluated_at", [evaluationId, actor.organization_id, incident.id, version, evaluated.rule.versionId, evaluated.rule.ruleId, evaluated.rule.identifier, JSON.stringify(evaluated.inputs), JSON.stringify(evaluated.suggested), JSON.stringify(evaluated.explanation), input.correlationId]);
        const sequence = (await client.query<{ sequence: number }>("SELECT COALESCE(MAX(sequence),0)+1 sequence FROM incident_events WHERE incident_id=$1", [incident.id])).rows[0]!.sequence;
        await client.query("INSERT INTO incident_events(id,incident_id,sequence,event_type,actor_user_id,origin,data) VALUES($1,$2,$3,'triage-evaluated',$4,'system',jsonb_build_object('evaluationId',$5::text,'correlationId',$6::text))", [eventId, incident.id, sequence, principal.id, evaluationId, input.correlationId]);
        outcome = { status: "evaluated", incidentId: incident.id, eventId, version, evaluation: { ...evaluated, id: evaluationId, incidentId: incident.id, incidentVersion: version, evaluatedAt: inserted.rows[0]!.evaluated_at.toISOString(), actionCorrelationId: input.correlationId } };
        await client.query("INSERT INTO triage_idempotency_outcomes(organization_id,principal_id,api_major,action,incident_id,key,request_hash,outcome,action_correlation_id) VALUES($1,$2,'v1','triage-evaluate',$3,$4,$5,$6::jsonb,$7)", [actor.organization_id, principal.id, incident.id, input.idempotencyKey, requestHash, JSON.stringify(outcome), input.correlationId]);
      }
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} client.release(); throw error; }
    try { await client.query("COMMIT"); } catch { client.release(true); return { status: "indeterminate", correlationId: input.correlationId, retryWithSameKey: true }; }
    client.release();
    return outcome;
  }

  async decide(principal: AuthorizedPrincipal, input: TriageDecisionInput): Promise<TriageDecisionOutcome> {
    const command = normalizeDecisionInput(input);
    const client = await this.pool.connect();
    try { await client.query("BEGIN"); } catch (error) { client.release(error instanceof Error ? error : true); throw error; }
    let outcome: TriageDecisionReceipt;
    try {
      const actor = (await client.query<{ organization_id: string; active: boolean }>("SELECT organization_id,active FROM users WHERE id=$1", [principal.id])).rows[0];
      if (!actor || !actor.active || !principal.active) throw new TriageForbiddenError();
      let incident = (await client.query<IncidentRow>("SELECT id,organization_id,store_id,sector_id,location_id,product_id,category_key,severity_key,reporter_user_id,assignee_user_id,assignee_team_id,state,version FROM incidents WHERE id=$1 AND organization_id=$2", [command.incidentId, actor.organization_id])).rows[0];
      if (!incident || visibilityDecision(principal.id, principal.active, principal.roleScopes, recordFor(incident)).outcome !== "visible") throw new TriageNotFoundError();
      if (actionDecision(principal.id, principal.active, principal.roleScopes, principal.grants, recordFor(incident), "triage").outcome !== "allowed") throw new TriageForbiddenError();
      await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [decisionLockKey(principal.id, command.incidentId, command.idempotencyKey)]);
      const currentActor = (await client.query<{ active: boolean }>("SELECT active FROM users WHERE id=$1 AND organization_id=$2", [principal.id, actor.organization_id])).rows[0];
      incident = (await client.query<IncidentRow>("SELECT id,organization_id,store_id,sector_id,location_id,product_id,category_key,severity_key,reporter_user_id,assignee_user_id,assignee_team_id,state,version FROM incidents WHERE id=$1 AND organization_id=$2 FOR UPDATE", [command.incidentId, actor.organization_id])).rows[0]!;
      if (!currentActor?.active || !incident || visibilityDecision(principal.id, principal.active, principal.roleScopes, recordFor(incident)).outcome !== "visible" || actionDecision(principal.id, principal.active, principal.roleScopes, principal.grants, recordFor(incident), "triage").outcome !== "allowed") throw new TriageForbiddenError();
      const requestHash = digest([command.incidentId, command.evaluationId, command.expectedVersion, command.complete, [...command.decisions].sort((left, right) => left.field.localeCompare(right.field))]);
      const previous = (await client.query<{ request_hash: string; outcome: TriageDecisionReceipt }>("SELECT request_hash,outcome FROM triage_idempotency_outcomes WHERE organization_id=$1 AND principal_id=$2 AND api_major='v1' AND action='triage-decide' AND incident_id=$3 AND key=$4", [actor.organization_id, principal.id, incident.id, command.idempotencyKey])).rows[0];
      if (previous) {
        if (previous.request_hash !== requestHash) throw new TriageIdempotencyConflictError();
        outcome = previous.outcome;
      } else {
        if (incident.state !== "open") throw new TriageInvalidTransitionError(incident.state);
        if (incident.version !== command.expectedVersion) throw new TriageStaleVersionError(incident.version);
        const evaluation = (await client.query<DecisionEvaluationRow>("SELECT id,suggested FROM triage_evaluations WHERE id=$1 AND incident_id=$2 AND organization_id=$3", [command.evaluationId, incident.id, actor.organization_id])).rows[0];
        if (!evaluation) throw new TriageNotFoundError();
        for (const decision of command.decisions) {
          assertSuggestedDecision(decision, evaluation);
          if (decision.field !== "assignee" && !(await client.query("SELECT 1 FROM " + (decision.field === "category" ? "categories" : "severities") + " WHERE key=$1 AND organization_id=$2 AND active", [decision.value, actor.organization_id])).rows[0]) throw new TriageValidationError();
        }
        const existing = await client.query<DecisionItemRow>("SELECT i.field,i.value_text,i.value_user_id FROM triage_decision_sets s JOIN triage_decision_items i ON i.decision_set_id=s.id AND i.organization_id=s.organization_id WHERE s.organization_id=$1 AND s.incident_id=$2 AND s.evaluation_id=$3 ORDER BY s.sequence,s.id,i.id", [actor.organization_id, incident.id, evaluation.id]);
        const aggregate: Record<TriageField, string | null> = { category: null, severity: null, assignee: null };
        for (const item of existing.rows) aggregate[item.field] = item.value_text ?? item.value_user_id;
        for (const decision of command.decisions) aggregate[decision.field] = decision.value;
        const effectiveComplete = command.complete && fields.every((field) => aggregate[field] !== null);
        if (effectiveComplete) {
          const finalRecord = { ...incident, category_key: aggregate.category!, assignee_user_id: aggregate.assignee! };
          if (actionDecision(principal.id, principal.active, principal.roleScopes, principal.grants, recordFor(finalRecord), "triage").outcome !== "allowed") throw new TriageForbiddenError();
          const assignee = (await candidatesFor(client, actor.organization_id, aggregate.assignee!))[0];
          if (!assignee || assignmentEligibility(assignee.id, assignee.active, scopesFor(assignee), recordFor(finalRecord)).outcome !== "eligible") throw new TriageValidationError();
        }
        const sequence = (await client.query<{ sequence: number }>("SELECT COALESCE(MAX(sequence),0)+1 sequence FROM triage_decision_sets WHERE evaluation_id=$1", [evaluation.id])).rows[0]!.sequence;
        const setId = this.id(), eventId = this.id();
        const inserted = await client.query<{ decided_at: Date }>("INSERT INTO triage_decision_sets(id,organization_id,incident_id,evaluation_id,sequence,complete,action_correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING decided_at", [setId, actor.organization_id, incident.id, evaluation.id, sequence, effectiveComplete, command.correlationId]);
        for (const decision of command.decisions) await client.query("INSERT INTO triage_decision_items(id,organization_id,decision_set_id,field,disposition,value_text,value_user_id,reason,actor_user_id,action_correlation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [this.id(), actor.organization_id, setId, decision.field, decision.disposition, decision.field === "assignee" ? null : decision.value, decision.field === "assignee" ? decision.value : null, decision.reason, principal.id, command.correlationId]);
        const recordedFields = fields.filter((field) => command.decisions.some((decision) => decision.field === field));
        const eventSequence = (await client.query<{ sequence: number }>("SELECT COALESCE(MAX(sequence),0)+1 sequence FROM incident_events WHERE incident_id=$1", [incident.id])).rows[0]!.sequence;
        await client.query("INSERT INTO incident_events(id,incident_id,sequence,event_type,actor_user_id,origin,data) VALUES($1,$2,$3,'triage-decided',$4,'human',jsonb_build_object('evaluationId',$5::text,'decisionSetId',$6::text,'recordedFields',$7::jsonb,'complete',$8::boolean,'correlationId',$9::text))", [eventId, incident.id, eventSequence, principal.id, evaluation.id, setId, JSON.stringify(recordedFields), effectiveComplete, command.correlationId]);
        let version: number, state: "open" | "classified" = "open", classificationEventId: string | undefined;
        if (effectiveComplete) {
          version = (await client.query<{ version: number }>("UPDATE incidents SET category_key=$1,severity_key=$2,assignee_user_id=$3,assignee_team_id=NULL,category_provisional=false,severity_provisional=false,state='classified',version=version+1,updated_at=transaction_timestamp() WHERE id=$4 AND organization_id=$5 RETURNING version", [aggregate.category, aggregate.severity, aggregate.assignee, incident.id, actor.organization_id])).rows[0]!.version;
          classificationEventId = this.id();
          const classificationSequence = (await client.query<{ sequence: number }>("SELECT COALESCE(MAX(sequence),0)+1 sequence FROM incident_events WHERE incident_id=$1", [incident.id])).rows[0]!.sequence;
          await client.query("INSERT INTO incident_events(id,incident_id,sequence,event_type,actor_user_id,origin,data) VALUES($1,$2,$3,'incident-classified',$4,'human',jsonb_build_object('evaluationId',$5::text,'decisionSetId',$6::text,'correlationId',$7::text))", [classificationEventId, incident.id, classificationSequence, principal.id, evaluation.id, setId, command.correlationId]);
          state = "classified";
        } else version = (await client.query<{ version: number }>("UPDATE incidents SET version=version+1,updated_at=transaction_timestamp() WHERE id=$1 AND organization_id=$2 RETURNING version", [incident.id, actor.organization_id])).rows[0]!.version;
        outcome = { status: "decided", incidentId: incident.id, state, version, eventId, ...(classificationEventId ? { classificationEventId } : {}), decisionSet: { id: setId, evaluationId: evaluation.id, sequence, recordedFields, complete: effectiveComplete, decidedAt: inserted.rows[0]!.decided_at.toISOString(), actionCorrelationId: command.correlationId } };
        await client.query("INSERT INTO triage_idempotency_outcomes(organization_id,principal_id,api_major,action,incident_id,key,request_hash,outcome,action_correlation_id) VALUES($1,$2,'v1','triage-decide',$3,$4,$5,$6::jsonb,$7)", [actor.organization_id, principal.id, incident.id, command.idempotencyKey, requestHash, JSON.stringify(outcome), command.correlationId]);
      }
    } catch (error) { try { await client.query("ROLLBACK"); } catch {} client.release(); throw error; }
    try { await client.query("COMMIT"); } catch { client.release(true); return { status: "indeterminate", correlationId: command.correlationId, retryWithSameKey: true }; }
    client.release();
    return outcome;
  }
}
