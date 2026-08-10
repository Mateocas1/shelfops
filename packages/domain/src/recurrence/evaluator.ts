export const recurrenceSuggestionLimit = 5;
export type RecurrenceSuggestionState = "pending" | "confirmed" | "dismissed";
export type RecurrenceIncident = Readonly<{ id: string; organizationId: string; storeId: string; category: string; locationId: string; productId?: string | null; createdAt: string }>;
export type RecurrenceRule = Readonly<{ versionId: string; windowDays: number }>;
export type ExistingRecurrenceSuggestion = Readonly<{ candidateIncidentId: string; occurrence: number; state: RecurrenceSuggestionState }>;
export type RecurrenceSuggestionProposal = Readonly<{ candidateIncidentId: string; recurrenceRuleVersionId: string; occurrence: number; matchingFacts: Readonly<{ locationId?: string; productId?: string }> }>;
export type RecurrenceEvaluationInput = Readonly<{ incident: RecurrenceIncident; candidates: readonly RecurrenceIncident[]; rule: RecurrenceRule; existingSuggestions?: readonly ExistingRecurrenceSuggestion[]; explicitReevaluation?: boolean }>;

function time(value: string): number {
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) throw new Error("invalid recurrence timestamp");
  return parsed;
}

function matchingFacts(incident: RecurrenceIncident, candidate: RecurrenceIncident): RecurrenceSuggestionProposal["matchingFacts"] | undefined {
  const locationId = incident.locationId === candidate.locationId ? incident.locationId : undefined;
  const productId = incident.productId !== undefined && incident.productId !== null && incident.productId === candidate.productId ? incident.productId : undefined;
  return locationId === undefined && productId === undefined ? undefined : { ...(locationId === undefined ? {} : { locationId }), ...(productId === undefined ? {} : { productId }) };
}

function occurrenceFor(candidateIncidentId: string, existingSuggestions: readonly ExistingRecurrenceSuggestion[], explicitReevaluation: boolean): number {
  const latest = existingSuggestions.filter((suggestion) => suggestion.candidateIncidentId === candidateIncidentId).sort((left, right) => right.occurrence - left.occurrence)[0];
  if (latest === undefined || !explicitReevaluation || latest.state !== "dismissed") return latest?.occurrence ?? 1;
  return latest.occurrence + 1;
}

export function evaluateRecurrenceSuggestions(input: RecurrenceEvaluationInput): readonly RecurrenceSuggestionProposal[] {
  if (!Number.isInteger(input.rule.windowDays) || input.rule.windowDays < 1 || input.rule.windowDays > 90) throw new Error("recurrence window must be between 1 and 90 days");
  const incidentTime = time(input.incident.createdAt); const earliestTime = incidentTime - input.rule.windowDays * 86_400_000;
  return input.candidates.map((candidate) => ({ candidate, candidateTime: time(candidate.createdAt), matchingFacts: matchingFacts(input.incident, candidate) }))
    .filter(({ candidate, candidateTime, matchingFacts }) => candidate.id !== input.incident.id && candidate.organizationId === input.incident.organizationId && candidate.storeId === input.incident.storeId && candidate.category === input.incident.category && candidateTime >= earliestTime && candidateTime < incidentTime && matchingFacts !== undefined)
    .sort((left, right) => right.candidateTime - left.candidateTime || (left.candidate.id < right.candidate.id ? -1 : left.candidate.id > right.candidate.id ? 1 : 0)).slice(0, recurrenceSuggestionLimit)
    .map(({ candidate, matchingFacts }) => ({ candidateIncidentId: candidate.id, recurrenceRuleVersionId: input.rule.versionId, occurrence: occurrenceFor(candidate.id, input.existingSuggestions ?? [], input.explicitReevaluation === true), matchingFacts: matchingFacts! }));
}
