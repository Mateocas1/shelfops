import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { Kysely, PostgresDialect, type Expression, type ExpressionBuilder, type SqlBool } from "kysely";
import type { Pool } from "pg";

type IncidentState = "open" | "classified" | "in-progress" | "blocked" | "resolved";
type SlaCondition = "on-track" | "warning" | "breached" | "paused";
type RecurrenceDecisionState = "pending" | "confirmed" | "dismissed";
type TriageState = "open" | "classified";
type JsonObject = Readonly<Record<string, unknown>>;
type IncidentTable = {
  id: string; organization_id: string; store_id: string; sector_id: string; location_id: string; product_id: string | null;
  category_key: string; severity_key: string; category_provisional: boolean; severity_provisional: boolean;
  title: string; description: string; occurred_at: Date; reporter_user_id: string; assignee_user_id: string | null; assignee_team_id: string | null;
  ownership_gap: boolean; state: IncidentState; reopen_count: number; version: number; created_at: Date; updated_at: Date;
};
type UserTable = { id: string; organization_id: string; active: boolean };
type SlaCycleTable = { id: string; incident_id: string; snapshot_id: string; sequence: number; condition: SlaCondition };
type SlaSegmentTable = { cycle_id: string; snapshot_id: string; active: boolean; deadline_at: Date };
type RecurrenceSuggestionStateTable = { organization_id: string; suggestion_id: string; incident_id: string; state: RecurrenceDecisionState };
type Database = { incidents: IncidentTable; users: UserTable; incident_sla_cycles: SlaCycleTable; incident_sla_segments: SlaSegmentTable; current_recurrence_suggestion_states: RecurrenceSuggestionStateTable };
type IncidentExpressionBuilder = ExpressionBuilder<Database, "incidents">;
type RoleScope = AuthorizedPrincipal["roleScopes"][number];

export type IncidentFilters = Readonly<{ storeId?: string; sectorId?: string; locationId?: string; category?: string; severity?: string; state?: IncidentState; assigneeId?: string; reporterId?: string; slaCondition?: SlaCondition; recurrenceDecisionState?: RecurrenceDecisionState; createdFrom?: string; createdTo?: string; updatedFrom?: string; updatedTo?: string }>;
export type IncidentCursor = Readonly<{ updatedAt: string; id: string }>;
export type IncidentListQuery = Readonly<{ filters?: IncidentFilters; cursor?: IncidentCursor; limit?: number }>;
export type IncidentRead = Readonly<{
  id: string; organizationId: string; storeId: string; sectorId: string; locationId: string; productId?: string;
  category: string; severity: string; categoryProvisional: boolean; severityProvisional: boolean; title: string; description: string;
  occurredAt: string; reporterId: string; assigneeId?: string; assigneeTeamId?: string; ownershipGap: boolean; state: IncidentState; reopenCount: number;
  version: number; createdAt: string; updatedAt: string;
}>;
export type IncidentList = Readonly<{ items: readonly IncidentRead[]; nextCursor?: IncidentCursor }>;
export type IncidentQueryLog = Readonly<{ sql: string; parameters: readonly unknown[] }>;
type TriageEvaluationRead = Readonly<{ id: string; incidentId: string; incidentVersion: number; rule: Readonly<{ identifier: string; ruleId: string | null; versionId: string; version: number }>; inputs: JsonObject; suggested: JsonObject; explanation: JsonObject; evaluatedAt: string; actionCorrelationId: string }>;
type TriageDecisionRead = Readonly<{ id: string; setId: string; evaluationId: string; field: "category" | "severity" | "assignee"; disposition: "confirmed" | "corrected" | "manual"; value: string; reason: string | null; actorUserId: string; decidedAt: string; actionCorrelationId: string }>;
type TriageDecisionSetRead = Readonly<{ id: string; evaluationId: string; sequence: number; complete: boolean; decidedAt: string; actionCorrelationId: string; items: readonly TriageDecisionRead[] }>;
type CurrentSlaRead = Readonly<{ cycleId: string; cycleSequence: number; condition: SlaCondition; warningAt: string; deadlineAt: string; policyVersionId: string; policyVersion: number; clockMode: "continuous-utc"; pausesWhenBlocked: boolean }>;
export type IncidentTriageRead = Readonly<{ incidentId: string; state: TriageState; version: number; evaluations: readonly TriageEvaluationRead[]; decisionSets: readonly TriageDecisionSetRead[]; sla: CurrentSlaRead | null }>;
type TriageEvaluationRow = Readonly<{ id: string; incident_id: string; incident_version: number; rule_version_id: string; rule_version: number; rule_id: string | null; rule_identifier: string; inputs: JsonObject; suggested: JsonObject; explanation: JsonObject; evaluated_at: Date; action_correlation_id: string }>;
type TriageDecisionRow = Readonly<{ set_id: string; evaluation_id: string; sequence: number; complete: boolean; set_decided_at: Date; set_action_correlation_id: string; item_id: string | null; field: TriageDecisionRead["field"] | null; disposition: TriageDecisionRead["disposition"] | null; value_text: string | null; value_user_id: string | null; reason: string | null; actor_user_id: string | null; item_decided_at: Date | null; item_action_correlation_id: string | null }>;
type CurrentSlaRow = Readonly<{ cycle_id: string; cycle_sequence: number; condition: SlaCondition; warning_at: Date; deadline_at: Date; policy_version_id: string; policy_version: number; clock_mode: "continuous-utc"; pauses_when_blocked: boolean }>;

