import { evaluateRecurrenceSuggestions } from "@shelfops/domain/recurrence/evaluator";
import { describe, expect, it } from "vitest";

type Incident = { id: string; organizationId: string; storeId: string; category: string; locationId: string; productId?: string; createdAt: string };
const incident = (id: string, createdAt: string, overrides: Partial<Incident> = {}): Incident => ({ id, organizationId: "organization-a", storeId: "store-a", category: "out-of-stock", locationId: "location-a", productId: "product-a", createdAt, ...overrides });
const rule = { versionId: "rule-v1", windowDays: 30 };

describe("recurrence evaluator", () => {
  it("selects exact recent matches in stable order and caps the result", () => {
    const current = incident("current", "2026-08-31T10:00:00.000Z");
    const candidates = [
      incident("candidate-b", "2026-08-30T10:00:00.000Z", { locationId: "location-b" }), incident("candidate-a", "2026-08-30T10:00:00.000Z", { productId: "product-b" }),
      incident("candidate-c", "2026-08-29T10:00:00.000Z"), incident("candidate-d", "2026-08-28T10:00:00.000Z"), incident("candidate-e", "2026-08-27T10:00:00.000Z"), incident("candidate-f", "2026-08-26T10:00:00.000Z"),
      incident("old", "2026-08-01T09:59:59.999Z"), incident("future", "2026-08-31T10:00:00.001Z"), incident("broad", "2026-08-30T09:00:00.000Z", { locationId: "location-b", productId: "product-b" }), incident("other-store", "2026-08-30T09:00:00.000Z", { storeId: "store-b" }), current
    ];

    expect(evaluateRecurrenceSuggestions({ incident: current, candidates, rule })).toEqual([
      { candidateIncidentId: "candidate-a", recurrenceRuleVersionId: "rule-v1", occurrence: 1, matchingFacts: { locationId: "location-a" } },
      { candidateIncidentId: "candidate-b", recurrenceRuleVersionId: "rule-v1", occurrence: 1, matchingFacts: { productId: "product-a" } },
      { candidateIncidentId: "candidate-c", recurrenceRuleVersionId: "rule-v1", occurrence: 1, matchingFacts: { locationId: "location-a", productId: "product-a" } },
      { candidateIncidentId: "candidate-d", recurrenceRuleVersionId: "rule-v1", occurrence: 1, matchingFacts: { locationId: "location-a", productId: "product-a" } },
      { candidateIncidentId: "candidate-e", recurrenceRuleVersionId: "rule-v1", occurrence: 1, matchingFacts: { locationId: "location-a", productId: "product-a" } }
    ]);
    expect(evaluateRecurrenceSuggestions({ incident: current, candidates: [incident("edge", "2026-08-01T10:00:00.000Z"), incident("outside", "2026-08-01T09:59:59.999Z")], rule })).toHaveLength(1);
  });

  it("reuses a dismissed occurrence until explicit reevaluation creates its successor", () => {
    const current = incident("current", "2026-08-31T10:00:00.000Z"); const candidates = [incident("candidate", "2026-08-30T10:00:00.000Z")];
    const existingSuggestions = [{ candidateIncidentId: "candidate", occurrence: 2, state: "dismissed" as const }];

    expect(evaluateRecurrenceSuggestions({ incident: current, candidates, rule, existingSuggestions })).toMatchObject([{ occurrence: 2 }]);
    expect(evaluateRecurrenceSuggestions({ incident: current, candidates, rule, existingSuggestions, explicitReevaluation: true })).toMatchObject([{ occurrence: 3 }]);
    expect(evaluateRecurrenceSuggestions({ incident: current, candidates, rule, existingSuggestions: [{ ...existingSuggestions[0]!, state: "confirmed" as const }], explicitReevaluation: true })).toMatchObject([{ occurrence: 2 }]);
  });
});
