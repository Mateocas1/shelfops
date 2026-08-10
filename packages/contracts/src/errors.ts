import { Type } from "@sinclair/typebox";

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

export const ApiErrorSchema = Type.Union([
  ValidationErrorSchema,
  TemporaryUnavailableErrorSchema,
  AuthenticationRequiredErrorSchema,
  ForbiddenErrorSchema,
  NotFoundErrorSchema,
  IdempotencyConflictErrorSchema,
  StaleVersionErrorSchema
]);
