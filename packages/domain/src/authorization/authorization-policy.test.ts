import { describe, expect, it } from "vitest";

import type { AuthorizedPrincipal } from "../../../application/src/authorization/authorized-principal.js";
import { actionDecision } from "./action-policy.js";
import { assignmentEligibility } from "./assignment-eligibility.js";
import type { AuthorizationRecord, RoleScope } from "./types.js";
import { visibilityDecision } from "./visibility-policy.js";

const incident = (overrides: Partial<AuthorizationRecord> = {}): AuthorizationRecord => ({
  id: "incident-a",
  storeId: "store-a",
  sectorId: "sector-a",
  category: "out-of-stock",
  reporterId: "reporter-a",
  assigneeId: "assignee-a",
  ...overrides
});

const roleScope = (role: RoleScope["role"], overrides: Partial<RoleScope> = {}): RoleScope => ({
  role,
  storeIds: [],
  sectorIds: [],
  categoryResponsibilities: [],
  teamIds: [],
  ...overrides
});

const principal = (overrides: Partial<AuthorizedPrincipal> = {}): AuthorizedPrincipal => ({
  id: "actor-a",
  active: true,
  roleScopes: [],
  grants: [],
  ...overrides
});

describe("authorization policies", () => {
  it("allows a collaborator to view owned or sector incidents but denies assignment", () => {
    const collaborator = principal({
      roleScopes: [roleScope("collaborator", { storeIds: ["store-a"], sectorIds: ["sector-a"] })]
    });

    expect(visibilityDecision(collaborator.id, collaborator.active, collaborator.roleScopes, incident())).toEqual({ outcome: "visible" });
    expect(visibilityDecision(collaborator.id, collaborator.active, collaborator.roleScopes, incident({ sectorId: "sector-b", reporterId: collaborator.id }))).toEqual({ outcome: "visible" });
    expect(actionDecision(collaborator.id, collaborator.active, collaborator.roleScopes, collaborator.grants, incident(), "assign")).toEqual({ outcome: "forbidden", reason: "role-not-permitted" });
  });

  it("allows a lead to triage only an assigned sector", () => {
    const lead = principal({ roleScopes: [roleScope("sector-lead", { sectorIds: ["sector-a"] })] });

    expect(actionDecision(lead.id, lead.active, lead.roleScopes, lead.grants, incident(), "triage")).toEqual({ outcome: "allowed" });
    expect(actionDecision(lead.id, lead.active, lead.roleScopes, lead.grants, incident({ sectorId: "sector-b" }), "triage")).toEqual({ outcome: "forbidden", reason: "scope-not-authorized" });
  });

  it("lets a lead view an out-of-scope report they created without widening action authority", () => {
    const lead = principal({ roleScopes: [roleScope("sector-lead", { sectorIds: ["sector-a"] })] });
    const ownReport = incident({ sectorId: "sector-b", reporterId: lead.id });

    expect(visibilityDecision(lead.id, lead.active, lead.roleScopes, ownReport)).toEqual({ outcome: "visible" });
    expect(visibilityDecision(lead.id, lead.active, lead.roleScopes, incident({ sectorId: "sector-b", reporterId: "another-reporter" }))).toEqual({ outcome: "not-found" });
    expect(visibilityDecision(lead.id, false, lead.roleScopes, ownReport)).toEqual({ outcome: "not-found" });
    for (const action of ["view", "triage", "assign", "start", "block", "resume", "resolve", "reopen"] as const) {
      expect(actionDecision(lead.id, lead.active, lead.roleScopes, lead.grants, ownReport, action)).toEqual({ outcome: "forbidden", reason: "scope-not-authorized" });
    }
  });

  it("requires an assigned supervisor to resolve and an in-store supervisor to reopen", () => {
    const supervisor = principal({ roleScopes: [roleScope("supervisor", { storeIds: ["store-a"] })] });

    expect(actionDecision(supervisor.id, supervisor.active, supervisor.roleScopes, supervisor.grants, incident({ assigneeId: supervisor.id }), "resolve")).toEqual({ outcome: "allowed" });
    expect(actionDecision(supervisor.id, supervisor.active, supervisor.roleScopes, supervisor.grants, incident(), "resolve")).toEqual({ outcome: "forbidden", reason: "assignee-required" });
    expect(actionDecision(supervisor.id, supervisor.active, supervisor.roleScopes, supervisor.grants, incident(), "reopen")).toEqual({ outcome: "allowed" });
    expect(actionDecision(supervisor.id, supervisor.active, supervisor.roleScopes, supervisor.grants, incident({ storeId: "store-b" }), "reopen")).toEqual({ outcome: "forbidden", reason: "scope-not-authorized" });
  });

  it("requires and honors the separately recorded supervisor catalog grant without widening store scope", () => {
    const supervisor = principal({
      roleScopes: [roleScope("supervisor", { storeIds: ["store-a"] })],
      grants: [{ action: "configure-organization-catalog", role: "supervisor" }]
    });

    expect(actionDecision(supervisor.id, supervisor.active, supervisor.roleScopes, supervisor.grants, incident(), "configure-organization-catalog")).toEqual({ outcome: "allowed" });
    expect(actionDecision(supervisor.id, supervisor.active, supervisor.roleScopes, supervisor.grants, incident({ storeId: "store-b" }), "configure-organization-catalog")).toEqual({ outcome: "forbidden", reason: "scope-not-authorized" });
  });

  it("bounds inventory visibility and triage to inventory categories, scope, and a grant", () => {
    const inventory = principal({
      roleScopes: [roleScope("inventory-team", { storeIds: ["store-a"], sectorIds: ["sector-a"] })],
      grants: [{ action: "triage", role: "inventory-team" }]
    });

    expect(visibilityDecision(inventory.id, inventory.active, inventory.roleScopes, incident({ category: "inventory-mismatch" }))).toEqual({ outcome: "visible" });
    expect(visibilityDecision(inventory.id, inventory.active, inventory.roleScopes, incident({ category: "equipment-failure" }))).toEqual({ outcome: "not-found" });
    expect(actionDecision(inventory.id, inventory.active, inventory.roleScopes, inventory.grants, incident({ category: "inventory-mismatch" }), "triage")).toEqual({ outcome: "allowed" });
  });

  it("does not let an explicit central grant expand the authorized store scope", () => {
    const central = principal({
      roleScopes: [roleScope("central-operations", { storeIds: ["store-a"], categoryResponsibilities: ["equipment-failure"] })],
      grants: [{ action: "assign", role: "central-operations" }]
    });

    expect(actionDecision(central.id, central.active, central.roleScopes, central.grants, incident({ category: "equipment-failure" }), "assign")).toEqual({ outcome: "allowed" });
    expect(actionDecision(central.id, central.active, central.roleScopes, central.grants, incident({ category: "equipment-failure" }), "create")).toEqual({ outcome: "allowed" });
    expect(actionDecision(central.id, central.active, central.roleScopes, central.grants, incident({ storeId: "store-b", category: "equipment-failure" }), "create")).toEqual({ outcome: "forbidden", reason: "scope-not-authorized" });
    expect(actionDecision(central.id, central.active, central.roleScopes, central.grants, incident({ storeId: "store-b", category: "equipment-failure" }), "assign")).toEqual({ outcome: "forbidden", reason: "scope-not-authorized" });
  });

  it("allows a central user to work an assigned incident without treating assignment as a broader category grant", () => {
    const central = principal({
      roleScopes: [roleScope("central-operations", { storeIds: ["store-a"] })]
    });
    const assignedEquipmentIncident = incident({ category: "equipment-failure", assigneeId: central.id });

    expect(visibilityDecision(central.id, central.active, central.roleScopes, assignedEquipmentIncident)).toEqual({ outcome: "visible" });
    expect(actionDecision(central.id, central.active, central.roleScopes, central.grants, assignedEquipmentIncident, "resolve")).toEqual({ outcome: "allowed" });
    expect(actionDecision(central.id, central.active, central.roleScopes, central.grants, assignedEquipmentIncident, "triage")).toEqual({ outcome: "forbidden", reason: "grant-required" });
  });

  it("allows a central store-policy grant within its recorded store without treating the grant as category scope", () => {
    const central = principal({
      roleScopes: [roleScope("central-operations", { storeIds: ["store-a"] })],
      grants: [{ action: "configure-store-policy", role: "central-operations" }]
    });

    expect(actionDecision(central.id, central.active, central.roleScopes, central.grants, incident({ category: "equipment-failure" }), "configure-store-policy")).toEqual({ outcome: "allowed" });
    expect(actionDecision(central.id, central.active, central.roleScopes, central.grants, incident({ storeId: "store-b", category: "equipment-failure" }), "configure-store-policy")).toEqual({ outcome: "forbidden", reason: "scope-not-authorized" });
  });

  it("keeps combined supervisor and central roles bounded to the scope of the permitting role", () => {
    const combined = principal({
      roleScopes: [
        roleScope("supervisor", { storeIds: ["store-a"] }),
        roleScope("central-operations", { storeIds: ["store-b"], categoryResponsibilities: ["equipment-failure"] })
      ],
      grants: [{ action: "assign", role: "central-operations" }]
    });

    expect(actionDecision(combined.id, combined.active, combined.roleScopes, combined.grants, incident({ storeId: "store-b", category: "equipment-failure" }), "assign")).toEqual({ outcome: "allowed" });
    expect(actionDecision(combined.id, combined.active, combined.roleScopes, combined.grants, incident({ storeId: "store-b", category: "equipment-failure" }), "reopen")).toEqual({ outcome: "forbidden", reason: "role-not-permitted" });
  });

  it("returns deterministic denied decisions without changing the incident input", () => {
    const collaborator = principal({ roleScopes: [roleScope("collaborator", { storeIds: ["store-a"], sectorIds: ["sector-a"] })] });
    const target = incident({ assigneeId: "another-user" });
    const before = structuredClone(target);

    const first = actionDecision(collaborator.id, collaborator.active, collaborator.roleScopes, collaborator.grants, target, "resolve");
    const second = actionDecision(collaborator.id, collaborator.active, collaborator.roleScopes, collaborator.grants, target, "resolve");

    expect(first).toEqual({ outcome: "forbidden", reason: "assignee-required" });
    expect(second).toEqual(first);
    expect(target).toEqual(before);
  });

  it("rejects an inactive or out-of-scope assignee even when another role permits actions", () => {
    const outOfScopeSupervisor = principal({
      roleScopes: [roleScope("supervisor", { storeIds: ["store-b"] })],
      grants: [{ action: "assign", role: "supervisor" }]
    });
    const inactiveCollaborator = principal({
      active: false,
      roleScopes: [roleScope("collaborator", { storeIds: ["store-a"], sectorIds: ["sector-a"] })]
    });

    expect(assignmentEligibility(outOfScopeSupervisor.id, outOfScopeSupervisor.active, outOfScopeSupervisor.roleScopes, incident())).toEqual({ outcome: "ineligible", reason: "scope-not-authorized" });
    expect(assignmentEligibility(inactiveCollaborator.id, inactiveCollaborator.active, inactiveCollaborator.roleScopes, incident())).toEqual({ outcome: "ineligible", reason: "principal-inactive" });
  });
});
