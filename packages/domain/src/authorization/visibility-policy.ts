import { hasCategoryResponsibility, hasInventoryResponsibility, scopeMatches } from "./types.js";
import type { AuthorizationRecord, RoleScope, VisibilityDecision } from "./types.js";

function centralCanSee(principalId: string, scope: RoleScope, record: AuthorizationRecord): boolean {
  return hasCategoryResponsibility(scope, record)
    || record.assigneeId === principalId
    || (record.assigneeTeamId !== undefined && scope.teamIds.includes(record.assigneeTeamId));
}

export function visibilityDecision(principalId: string, active: boolean, roleScopes: readonly RoleScope[], record: AuthorizationRecord): VisibilityDecision {
  if (!active) return { outcome: "not-found" };

  const visible = roleScopes.some((scope) => {
    if (scope.role === "collaborator") return record.reporterId === principalId || scopeMatches(scope, record);
    if (scope.role === "sector-lead" && record.reporterId === principalId) return true;
    if (!scopeMatches(scope, record)) return false;
    if (scope.role === "inventory-team") return hasInventoryResponsibility(scope, record);
    if (scope.role === "central-operations") return centralCanSee(principalId, scope, record);
    return true;
  });

  return { outcome: visible ? "visible" : "not-found" };
}
