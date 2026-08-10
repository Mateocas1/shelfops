import { createHash } from "node:crypto";
import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { TriageForbiddenError, TriageIdempotencyConflictError, TriageInvalidTransitionError, TriageNotFoundError, TriageStaleVersionError } from "@shelfops/application/triage/authority";
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

type IncidentRow = Readonly<{ id: string; organization_id: string; store_id: string; sector_id: string; location_id: string; product_id: string | null; category_key: string; severity_key: string; reporter_user_id: string; assignee_user_id: string | null; assignee_team_id: string | null; state: "open" | "classified" | "in-progress" | "blocked" | "resolved"; version: number }>;
type CandidateRow = Readonly<{ id: string; active: boolean; roles: string[]; store_ids: string[]; sector_ids: string[]; category_responsibilities: string[]; team_ids: string[] }>;
type RuleRow = Readonly<{ id: string; identifier: string; priority: number; store_id: string | null; sector_id: string | null; location_id: string | null; product_id: string | null; category_key: string | null; severity_key: string | null }>;

const lockKey = (principalId: string, incidentId: string, key: string) => createHash("sha256").update(JSON.stringify([principalId, "v1", "triage-evaluate", incidentId, key])).digest().readBigInt64BE(0).toString();
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function recordFor(incident: IncidentRow) {
  return { id: incident.id, storeId: incident.store_id, sectorId: incident.sector_id, category: incident.category_key, reporterId: incident.reporter_user_id, ...(incident.assignee_user_id ? { assigneeId: incident.assignee_user_id } : {}), ...(incident.assignee_team_id ? { assigneeTeamId: incident.assignee_team_id } : {}) };
}

function scopesFor(candidate: CandidateRow): AuthorizedPrincipal["roleScopes"] {
  return candidate.roles.map((role) => ({ role: role as AuthorizedPrincipal["roleScopes"][number]["role"], storeIds: candidate.store_ids, sectorIds: candidate.sector_ids, categoryResponsibilities: candidate.category_responsibilities, teamIds: candidate.team_ids }));
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
        const candidates = (await client.query<CandidateRow>("SELECT u.id,u.active,COALESCE((SELECT array_agg(DISTINCT role ORDER BY role) FROM user_roles WHERE user_id=u.id),ARRAY[]::text[]) roles,COALESCE((SELECT array_agg(DISTINCT store_id::text ORDER BY store_id::text) FROM user_store_scopes WHERE user_id=u.id),ARRAY[]::text[]) store_ids,COALESCE((SELECT array_agg(DISTINCT sector_id::text ORDER BY sector_id::text) FROM user_sector_scopes WHERE user_id=u.id),ARRAY[]::text[]) sector_ids,COALESCE((SELECT array_agg(DISTINCT category_key ORDER BY category_key) FROM category_responsibilities WHERE user_id=u.id),ARRAY[]::text[]) category_responsibilities,COALESCE((SELECT array_agg(DISTINCT membership.team_id::text ORDER BY membership.team_id::text) FROM team_memberships membership JOIN teams team ON team.id=membership.team_id AND team.organization_id=membership.organization_id WHERE membership.user_id=u.id AND membership.organization_id=u.organization_id AND membership.active AND team.active),ARRAY[]::text[]) team_ids FROM users u WHERE u.organization_id=$1 ORDER BY u.id", [actor.organization_id])).rows;
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
}
