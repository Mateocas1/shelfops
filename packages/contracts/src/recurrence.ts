import { Type, type Static } from "@sinclair/typebox";
import { CorrelationIdSchema } from "./common.js";

export const recurrenceBoundary = "recurrence";
const nonblank = Type.String({ minLength: 1, pattern: "\\S" });
const uuid = Type.String({ format: "uuid" });
export const RecurrenceDecisionStateSchema = Type.Union([
  Type.Literal("confirmed"), Type.Literal("dismissed")
]);
export const RecurrenceDecisionBodySchema = Type.Object({
  state: RecurrenceDecisionStateSchema, expectedVersion: Type.Integer({ minimum: 1 }), idempotencyKey: nonblank,
  note: Type.Optional(nonblank), correctionReason: Type.Optional(nonblank)
}, { additionalProperties: false });
export const RecurrenceDecisionResponseSchema = Type.Object({
  sourceSuggestionId: uuid, decisionId: uuid, state: RecurrenceDecisionStateSchema, sequence: Type.Integer({ minimum: 1 }),
  predecessorSequence: Type.Optional(Type.Integer({ minimum: 1 })), incidentId: uuid, version: Type.Integer({ minimum: 1 }),
  decidedAt: Type.String({ format: "date-time" }), correlationId: CorrelationIdSchema
}, { additionalProperties: false });
export type RecurrenceDecisionBody = Static<typeof RecurrenceDecisionBodySchema>;
