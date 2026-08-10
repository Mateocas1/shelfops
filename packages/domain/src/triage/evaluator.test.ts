import { describe, expect, it } from "vitest";

import { evaluateTriage } from "./evaluator.js";

const version = { id: "00000000-0000-4000-8000-000000000003", version: 7 };
const ids = {
  assigneeA: "00000000-0000-4000-8000-000000000011",
  assigneeB: "00000000-0000-4000-8000-000000000012",
  location: "00000000-0000-4000-8000-000000000021",
  product: "00000000-0000-4000-8000-000000000022",
  sector: "00000000-0000-4000-8000-000000000023",
  store: "00000000-0000-4000-8000-000000000024"
} as const;

const inputs = (eligibleAssigneeIds: readonly string[]) => ({
  storeId: ids.store,
  sectorId: ids.sector,
  locationId: ids.location,
  productId: ids.product,
  category: "inventory-mismatch",
  severity: "high",
  eligibleAssigneeIds
});

describe("triage evaluator", () => {
  it("selects the ordered matching rule and preserves normalized category and severity for one eligible assignee", () => {
    const result = evaluateTriage({
      effectiveRuleVersion: version,
      inputs: inputs([ids.assigneeA]),
      rules: [
        { id: "00000000-0000-4000-8000-000000000099", identifier: "fallback", priority: 20, predicates: {} },
        { id: "00000000-0000-4000-8000-000000000003", identifier: "same-priority-later-id", priority: 10, predicates: {} },
        { id: "00000000-0000-4000-8000-000000000002", identifier: "matching-rule", priority: 10, predicates: { storeId: ids.store, sectorId: ids.sector, locationId: ids.location, productId: ids.product, category: "inventory-mismatch", severity: "high" } }
      ]
    });

    expect(result).toEqual({
      rule: { identifier: "matching-rule", ruleId: "00000000-0000-4000-8000-000000000002", versionId: version.id, version: version.version },
      inputs: inputs([ids.assigneeA]),
      suggested: { category: "inventory-mismatch", severity: "high", assigneeUserId: ids.assigneeA, manualFields: [] },
      explanation: { code: "matched-single-eligible", facts: { eligibleAssigneeCount: 1 }, text: "Input category and severity preserved; exactly one eligible assignee suggested." }
    });
  });

  it("requires manual assignee selection when a matching rule has multiple authoritative eligible users", () => {
    const result = evaluateTriage({
      effectiveRuleVersion: version,
      inputs: inputs([ids.assigneeB, ids.assigneeA]),
      rules: [{ id: "00000000-0000-4000-8000-000000000004", identifier: "inventory-default", priority: 1, predicates: { category: "inventory-mismatch" } }]
    });

    expect(result).toEqual({
      rule: { identifier: "inventory-default", ruleId: "00000000-0000-4000-8000-000000000004", versionId: version.id, version: version.version },
      inputs: inputs([ids.assigneeA, ids.assigneeB]),
      suggested: { category: "inventory-mismatch", severity: "high", assigneeUserId: null, manualFields: ["assignee"] },
      explanation: { code: "manual-assignee-ambiguous", facts: { eligibleAssigneeCount: 2 }, text: "Input category and severity preserved; assignee requires human selection (2 eligible)." }
    });
  });

  it("does not invent an assignee when a matching rule has no eligible user", () => {
    const result = evaluateTriage({
      effectiveRuleVersion: version,
      inputs: inputs([]),
      rules: [{ id: "00000000-0000-4000-8000-000000000004", identifier: "inventory-default", priority: 1, predicates: { category: "inventory-mismatch" } }]
    });

    expect(result).toEqual({
      rule: { identifier: "inventory-default", ruleId: "00000000-0000-4000-8000-000000000004", versionId: version.id, version: version.version },
      inputs: inputs([]),
      suggested: { category: "inventory-mismatch", severity: "high", assigneeUserId: null, manualFields: ["assignee"] },
      explanation: { code: "manual-assignee-ambiguous", facts: { eligibleAssigneeCount: 0 }, text: "Input category and severity preserved; assignee requires human selection (0 eligible)." }
    });
  });

  it("records configured manual triage when no rule matches", () => {
    const result = evaluateTriage({
      effectiveRuleVersion: version,
      inputs: inputs([ids.assigneeB, ids.assigneeA]),
      rules: [{ id: "00000000-0000-4000-8000-000000000005", identifier: "other-store", priority: 1, predicates: { storeId: "00000000-0000-4000-8000-000000000099" } }]
    });

    expect(result).toEqual({
      rule: { identifier: "manual-no-match", ruleId: null, versionId: version.id, version: version.version },
      inputs: inputs([ids.assigneeA, ids.assigneeB]),
      suggested: { category: null, severity: null, assigneeUserId: null, manualFields: ["category", "severity", "assignee"] },
      explanation: { code: "manual-no-match", facts: { eligibleAssigneeCount: 2 }, text: "No triage rule matched; category, severity, and assignee require human selection." }
    });
  });
});
