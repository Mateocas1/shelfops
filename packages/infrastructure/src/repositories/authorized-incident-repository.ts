import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { Kysely, PostgresDialect, type Expression, type ExpressionBuilder, type SqlBool } from "kysely";
import type { Pool } from "pg";

type IncidentState = "open" | "classified" | "in-progress" | "blocked" | "resolved";
type SlaCondition = "on-track" | "warning" | "breached" | "paused";
type RecurrenceDecisionState = "pending" | "confirmed" | "dismissed";
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
    .innerJoin("incident_sla_segments as segment", (join) => join.onRef("segment.cycle_id", "=", "cycle.id").onRef("segment.snapshot_id", "=", "cycle.snapshot_id").on("segment.active", "=", true))
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
  constructor(pool: Pool, onQuery?: (query: IncidentQueryLog) => void) {
    this.database = new Kysely({ dialect: new PostgresDialect({ pool }), log: onQuery ? (event) => { if (event.level === "query") onQuery({ sql: event.query.sql, parameters: event.query.parameters }); } : undefined });
  }

  async detail(principal: AuthorizedPrincipal, incidentId: string): Promise<IncidentRead | undefined> {
    if (!principal.active) return undefined;
    const row = await this.database.selectFrom("incidents").select(columns).where("incidents.id", "=", incidentId).where((eb) => visibility(eb, principal)).executeTakeFirst();
    return row ? read(row) : undefined;
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
