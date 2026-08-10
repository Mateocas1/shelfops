import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import type { TriageAuthority } from "@shelfops/application/triage/authority";
import type { Pool } from "pg";
import { PostgresAuthorizedIncidentRepository } from "../repositories/authorized-incident-repository.js";

type JsonObject = Readonly<Record<string, unknown>>;
type SourceState = "open" | "classified" | "in-progress" | "blocked" | "resolved";
type StoredEvaluation = Readonly<{
  id: string; incidentId: string; incidentVersion: number;
  rule: Readonly<{ identifier: string; ruleId: string | null; versionId: string; version: number }>;
  inputs: JsonObject; suggested: JsonObject; explanation: JsonObject; evaluatedAt: string; actionCorrelationId: string;
}>;
type StoredDecision = Readonly<{
  id: string; field: "category" | "severity" | "assignee"; disposition: "confirmed" | "corrected" | "manual";
  value: string; reason: string | null; actorUserId: string; decidedAt: string; actionCorrelationId: string;
}>;
type StoredAuthority = Omit<TriageAuthority<StoredEvaluation, StoredDecision>, "state" | "decisionSets"> & Readonly<{ state: SourceState; decisionSets: readonly StoredDecisionSet[] }>;
type EvaluationRow = Readonly<{
  id: string; incident_id: string; incident_version: number; rule_version_id: string; rule_version: number; rule_id: string | null;
  rule_identifier: string; inputs: JsonObject; suggested: JsonObject; explanation: JsonObject; evaluated_at: Date; action_correlation_id: string;
}>;
type DecisionRow = Readonly<{
  set_id: string; evaluation_id: string; sequence: number; complete: boolean; set_decided_at: Date; set_action_correlation_id: string;
  item_id: string | null; field: StoredDecision["field"] | null; disposition: StoredDecision["disposition"] | null; value_text: string | null;
  value_user_id: string | null; reason: string | null; actor_user_id: string | null; item_decided_at: Date | null; item_action_correlation_id: string | null;
}>;
type StoredDecisionSet = Readonly<{
  id: string; evaluationId: string; sequence: number; complete: boolean; decidedAt: string; actionCorrelationId: string; items: readonly StoredDecision[];
}>;

export class PostgresTriageAuthoritySource {
  constructor(private readonly pool: Pool) {}

  async read(principal: AuthorizedPrincipal, incidentId: string): Promise<StoredAuthority | undefined> {
    const incident = await new PostgresAuthorizedIncidentRepository(this.pool).detail(principal, incidentId);
    if (incident === undefined) return undefined;

    const evaluations = await this.pool.query<EvaluationRow>("SELECT e.id,e.incident_id,e.incident_version,e.rule_version_id,v.version rule_version,e.rule_id,e.rule_identifier,e.inputs,e.suggested,e.explanation,e.evaluated_at,e.action_correlation_id FROM triage_evaluations e JOIN triage_rule_versions v ON v.id=e.rule_version_id AND v.organization_id=e.organization_id WHERE e.organization_id=$1 AND e.incident_id=$2 ORDER BY e.incident_version DESC,e.id DESC", [incident.organizationId, incident.id]);
    const decisions = await this.pool.query<DecisionRow>("SELECT s.id set_id,s.evaluation_id,s.sequence,s.complete,s.decided_at set_decided_at,s.action_correlation_id set_action_correlation_id,i.id item_id,i.field,i.disposition,i.value_text,i.value_user_id,i.reason,i.actor_user_id,i.decided_at item_decided_at,i.action_correlation_id item_action_correlation_id FROM triage_decision_sets s JOIN triage_evaluations e ON e.id=s.evaluation_id AND e.organization_id=s.organization_id AND e.incident_id=s.incident_id LEFT JOIN triage_decision_items i ON i.decision_set_id=s.id AND i.organization_id=s.organization_id WHERE s.organization_id=$1 AND s.incident_id=$2 ORDER BY e.incident_version DESC,e.id DESC,s.sequence,s.id,i.id", [incident.organizationId, incident.id]);
    const sets = new Map<string, { id: string; evaluationId: string; sequence: number; complete: boolean; decidedAt: string; actionCorrelationId: string; items: StoredDecision[] }>();
    for (const row of decisions.rows) {
      let set = sets.get(row.set_id);
      if (set === undefined) {
        set = { id: row.set_id, evaluationId: row.evaluation_id, sequence: row.sequence, complete: row.complete, decidedAt: row.set_decided_at.toISOString(), actionCorrelationId: row.set_action_correlation_id, items: [] };
        sets.set(row.set_id, set);
      }
      if (row.item_id !== null) set.items.push({ id: row.item_id, field: row.field!, disposition: row.disposition!, value: row.value_text ?? row.value_user_id!, reason: row.reason, actorUserId: row.actor_user_id!, decidedAt: row.item_decided_at!.toISOString(), actionCorrelationId: row.item_action_correlation_id! });
    }

    return {
      incidentId: incident.id,
      state: incident.state,
      version: incident.version,
      evaluations: evaluations.rows.map((row) => ({ id: row.id, incidentId: row.incident_id, incidentVersion: row.incident_version, rule: { identifier: row.rule_identifier, ruleId: row.rule_id, versionId: row.rule_version_id, version: row.rule_version }, inputs: row.inputs, suggested: row.suggested, explanation: row.explanation, evaluatedAt: row.evaluated_at.toISOString(), actionCorrelationId: row.action_correlation_id })),
      decisionSets: [...sets.values()] as readonly StoredDecisionSet[]
    };
  }
}
