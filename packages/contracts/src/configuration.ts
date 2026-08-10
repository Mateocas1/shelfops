import { Type, type Static } from "@sinclair/typebox";

import { CorrelationIdSchema } from "./common.js";

export const configurationBoundary = "configuration";

export const LocationConfigurationParamsSchema = Type.Object({
  storeId: Type.String({ minLength: 1 }),
  locationId: Type.String({ minLength: 1 })
}, { additionalProperties: false });

export const LocationConfigurationBodySchema = Type.Object({
  expectedVersion: Type.Integer({ minimum: 0 }),
  effectiveAt: Type.String({ minLength: 1 }),
  effectiveUntil: Type.Optional(Type.String({ minLength: 1 })),
  active: Type.Boolean(),
  label: Type.Optional(Type.String({ minLength: 1 })),
  idempotencyKey: Type.String({ minLength: 1 })
}, { additionalProperties: false });

const ConfigurationStateSchema = Type.Object({}, { additionalProperties: true });

export const LocationConfigurationResponseSchema = Type.Object({
  eventId: Type.String({ minLength: 1 }),
  version: Type.Integer({ minimum: 0 }),
  before: ConfigurationStateSchema,
  after: ConfigurationStateSchema,
  effectiveAt: Type.String({ minLength: 1 }),
  correlationId: CorrelationIdSchema
}, { additionalProperties: false });

export type LocationConfigurationParams = Static<typeof LocationConfigurationParamsSchema>;
export type LocationConfigurationBody = Static<typeof LocationConfigurationBodySchema>;
