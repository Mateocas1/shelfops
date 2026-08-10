import { hasCategoryResponsibility, hasInventoryResponsibility, scopeMatches } from "./types.js";
import type { AssignmentEligibilityDecision, AuthorizationRecord, RoleScope } from "./types.js";

export function assignmentEligibility(principalId: string, active: boolean, roleScopes: readonly RoleScope[], record: AuthorizationRecord): AssignmentEligibilityDecision {
  if (!active) return { outcome: "ineligible", reason: "principal-inactive" };

  const eligible = roleScopes.some((scope) => {
    if (!scopeMatches(scope, record)) return false;
    if (scope.role === "inventory-team") return hasInventoryResponsibility(scope, record);
    if (scope.role === "central-operations") return hasCategoryResponsibility(scope, record) || (record.assigneeTeamId !== undefined && scope.teamIds.includes(record.assigneeTeamId));
    return principalId.length > 0;
  });

  return eligible ? { outcome: "eligible" } : { outcome: "ineligible", reason: "scope-not-authorized" };
}
