import { Type, type Static } from "@sinclair/typebox";

import { CorrelationIdSchema } from "./common.js";

export const triageBoundary = "triage";

const nonblank = Type.String({ minLength: 1, pattern: "\\S" });
const uuid = Type.String({ format: "uuid" });

export const TriageFieldSchema = Type.Union([
  Type.Literal("category"), Type.Literal("severity"), Type.Literal("assignee")
]);
export type TriageField = Static<typeof TriageFieldSchema>;

export const TriageDispositionSchema = Type.Union([
  Type.Literal("confirmed"), Type.Literal("corrected"), Type.Literal("manual")
]);
export type TriageDisposition = Static<typeof TriageDispositionSchema>;

const TriageRuleSchema = Type.Object({
  identifier: Type.String(), ruleId: Type.Union([uuid, Type.Null()]), versionId: uuid, version: Type.Integer()
}, { additionalProperties: false });
const TriageEvaluationInputsSchema = Type.Object({
  storeId: uuid, sectorId: uuid, locationId: uuid, productId: Type.Union([uuid, Type.Null()]),
  category: Type.String(), severity: Type.String(), eligibleAssigneeIds: Type.Array(uuid)
}, { additionalProperties: false });
const TriageSuggestedSchema = Type.Object({
  category: Type.Union([Type.String(), Type.Null()]), severity: Type.Union([Type.String(), Type.Null()]),
  assigneeUserId: Type.Union([uuid, Type.Null()]), manualFields: Type.Array(TriageFieldSchema)
}, { additionalProperties: false });
const TriageExplanationSchema = Type.Object({
  code: Type.Union([Type.Literal("matched-single-eligible"), Type.Literal("manual-assignee-ambiguous"), Type.Literal("manual-no-match")]),
  facts: Type.Object({ eligibleAssigneeCount: Type.Integer() }, { additionalProperties: false }), text: Type.String()
}, { additionalProperties: false });

export const TriageEvaluationSchema = Type.Object({
  id: uuid, incidentId: uuid, incidentVersion: Type.Integer(), rule: TriageRuleSchema,
  inputs: TriageEvaluationInputsSchema, suggested: TriageSuggestedSchema, explanation: TriageExplanationSchema,
  evaluatedAt: Type.String({ format: "date-time" }), actionCorrelationId: CorrelationIdSchema
}, { additionalProperties: false });
export type TriageEvaluation = Static<typeof TriageEvaluationSchema>;

const decisionAudit = {
  id: uuid, setId: uuid, evaluationId: uuid,
  disposition: TriageDispositionSchema,
  reason: Type.Union([nonblank, Type.Null()]),
  actorUserId: uuid, decidedAt: Type.String({ format: "date-time" }),
  actionCorrelationId: CorrelationIdSchema
} as const;
export const TriageCategoryDecisionSchema = Type.Object(
  { ...decisionAudit, field: Type.Literal("category"), value: nonblank },
  { additionalProperties: false }
);
export const TriageSeverityDecisionSchema = Type.Object(
  { ...decisionAudit, field: Type.Literal("severity"), value: nonblank },
  { additionalProperties: false }
);
export const TriageAssigneeDecisionSchema = Type.Object(
  { ...decisionAudit, field: Type.Literal("assignee"), value: uuid },
  { additionalProperties: false }
);
export const TriageDecisionSchema = Type.Union([
  TriageCategoryDecisionSchema,
  TriageSeverityDecisionSchema,
  TriageAssigneeDecisionSchema
]);
export type TriageCategoryDecision = Static<typeof TriageCategoryDecisionSchema>;
export type TriageSeverityDecision = Static<typeof TriageSeverityDecisionSchema>;
export type TriageAssigneeDecision = Static<typeof TriageAssigneeDecisionSchema>;
export type TriageDecision = Static<typeof TriageDecisionSchema>;

export const CategoryDecisionInputSchema = Type.Object({
  field: Type.Literal("category"), disposition: TriageDispositionSchema, value: nonblank, reason: Type.Optional(nonblank)
}, { additionalProperties: false });
export const SeverityDecisionInputSchema = Type.Object({
  field: Type.Literal("severity"), disposition: TriageDispositionSchema, value: nonblank, reason: Type.Optional(nonblank)
}, { additionalProperties: false });
export const AssigneeDecisionInputSchema = Type.Object({
  field: Type.Literal("assignee"), disposition: TriageDispositionSchema, value: uuid, reason: Type.Optional(nonblank)
}, { additionalProperties: false });
export type CategoryDecisionInput = Static<typeof CategoryDecisionInputSchema>;
export type SeverityDecisionInput = Static<typeof SeverityDecisionInputSchema>;
export type AssigneeDecisionInput = Static<typeof AssigneeDecisionInputSchema>;

