import { Type, type Static } from "@sinclair/typebox";

export const commonBoundary = "common";

export const CorrelationIdSchema = Type.String({
  description: "Server-generated identifier for support correlation."
});

export const ApiVersionSchema = Type.Literal("v1");
export const ApiRootResponseSchema = Type.Object({
  apiVersion: ApiVersionSchema,
  correlationId: CorrelationIdSchema,
  limit: Type.Integer(),
  cursor: Type.Optional(Type.String())
}, { additionalProperties: false });
export type ApiRootResponse = Static<typeof ApiRootResponseSchema>;
