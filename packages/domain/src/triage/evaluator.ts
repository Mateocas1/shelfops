export type TriageField = "category" | "severity" | "assignee";
export type TriageRulePredicates = Readonly<{
  storeId?: string | null;
  sectorId?: string | null;
  locationId?: string | null;
  productId?: string | null;
  category?: string | null;
  severity?: string | null;
}>;
export type TriageRule = Readonly<{ id: string; identifier: string; priority: number; predicates: TriageRulePredicates }>;
export type EffectiveTriageRuleVersion = Readonly<{ id: string; version: number }>;
export type TriageEvaluationInputs = Readonly<{
  storeId: string;
  sectorId: string;
  locationId: string;
  productId: string | null;
  category: string;
  severity: string;
  eligibleAssigneeIds: readonly string[];
}>;
export type TriageEvaluationInput = Readonly<{ effectiveRuleVersion: EffectiveTriageRuleVersion; inputs: TriageEvaluationInputs; rules: readonly TriageRule[] }>;
export type TriageEvaluationResult = Readonly<{
  rule: Readonly<{ identifier: string; ruleId: string | null; versionId: string; version: number }>;
  inputs: TriageEvaluationInputs;
  suggested: Readonly<{ category: string | null; severity: string | null; assigneeUserId: string | null; manualFields: readonly TriageField[] }>;
  explanation: Readonly<{ code: "matched-single-eligible" | "manual-assignee-ambiguous" | "manual-no-match"; facts: Readonly<{ eligibleAssigneeCount: number }>; text: string }>;
}>;

const predicateFields = ["storeId", "sectorId", "locationId", "productId", "category", "severity"] as const;
const singleEligibleText = "Input category and severity preserved; exactly one eligible assignee suggested.";
const noMatchText = "No triage rule matched; category, severity, and assignee require human selection.";

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function matches(rule: TriageRule, inputs: TriageEvaluationInputs): boolean {
  return predicateFields.every((field) => {
    const predicate = rule.predicates[field];
    return predicate === undefined || predicate === null || predicate === inputs[field];
  });
}

function ruleIdentity(rule: TriageRule | undefined, version: EffectiveTriageRuleVersion): TriageEvaluationResult["rule"] {
  return rule === undefined
    ? { identifier: "manual-no-match", ruleId: null, versionId: version.id, version: version.version }
    : { identifier: rule.identifier, ruleId: rule.id, versionId: version.id, version: version.version };
}

export function evaluateTriage(input: TriageEvaluationInput): TriageEvaluationResult {
  const eligibleAssigneeIds = [...input.inputs.eligibleAssigneeIds].sort(compare);
  const inputs = { ...input.inputs, eligibleAssigneeIds };
  const rule = [...input.rules].sort((left, right) => left.priority - right.priority || compare(left.id, right.id)).find((candidate) => matches(candidate, inputs));
  const facts = { eligibleAssigneeCount: eligibleAssigneeIds.length };

  if (rule === undefined) return {
    rule: ruleIdentity(rule, input.effectiveRuleVersion),
    inputs,
    suggested: { category: null, severity: null, assigneeUserId: null, manualFields: ["category", "severity", "assignee"] },
    explanation: { code: "manual-no-match", facts, text: noMatchText }
  };

  const matchedRule = ruleIdentity(rule, input.effectiveRuleVersion);
  if (eligibleAssigneeIds.length === 1) return {
    rule: matchedRule,
    inputs,
    suggested: { category: inputs.category, severity: inputs.severity, assigneeUserId: eligibleAssigneeIds[0]!, manualFields: [] },
    explanation: { code: "matched-single-eligible", facts, text: singleEligibleText }
  };

  return {
    rule: matchedRule,
    inputs,
    suggested: { category: inputs.category, severity: inputs.severity, assigneeUserId: null, manualFields: ["assignee"] },
    explanation: { code: "manual-assignee-ambiguous", facts, text: `Input category and severity preserved; assignee requires human selection (${eligibleAssigneeIds.length} eligible).` }
  };
}
