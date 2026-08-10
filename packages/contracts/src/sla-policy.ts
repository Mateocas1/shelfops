import { Type, type Static } from "@sinclair/typebox";
import { CorrelationIdSchema } from "./common.js";

export const slaPolicyBoundary = "sla-policy";
const nonblank = Type.String({ minLength: 1, pattern: "\\S" });
export const SlaPolicyRuleSchema = Type.Object({ category: nonblank, severity: nonblank, warningAfterSeconds: Type.Integer({ minimum: 1 }), deadlineAfterSeconds: Type.Integer({ minimum: 1 }) }, { additionalProperties: false });
export const SlaPolicyConfigurationBodySchema = Type.Object({ expectedVersion: Type.Integer({ minimum: 1 }), effectiveAt: Type.String({ format: "date-time" }), idempotencyKey: nonblank, rules: Type.Array(SlaPolicyRuleSchema, { minItems: 1 }) }, { additionalProperties: false });
export const SlaPolicyConfigurationResponseSchema = Type.Object({ policyVersionId: Type.String({ format: "uuid" }), version: Type.Integer({ minimum: 1 }), effectiveAt: Type.String({ format: "date-time" }), correlationId: CorrelationIdSchema }, { additionalProperties: false });
export type SlaPolicyConfigurationBody = Static<typeof SlaPolicyConfigurationBodySchema>;
