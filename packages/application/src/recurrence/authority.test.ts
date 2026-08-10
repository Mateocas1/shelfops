import { describe, expect, it } from "vitest";
import type { AuthorizationRecord } from "@shelfops/domain/authorization/types";
import type { AuthorizedPrincipal } from "../authorization/authorized-principal.js";
import { RecurrenceDecisionForbiddenError, RecurrenceDecisionNotFoundError, RecurrenceDecisionValidationError, assertRecurrenceDecisionAuthorization, prepareRecurrenceDecision, type RecurrenceDecisionInput } from "./authority.js";

const record = (id: string, overrides: Partial<AuthorizationRecord> = {}): AuthorizationRecord => ({ id, storeId: "store-a", sectorId: "sector-a", category: "equipment-failure", reporterId: "actor-a", ...overrides });
const principal = (id = "actor-a"): AuthorizedPrincipal => ({ id, active: true, roleScopes: [{ role: "collaborator", storeIds: ["store-a"], sectorIds: ["sector-a"], categoryResponsibilities: [], teamIds: [] }], grants: [] });
const input = (overrides: Partial<RecurrenceDecisionInput> = {}): RecurrenceDecisionInput => ({ sourceSuggestionId: "suggestion-a", state: "confirmed", expectedVersion: 1, idempotencyKey: "decision-a", correlationId: "correlation-a", note: " reviewed ", ...overrides });

describe("recurrence decision authority", () => {
  it("normalizes attributable human commands and permits an in-scope reporter who can view both incidents", () => {
    expect(prepareRecurrenceDecision(principal(), input())).toEqual({ ...input(), actorId: "actor-a", note: "reviewed" });
    expect(() => assertRecurrenceDecisionAuthorization(principal(), record("owner"), record("candidate", { reporterId: "other" }), "confirmed")).not.toThrow();
  });

  it("rejects malformed commands, visible but unauthorized roles, and either hidden incident", () => {
    expect(() => prepareRecurrenceDecision(principal(), input({ state: "pending" as never }))).toThrow(RecurrenceDecisionValidationError);
    expect(() => prepareRecurrenceDecision(principal(), input({ expectedVersion: 0 }))).toThrow(RecurrenceDecisionValidationError);
    expect(() => prepareRecurrenceDecision(principal(), input({ idempotencyKey: " " }))).toThrow(RecurrenceDecisionValidationError);
    expect(() => prepareRecurrenceDecision(principal(), input({ note: " " }))).toThrow(RecurrenceDecisionValidationError);
    expect(() => assertRecurrenceDecisionAuthorization(principal("viewer"), record("owner"), record("candidate"), "dismissed")).toThrow(RecurrenceDecisionForbiddenError);
    expect(() => assertRecurrenceDecisionAuthorization(principal(), record("owner"), record("hidden", { storeId: "store-b", reporterId: "other" }), "confirmed")).toThrow(RecurrenceDecisionNotFoundError);
  });
});