export class InvalidIncidentQueryError extends Error {}

function scoped(eb: IncidentExpressionBuilder, scope: RoleScope): Expression<SqlBool> {
  const predicates: Expression<SqlBool>[] = [];
  if (scope.storeIds.length > 0) predicates.push(eb("incidents.store_id", "in", scope.storeIds));
  if (scope.sectorIds.length > 0) predicates.push(eb("incidents.sector_id", "in", scope.sectorIds));
  return predicates.length === 0 ? eb.val(false) : eb.and(predicates);
}

function visibleForScope(eb: IncidentExpressionBuilder, principalId: string, scope: RoleScope): Expression<SqlBool> {
  const scopePredicate = scoped(eb, scope);
  if (scope.role === "collaborator") return eb.or([eb("incidents.reporter_user_id", "=", principalId), scopePredicate]);
  if (scope.role === "sector-lead") return eb.or([eb("incidents.reporter_user_id", "=", principalId), scopePredicate]);
  if (scope.role === "inventory-team") {
    const categories = ["out-of-stock", "inventory-mismatch", "misplaced-product", "replenishment-blocked"];
    const responsibility = scope.categoryResponsibilities.length === 0 ? eb.val(true) : eb("incidents.category_key", "in", scope.categoryResponsibilities);
    return eb.and([scopePredicate, eb("incidents.category_key", "in", categories), responsibility]);
  }
  if (scope.role === "central-operations") {
    const responsibility = scope.categoryResponsibilities.length === 0 ? eb.val(false) : eb("incidents.category_key", "in", scope.categoryResponsibilities);
    const teamAssignment = scope.teamIds.length === 0 ? eb.val(false) : eb("incidents.assignee_team_id", "in", scope.teamIds);
    return eb.and([scopePredicate, eb.or([responsibility, eb("incidents.assignee_user_id", "=", principalId), teamAssignment])]);
  }
  return scopePredicate;
}

function visibility(eb: IncidentExpressionBuilder, principal: AuthorizedPrincipal): Expression<SqlBool> {
  const roles = principal.roleScopes.map((scope) => visibleForScope(eb, principal.id, scope));
  const sameActiveOrganization = eb.exists(eb.selectFrom("users").select("users.id").where("users.id", "=", principal.id).where("users.active", "=", true).whereRef("users.organization_id", "=", "incidents.organization_id"));
  return eb.and([sameActiveOrganization, roles.length === 0 ? eb.val(false) : eb.or(roles)]);
}

