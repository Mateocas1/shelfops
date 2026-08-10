import { describe, expect, it } from "vitest";
import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";
import { prepareSlaPolicyConfiguration, SlaPolicyForbiddenError, SlaPolicyValidationError, type SlaPolicyConfigurationInput } from "./configure-policy.js";

const principal: AuthorizedPrincipal = { id: "central-user", active: true, roleScopes: [{ role: "central-operations", storeIds: ["store-a"], sectorIds: [], categoryResponsibilities: [], teamIds: [] }], grants: [{ action: "configure-store-policy", role: "central-operations" }] };
const catalog = { categories: ["equipment-failure", "other"], severities: ["low", "high"] };
const input = (overrides: Partial<SlaPolicyConfigurationInput> = {}): SlaPolicyConfigurationInput => ({ expectedVersion: 1, effectiveAt: "2026-08-10T10:00:00.000Z", idempotencyKey: "sla-policy-1", rules: [
  { category: "equipment-failure", severity: "low", warningAfterSeconds: 60, deadlineAfterSeconds: 120 },
  { category: "equipment-failure", severity: "high", warningAfterSeconds: 30, deadlineAfterSeconds: 90 },
  { category: "other", severity: "low", warningAfterSeconds: 60, deadlineAfterSeconds: 120 },
  { category: "other", severity: "high", warningAfterSeconds: 30, deadlineAfterSeconds: 90 }
], ...overrides });

describe("SLA policy configuration", () => {
  it("prepares an attributable complete positive matrix for the explicit central authority", () => {
    expect(prepareSlaPolicyConfiguration(principal, input(), catalog)).toEqual({ actorId: principal.id, ...input(), rules: [...input().rules].sort((left, right) => `${left.category}/${left.severity}`.localeCompare(`${right.category}/${right.severity}`)) });
  });

  it("rejects unauthorized, malformed, incomplete, nonpositive, and duplicate matrices before persistence", () => {
    expect(() => prepareSlaPolicyConfiguration({ ...principal, roleScopes: [{ ...principal.roleScopes[0]!, role: "supervisor" }], grants: [] }, input(), catalog)).toThrow(SlaPolicyForbiddenError);
    for (const candidate of [input({ effectiveAt: "invalid" }), input({ expectedVersion: 0 }), input({ idempotencyKey: " " }), input({ rules: input().rules.slice(1) }), input({ rules: [{ ...input().rules[0]!, warningAfterSeconds: 0 }, ...input().rules.slice(1) ] }), input({ rules: [...input().rules, input().rules[0]!] })]) {
      expect(() => prepareSlaPolicyConfiguration(principal, candidate, catalog)).toThrow(SlaPolicyValidationError);
    }
  });
});
