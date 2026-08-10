import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";

export type SlaPolicyRuleInput = Readonly<{ category: string; severity: string; warningAfterSeconds: number; deadlineAfterSeconds: number }>;
export type SlaPolicyConfigurationInput = Readonly<{ expectedVersion: number; effectiveAt: string; idempotencyKey: string; rules: readonly SlaPolicyRuleInput[] }>;
export type SlaPolicyCatalog = Readonly<{ categories: readonly string[]; severities: readonly string[] }>;
export type PreparedSlaPolicyConfiguration = SlaPolicyConfigurationInput & Readonly<{ actorId: string }>;
export type SlaPolicyConfigurationOutcome = Readonly<{ policyVersionId: string; version: number; effectiveAt: string }>;
export interface SlaPolicyConfigurationExecutor { execute(principal: AuthorizedPrincipal, input: SlaPolicyConfigurationInput): Promise<SlaPolicyConfigurationOutcome>; }
export class SlaPolicyValidationError extends Error { constructor() { super("invalid-sla-policy"); } }
export class SlaPolicyForbiddenError extends Error { constructor() { super("forbidden"); } }

export function prepareSlaPolicyConfiguration(principal: AuthorizedPrincipal, input: SlaPolicyConfigurationInput, catalog: SlaPolicyCatalog): PreparedSlaPolicyConfiguration {
  const authorized = principal.active && principal.roleScopes.some((scope) => scope.role === "central-operations" && (scope.storeIds.length > 0 || scope.sectorIds.length > 0)) && principal.grants.some((grant) => grant.action === "configure-store-policy" && (grant.role === undefined || grant.role === "central-operations"));
  if (!authorized) throw new SlaPolicyForbiddenError();
  const effective = new Date(input.effectiveAt); const expected = new Set(catalog.categories.flatMap((category) => catalog.severities.map((severity) => `${category}/${severity}`)));
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1 || !Number.isFinite(effective.getTime()) || typeof input.idempotencyKey !== "string" || input.idempotencyKey.trim() === "" || expected.size === 0) throw new SlaPolicyValidationError();
  const seen = new Set<string>(); const rules = input.rules.map((rule) => {
    const key = `${rule.category}/${rule.severity}`;
    if (typeof rule.category !== "string" || rule.category.trim() === "" || typeof rule.severity !== "string" || rule.severity.trim() === "" || !Number.isInteger(rule.warningAfterSeconds) || !Number.isInteger(rule.deadlineAfterSeconds) || rule.warningAfterSeconds <= 0 || rule.deadlineAfterSeconds <= rule.warningAfterSeconds || !expected.has(key) || seen.has(key)) throw new SlaPolicyValidationError();
    seen.add(key); return { category: rule.category.trim(), severity: rule.severity.trim(), warningAfterSeconds: rule.warningAfterSeconds, deadlineAfterSeconds: rule.deadlineAfterSeconds };
  }).sort((left, right) => `${left.category}/${left.severity}`.localeCompare(`${right.category}/${right.severity}`));
  if (seen.size !== expected.size) throw new SlaPolicyValidationError();
  return { actorId: principal.id, expectedVersion: input.expectedVersion, effectiveAt: effective.toISOString(), idempotencyKey: input.idempotencyKey.trim(), rules };
}

export function assertFutureSlaPolicyEffectiveAt(effectiveAt: string, now: Date): void {
  if (new Date(effectiveAt).getTime() <= now.getTime()) throw new SlaPolicyValidationError();
}