const columns = ["id", "organization_id", "store_id", "sector_id", "location_id", "product_id", "category_key", "severity_key", "category_provisional", "severity_provisional", "title", "description", "occurred_at", "reporter_user_id", "assignee_user_id", "assignee_team_id", "ownership_gap", "state", "reopen_count", "version", "created_at", "updated_at"] as const;
function read(row: IncidentTable): IncidentRead {
  return { id: row.id, organizationId: row.organization_id, storeId: row.store_id, sectorId: row.sector_id, locationId: row.location_id, ...(row.product_id ? { productId: row.product_id } : {}), category: row.category_key, severity: row.severity_key, categoryProvisional: row.category_provisional, severityProvisional: row.severity_provisional, title: row.title, description: row.description, occurredAt: row.occurred_at.toISOString(), reporterId: row.reporter_user_id, ...(row.assignee_user_id ? { assigneeId: row.assignee_user_id } : {}), ...(row.assignee_team_id ? { assigneeTeamId: row.assignee_team_id } : {}), ownershipGap: row.ownership_gap, state: row.state, reopenCount: row.reopen_count, version: row.version, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() };
}

function timestamp(value: string | undefined): Date | undefined {
  if (value === undefined) return undefined;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new InvalidIncidentQueryError("invalid timestamp filter");
  return parsed;
}

function hasCurrentSlaCondition(eb: IncidentExpressionBuilder, condition: SlaCondition): Expression<SqlBool> {
  const currentCycle = eb.selectFrom("incident_sla_cycles as cycle")
    .innerJoin("incident_sla_segments as segment", (join) => join.onRef("segment.cycle_id", "=", "cycle.id").on("segment.active", "=", true))
    .select("cycle.id").whereRef("cycle.incident_id", "=", "incidents.id").where("cycle.condition", "=", condition)
    .where((inner) => inner.not(inner.exists(inner.selectFrom("incident_sla_cycles as newer").select("newer.id").whereRef("newer.incident_id", "=", "cycle.incident_id").whereRef("newer.sequence", ">", "cycle.sequence"))));
  return eb.exists(currentCycle);
}

function hasRecurrenceDecisionState(eb: IncidentExpressionBuilder, state: RecurrenceDecisionState): Expression<SqlBool> {
  const suggestions = eb.selectFrom("current_recurrence_suggestion_states").select("suggestion_id")
    .whereRef("current_recurrence_suggestion_states.organization_id", "=", "incidents.organization_id")
    .whereRef("current_recurrence_suggestion_states.incident_id", "=", "incidents.id")
    .where("current_recurrence_suggestion_states.state", "=", state);
  return eb.exists(suggestions);
}

export class PostgresAuthorizedIncidentRepository {
  private readonly database: Kysely<Database>;
  constructor(private readonly pool: Pool, onQuery?: (query: IncidentQueryLog) => void) {
    this.database = new Kysely({ dialect: new PostgresDialect({ pool }), log: onQuery ? (event) => { if (event.level === "query") onQuery({ sql: event.query.sql, parameters: event.query.parameters }); } : undefined });
  }

  async detail(principal: AuthorizedPrincipal, incidentId: string): Promise<IncidentRead | undefined> {
    if (!principal.active) return undefined;
    const row = await this.database.selectFrom("incidents").select(columns).where("incidents.id", "=", incidentId).where((eb) => visibility(eb, principal)).executeTakeFirst();
    return row ? read(row) : undefined;
  }

