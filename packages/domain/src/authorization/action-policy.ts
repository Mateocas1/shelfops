import { hasCategoryResponsibility, hasInventoryResponsibility, scopeMatches } from "./types.js";
import type { Action, ActionDecision, ActionGrant, AuthorizationRecord, RoleScope } from "./types.js";

const assignedActions: readonly Action[] = ["start", "block", "resume", "resolve"];
const grantedCentralScopeActions: readonly Action[] = ["configure-store-policy", "configure-organization-catalog", "export-store-history"];

function hasGrant(grants: readonly ActionGrant[], action: Action, role: RoleScope["role"]): boolean {
  return grants.some((grant) => grant.action === action && (grant.role === undefined || grant.role === role));
}

function isAssigned(principalId: string, record: AuthorizationRecord): boolean {
  return record.assigneeId === principalId;
}

function centralScopeAllows(principalId: string, scope: RoleScope, record: AuthorizationRecord): boolean {
  return hasCategoryResponsibility(scope, record) || isAssigned(principalId, record) || (record.assigneeTeamId !== undefined && scope.teamIds.includes(record.assigneeTeamId));
}

export function actionDecision(principalId: string, active: boolean, roleScopes: readonly RoleScope[], grants: readonly ActionGrant[], record: AuthorizationRecord, action: Action): ActionDecision {
  if (!active) return { outcome: "forbidden", reason: "principal-inactive" };

  const matchingScopes = roleScopes.filter((scope) => scopeMatches(scope, record));
  if (matchingScopes.length === 0) return { outcome: "forbidden", reason: "scope-not-authorized" };

  let requiresGrant = false;
  let requiresAssignee = false;

  for (const scope of matchingScopes) {
    if (scope.role === "collaborator") {
      if (["create", "view", "add-evidence", "add-comment"].includes(action)) return { outcome: "allowed" };
      if (["confirm-recurrence", "dismiss-recurrence"].includes(action) && record.reporterId === principalId) return { outcome: "allowed" };
      if (assignedActions.includes(action)) {
        if (isAssigned(principalId, record)) return { outcome: "allowed" };
        requiresAssignee = true;
      }
      continue;
    }

    if (scope.role === "sector-lead") {
      if (["create", "view", "triage", "assign", "add-evidence", "add-comment"].includes(action)) return { outcome: "allowed" };
      if (assignedActions.includes(action)) {
        if (isAssigned(principalId, record)) return { outcome: "allowed" };
        requiresAssignee = true;
      }
      continue;
    }

    if (scope.role === "supervisor") {
      if (["create", "view", "triage", "assign", "add-evidence", "add-comment", "reopen", "configure-store-policy", "export-store-history"].includes(action)) return { outcome: "allowed" };
      if (["block", "resume"].includes(action) || (assignedActions.includes(action) && isAssigned(principalId, record))) return { outcome: "allowed" };
      if (action === "configure-organization-catalog" && hasGrant(grants, action, scope.role)) return { outcome: "allowed" };
      if (assignedActions.includes(action)) requiresAssignee = true;
      if (action === "configure-organization-catalog") requiresGrant = true;
      continue;
    }

    if (scope.role === "inventory-team") {
      if (!hasInventoryResponsibility(scope, record)) continue;
      if (["create", "view", "add-evidence", "add-comment"].includes(action)) return { outcome: "allowed" };
      if (["triage", "assign"].includes(action)) {
        if (hasGrant(grants, action, scope.role)) return { outcome: "allowed" };
        requiresGrant = true;
      }
      if (assignedActions.includes(action)) {
        if (isAssigned(principalId, record)) return { outcome: "allowed" };
        requiresAssignee = true;
      }
      continue;
    }

    if (scope.role === "central-operations") {
      if (grantedCentralScopeActions.includes(action)) {
        if (hasGrant(grants, action, scope.role)) return { outcome: "allowed" };
        requiresGrant = true;
        continue;
      }
      if (!centralScopeAllows(principalId, scope, record)) continue;
      if (["create", "view", "add-evidence", "add-comment"].includes(action)) return { outcome: "allowed" };
      if (["triage", "assign"].includes(action)) {
        if (hasGrant(grants, action, scope.role) && hasCategoryResponsibility(scope, record)) return { outcome: "allowed" };
        requiresGrant = true;
      }
      if (assignedActions.includes(action)) {
        if (isAssigned(principalId, record)) return { outcome: "allowed" };
        requiresAssignee = true;
      }
    }
  }

  if (requiresAssignee) return { outcome: "forbidden", reason: "assignee-required" };
  if (requiresGrant) return { outcome: "forbidden", reason: "grant-required" };
  return { outcome: "forbidden", reason: "role-not-permitted" };
}
