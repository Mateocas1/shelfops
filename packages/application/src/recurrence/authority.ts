import { actionDecision } from "@shelfops/domain/authorization/action-policy";
import type { AuthorizationRecord } from "@shelfops/domain/authorization/types";
import { visibilityDecision } from "@shelfops/domain/authorization/visibility-policy";
import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";

export const recurrenceDecisionStates = ["confirmed", "dismissed"] as const;
export type RecurrenceDecisionState = typeof recurrenceDecisionStates[number];
export type RecurrenceDecisionInput = Readonly<{
  sourceSuggestionId: string; state: RecurrenceDecisionState; expectedVersion: number;
  idempotencyKey: string; correlationId: string; note?: string; correctionReason?: string;
}>;
export type PreparedRecurrenceDecision = RecurrenceDecisionInput & Readonly<{ actorId: string }>;
export type RecurrenceDecisionReceipt = Readonly<{
  status: "decided"; sourceSuggestionId: string; decisionId: string; state: RecurrenceDecisionState;
  sequence: number; predecessorSequence?: number; incidentId: string; version: number; decidedAt: string;
}>;
export type RecurrenceDecisionOutcome = RecurrenceDecisionReceipt | Readonly<{
  status: "indeterminate"; correlationId: string; retryWithSameKey: true;
}>;
export interface RecurrenceDecisionExecutor {
  execute(principal: AuthorizedPrincipal, input: RecurrenceDecisionInput): Promise<RecurrenceDecisionOutcome>;
}
export class RecurrenceDecisionValidationError extends Error {
  constructor() { super("recurrence-decision-validation"); }
}
export class RecurrenceDecisionForbiddenError extends Error {
  constructor() { super("recurrence-decision-forbidden"); }
}
export class RecurrenceDecisionNotFoundError extends Error {
  constructor() { super("not-found"); }
}
export class RecurrenceDecisionIdempotencyConflictError extends Error {
  constructor() { super("idempotency-conflict"); }
}

function text(value: unknown, required = true): string | undefined {
  if (value === undefined && !required) return undefined;
  if (typeof value !== "string" || value.trim() === "") throw new RecurrenceDecisionValidationError();
  return value.trim();
}
export function prepareRecurrenceDecision(principal: AuthorizedPrincipal, input: RecurrenceDecisionInput): PreparedRecurrenceDecision {
  if (!recurrenceDecisionStates.includes(input.state) || !Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
    throw new RecurrenceDecisionValidationError();
  }
  const sourceSuggestionId = text(input.sourceSuggestionId)!;
  const idempotencyKey = text(input.idempotencyKey)!;
  const correlationId = text(input.correlationId)!;
  const note = text(input.note, false);
  const correctionReason = text(input.correctionReason, false);
  return {
    sourceSuggestionId, state: input.state, expectedVersion: input.expectedVersion, idempotencyKey, correlationId,
    ...(note === undefined ? {} : { note }), ...(correctionReason === undefined ? {} : { correctionReason }), actorId: principal.id
  };
}
export function assertRecurrenceDecisionAuthorization(principal: AuthorizedPrincipal, owner: AuthorizationRecord, candidate: AuthorizationRecord, state: RecurrenceDecisionState): void {
  if (visibilityDecision(principal.id, principal.active, principal.roleScopes, owner).outcome !== "visible"
    || visibilityDecision(principal.id, principal.active, principal.roleScopes, candidate).outcome !== "visible") throw new RecurrenceDecisionNotFoundError();
  const action = state === "confirmed" ? "confirm-recurrence" : "dismiss-recurrence";
  if (actionDecision(principal.id, principal.active, principal.roleScopes, principal.grants, owner, action).outcome !== "allowed") throw new RecurrenceDecisionForbiddenError();
}