  async triage(principal: AuthorizedPrincipal, incidentId: string): Promise<IncidentTriageRead | undefined> {
    if (!principal.active) return undefined;
    const incident = await this.database.selectFrom("incidents").select(["incidents.id", "incidents.organization_id", "incidents.state", "incidents.version"]).where("incidents.id", "=", incidentId).where((eb) => visibility(eb, principal)).executeTakeFirst();
    if (!incident || incident.state !== "open" && incident.state !== "classified") return undefined;
    const [evaluations, decisions, currentSla] = await Promise.all([
      this.pool.query<TriageEvaluationRow>("SELECT e.id,e.incident_id,e.incident_version,e.rule_version_id,v.version rule_version,e.rule_id,e.rule_identifier,e.inputs,e.suggested,e.explanation,e.evaluated_at,e.action_correlation_id FROM triage_evaluations e JOIN triage_rule_versions v ON v.id=e.rule_version_id AND v.organization_id=e.organization_id WHERE e.organization_id=$1 AND e.incident_id=$2 ORDER BY e.incident_version DESC,e.id DESC", [incident.organization_id, incident.id]),
      this.pool.query<TriageDecisionRow>("SELECT s.id set_id,s.evaluation_id,s.sequence,s.complete,s.decided_at set_decided_at,s.action_correlation_id set_action_correlation_id,i.id item_id,i.field,i.disposition,i.value_text,i.value_user_id,i.reason,i.actor_user_id,i.decided_at item_decided_at,i.action_correlation_id item_action_correlation_id FROM triage_decision_sets s JOIN triage_evaluations e ON e.id=s.evaluation_id AND e.organization_id=s.organization_id AND e.incident_id=s.incident_id LEFT JOIN triage_decision_items i ON i.decision_set_id=s.id AND i.organization_id=s.organization_id WHERE s.organization_id=$1 AND s.incident_id=$2 ORDER BY e.incident_version DESC,e.id DESC,s.sequence,s.id,i.id", [incident.organization_id, incident.id]),
      this.pool.query<CurrentSlaRow>("SELECT cycle.id cycle_id,cycle.sequence cycle_sequence,cycle.condition,segment.warning_at,segment.deadline_at,snapshot.policy_version_id,snapshot.policy_version,snapshot.clock_mode,snapshot.pauses_when_blocked FROM incident_sla_cycles cycle JOIN incident_sla_segments segment ON segment.cycle_id=cycle.id AND segment.incident_id=cycle.incident_id AND segment.active JOIN incident_sla_rule_snapshots snapshot ON snapshot.id=segment.snapshot_id AND snapshot.incident_id=cycle.incident_id WHERE cycle.incident_id=$1 AND NOT EXISTS (SELECT 1 FROM incident_sla_cycles newer WHERE newer.incident_id=cycle.incident_id AND newer.sequence>cycle.sequence)", [incident.id])
    ]);
    const sets = new Map<string, { id: string; evaluationId: string; sequence: number; complete: boolean; decidedAt: string; actionCorrelationId: string; items: TriageDecisionRead[] }>();
    for (const row of decisions.rows) {
      let set = sets.get(row.set_id);
      if (!set) { set = { id: row.set_id, evaluationId: row.evaluation_id, sequence: row.sequence, complete: row.complete, decidedAt: row.set_decided_at.toISOString(), actionCorrelationId: row.set_action_correlation_id, items: [] }; sets.set(row.set_id, set); }
      if (row.item_id !== null) set.items.push({ id: row.item_id, setId: row.set_id, evaluationId: row.evaluation_id, field: row.field!, disposition: row.disposition!, value: row.value_text ?? row.value_user_id!, reason: row.reason, actorUserId: row.actor_user_id!, decidedAt: row.item_decided_at!.toISOString(), actionCorrelationId: row.item_action_correlation_id! });
    }
    const sla = currentSla.rows[0];
    return {
      incidentId: incident.id, state: incident.state, version: incident.version,
      evaluations: evaluations.rows.map((row) => ({ id: row.id, incidentId: row.incident_id, incidentVersion: row.incident_version, rule: { identifier: row.rule_identifier, ruleId: row.rule_id, versionId: row.rule_version_id, version: row.rule_version }, inputs: row.inputs, suggested: row.suggested, explanation: row.explanation, evaluatedAt: row.evaluated_at.toISOString(), actionCorrelationId: row.action_correlation_id })),
      decisionSets: [...sets.values()],
      sla: sla ? { cycleId: sla.cycle_id, cycleSequence: sla.cycle_sequence, condition: sla.condition, warningAt: sla.warning_at.toISOString(), deadlineAt: sla.deadline_at.toISOString(), policyVersionId: sla.policy_version_id, policyVersion: sla.policy_version, clockMode: sla.clock_mode, pausesWhenBlocked: sla.pauses_when_blocked } : null
    };
  }

