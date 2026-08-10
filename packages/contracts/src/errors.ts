import { Type, type Static } from "@sinclair/typebox";

import { CorrelationIdSchema } from "./common.js";

export const errorsBoundary = "errors";

export const ErrorFieldSchema = Type.Object({
  name: Type.String(),
  code: Type.String()
}, { additionalProperties: false });

export const ValidationErrorSchema = Type.Object({
  code: Type.Literal("validation-failed"),
  message: Type.String(),
  correlationId: CorrelationIdSchema,
  fields: Type.Array(ErrorFieldSchema)
}, { additionalProperties: false });

export const TemporaryUnavailableErrorSchema = Type.Object({
  code: Type.Literal("temporarily-unavailable"),
  message: Type.String(),
  correlationId: CorrelationIdSchema
}, { additionalProperties: false });

export const AuthenticationRequiredErrorSchema = Type.Object({
  code: Type.Literal("authentication-required"),
  message: Type.String(),
  correlationId: CorrelationIdSchema
}, { additionalProperties: false });

export const ForbiddenErrorSchema = Type.Object({
  code: Type.Literal("forbidden"),
  message: Type.String(),
  correlationId: CorrelationIdSchema
}, { additionalProperties: false });

export const NotFoundErrorSchema = Type.Object({
  code: Type.Literal("not-found"),
  message: Type.String(),
  correlationId: CorrelationIdSchema
}, { additionalProperties: false });

export const IdempotencyConflictErrorSchema = Type.Object({
  code: Type.Literal("idempotency-conflict"),
  message: Type.String(),
  correlationId: CorrelationIdSchema
}, { additionalProperties: false });

export const StaleVersionErrorSchema = Type.Object({
  code: Type.Literal("stale-version"),
  message: Type.String(),
  correlationId: CorrelationIdSchema
}, { additionalProperties: false });

export const TriageStaleVersionErrorSchema = Type.Object({
  code: Type.Literal("stale-version"), message: Type.String(),
  correlationId: CorrelationIdSchema,
  currentVersion: Type.Integer({ minimum: 1 }),
  retrievalUri: Type.String({ pattern: "^/api/v1/incidents/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/triage$" })
}, { additionalProperties: false });
export type TriageStaleVersionError = Static<typeof TriageStaleVersionErrorSchema>;

export const TriageInvalidTransitionErrorSchema = Type.Object({
  code: Type.Literal("invalid-transition"),
  message: Type.Literal("Incident must be open for triage"),
  correlationId: CorrelationIdSchema,
  currentState: Type.Union([
    Type.Literal("classified"), Type.Literal("in-progress"),
    Type.Literal("blocked"), Type.Literal("resolved")
  ])
}, { additionalProperties: false });
export type TriageInvalidTransitionError = Static<typeof TriageInvalidTransitionErrorSchema>;

export const TriageMutation409ErrorSchema = Type.Union([
  IdempotencyConflictErrorSchema,
  TriageStaleVersionErrorSchema,
  TriageInvalidTransitionErrorSchema
]);
export type TriageMutation409Error = Static<typeof TriageMutation409ErrorSchema>;

export const ApiErrorSchema = Type.Union([
  ValidationErrorSchema,
  TemporaryUnavailableErrorSchema,
  AuthenticationRequiredErrorSchema,
  ForbiddenErrorSchema,
  NotFoundErrorSchema,
  IdempotencyConflictErrorSchema,
  StaleVersionErrorSchema,
  TriageStaleVersionErrorSchema,
  TriageInvalidTransitionErrorSchema
]);