export const TriageDecisionBodySchema = Type.Object({
  evaluationId: uuid, expectedVersion: Type.Integer({ minimum: 1 }), idempotencyKey: nonblank, complete: Type.Boolean(),
  decisions: Type.Array(Type.Union([CategoryDecisionInputSchema, SeverityDecisionInputSchema, AssigneeDecisionInputSchema]), { minItems: 1, maxItems: 3 })
}, { additionalProperties: false });
export type TriageDecisionBody = Static<typeof TriageDecisionBodySchema>;

const TriageStateSchema = Type.Union([Type.Literal("open"), Type.Literal("classified")]);
const TriageStatusSchema = Type.Union([Type.Literal("awaiting-evaluation"), Type.Literal("awaiting-decision"), Type.Literal("complete")]);
const LatestTriageDecisionsSchema = Type.Object({
  category: Type.Union([TriageCategoryDecisionSchema, Type.Null()]),
  severity: Type.Union([TriageSeverityDecisionSchema, Type.Null()]),
  assignee: Type.Union([TriageAssigneeDecisionSchema, Type.Null()])
}, { additionalProperties: false });
export const TriageProjectionSchema = Type.Object({
  incidentId: uuid, state: TriageStateSchema, version: Type.Integer(), status: TriageStatusSchema,
  currentEvaluation: Type.Union([TriageEvaluationSchema, Type.Null()]), latestDecisions: LatestTriageDecisionsSchema,
  complete: Type.Boolean()
}, { additionalProperties: false });
export type TriageProjection = Static<typeof TriageProjectionSchema>;

export const CreationSlaSchema = Type.Object({
  cycleId: uuid, cycleSequence: Type.Literal(1), condition: Type.Literal("on-track"),
  warningAt: Type.String({ format: "date-time" }), deadlineAt: Type.String({ format: "date-time" }),
  policyVersionId: uuid, policyVersion: Type.Integer({ minimum: 1 }), clockMode: Type.Literal("continuous-utc"),
  pausesWhenBlocked: Type.Boolean()
}, { additionalProperties: false });
export type CreationSla = Static<typeof CreationSlaSchema>;

export const IncidentCreationResponseSchema = Type.Object({
  incidentId: uuid, evidenceId: uuid, eventId: uuid, triageEventId: uuid, reporterId: uuid,
  createdAt: Type.String({ format: "date-time" }), state: Type.Literal("open"), version: Type.Literal(1),
  actionCorrelationId: CorrelationIdSchema, sla: CreationSlaSchema, triage: TriageProjectionSchema,
  correlationId: CorrelationIdSchema
}, { additionalProperties: false });
export type IncidentCreationResponse = Static<typeof IncidentCreationResponseSchema>;

export const TriageEvaluationResponseSchema = Type.Object({
  evaluation: TriageEvaluationSchema, triage: TriageProjectionSchema,
  actionCorrelationId: CorrelationIdSchema, correlationId: CorrelationIdSchema
}, { additionalProperties: false });
export type TriageEvaluationResponse = Static<typeof TriageEvaluationResponseSchema>;

export const TriageDecisionSetSchema = Type.Object({
  id: uuid, evaluationId: uuid, sequence: Type.Integer({ minimum: 1 }),
  recordedFields: Type.Array(TriageFieldSchema, { minItems: 1, maxItems: 3 }), complete: Type.Boolean(),
  decidedAt: Type.String({ format: "date-time" })
}, { additionalProperties: false });
export type TriageDecisionSet = Static<typeof TriageDecisionSetSchema>;

export const TriageDecisionResponseSchema = Type.Object({
  decisionSet: TriageDecisionSetSchema, triage: TriageProjectionSchema,
  actionCorrelationId: CorrelationIdSchema, correlationId: CorrelationIdSchema
}, { additionalProperties: false });
export type TriageDecisionResponse = Static<typeof TriageDecisionResponseSchema>;