  async list(principal: AuthorizedPrincipal, input: IncidentListQuery = {}): Promise<IncidentList> {
    const limit = input.limit ?? 50;
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new InvalidIncidentQueryError("limit must be an integer from 1 to 200");
    if (!principal.active) return { items: [] };
    let query = this.database.selectFrom("incidents").select(columns).where((eb) => visibility(eb, principal));
    const filters = input.filters;
    const createdFrom = timestamp(filters?.createdFrom); const createdTo = timestamp(filters?.createdTo);
    const updatedFrom = timestamp(filters?.updatedFrom); const updatedTo = timestamp(filters?.updatedTo);
    if (createdFrom && createdTo && createdFrom > createdTo || updatedFrom && updatedTo && updatedFrom > updatedTo) throw new InvalidIncidentQueryError("invalid timestamp range");
    if (filters?.storeId) query = query.where("incidents.store_id", "=", filters.storeId);
    if (filters?.sectorId) query = query.where("incidents.sector_id", "=", filters.sectorId);
    if (filters?.locationId) query = query.where("incidents.location_id", "=", filters.locationId);
    if (filters?.category) query = query.where("incidents.category_key", "=", filters.category);
    if (filters?.severity) query = query.where("incidents.severity_key", "=", filters.severity);
    if (filters?.state) query = query.where("incidents.state", "=", filters.state);
    if (filters?.assigneeId) query = query.where("incidents.assignee_user_id", "=", filters.assigneeId);
    if (filters?.reporterId) query = query.where("incidents.reporter_user_id", "=", filters.reporterId);
    const slaCondition = filters?.slaCondition; const recurrenceDecisionState = filters?.recurrenceDecisionState;
    if (slaCondition) query = query.where((eb) => hasCurrentSlaCondition(eb, slaCondition));
    if (recurrenceDecisionState) query = query.where((eb) => hasRecurrenceDecisionState(eb, recurrenceDecisionState));
    if (createdFrom) query = query.where("incidents.created_at", ">=", createdFrom);
    if (createdTo) query = query.where("incidents.created_at", "<=", createdTo);
    if (updatedFrom) query = query.where("incidents.updated_at", ">=", updatedFrom);
    if (updatedTo) query = query.where("incidents.updated_at", "<=", updatedTo);
    if (input.cursor) {
      const updatedAt = new Date(input.cursor.updatedAt);
      if (!Number.isFinite(updatedAt.getTime()) || input.cursor.id.length === 0) throw new InvalidIncidentQueryError("invalid cursor");
      query = query.where((eb) => eb.or([eb("incidents.updated_at", "<", updatedAt), eb.and([eb("incidents.updated_at", "=", updatedAt), eb("incidents.id", ">", input.cursor!.id)])]));
    }
    const rows = await query.orderBy("incidents.updated_at", "desc").orderBy("incidents.id", "asc").limit(limit + 1).execute();
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(read);
    const last = items.at(-1);
    return { items, ...(hasMore && last ? { nextCursor: { updatedAt: last.updatedAt, id: last.id } } : {}) };
  }
}
