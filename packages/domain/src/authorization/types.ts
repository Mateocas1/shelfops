export const roles = ["collaborator", "sector-lead", "supervisor", "inventory-team", "central-operations"] as const;
export type Role = typeof roles[number];

export const actions = ["create", "view", "triage", "assign", "start", "block", "resume", "resolve", "reopen", "configure-store-policy", "configure-organization-catalog", "export-store-history", "add-evidence", "add-comment", "confirm-recurrence", "dismiss-recurrence"] as const;
export type Action = typeof actions[number];

export const inventoryCategories = ["out-of-stock", "inventory-mismatch", "misplaced-product", "replenishment-blocked"] as const;
export type InventoryCategory = typeof inventoryCategories[number];

export type RoleScope = Readonly<{
  role: Role;
  storeIds: readonly string[];
  sectorIds: readonly string[];
  categoryResponsibilities: readonly string[];
  teamIds: readonly string[];
}>;

export type ActionGrant = Readonly<{ action: Action; role?: Role }>;

export type AuthorizationRecord = Readonly<{
  id: string;
  storeId: string;
  sectorId: string;
  category: string;
  reporterId: string;
  assigneeId?: string;
  assigneeTeamId?: string;
}>;

export type DenialReason = "principal-inactive" | "scope-not-authorized" | "role-not-permitted" | "grant-required" | "assignee-required";
export type VisibilityDecision = Readonly<{ outcome: "visible" | "not-found" }>;
export type ActionDecision = Readonly<{ outcome: "allowed" } | { outcome: "forbidden"; reason: DenialReason }>;
export type AssignmentEligibilityDecision = Readonly<{ outcome: "eligible" } | { outcome: "ineligible"; reason: "principal-inactive" | "scope-not-authorized" }>;

export function scopeMatches(scope: RoleScope, record: AuthorizationRecord): boolean {
  const hasStoreScope = scope.storeIds.length > 0;
  const hasSectorScope = scope.sectorIds.length > 0;

  return (hasStoreScope || hasSectorScope)
    && (!hasStoreScope || scope.storeIds.includes(record.storeId))
    && (!hasSectorScope || scope.sectorIds.includes(record.sectorId));
}

export function hasCategoryResponsibility(scope: RoleScope, record: AuthorizationRecord): boolean {
  return scope.categoryResponsibilities.includes(record.category);
}

export function hasInventoryResponsibility(scope: RoleScope, record: AuthorizationRecord): boolean {
  return inventoryCategories.includes(record.category as InventoryCategory)
    && (scope.categoryResponsibilities.length === 0 || hasCategoryResponsibility(scope, record));
}
