import { commonBoundary } from "@shelfops/contracts/common";
import { ApiErrorSchema, errorsBoundary, IdempotencyConflictErrorSchema, TriageInvalidTransitionErrorSchema, TriageMutation409ErrorSchema, TriageStaleVersionErrorSchema, type TriageInvalidTransitionError, type TriageMutation409Error, type TriageStaleVersionError } from "@shelfops/contracts/errors";
import { paginationBoundary } from "@shelfops/contracts/pagination";
import { recurrenceBoundary } from "@shelfops/contracts/recurrence";
import { slaPolicyBoundary } from "@shelfops/contracts/sla-policy";
import { CreationSlaSchema, IncidentCreationResponseSchema, TriageAssigneeDecisionSchema, TriageCategoryDecisionSchema, TriageDecisionBodySchema, TriageDecisionResponseSchema, TriageDecisionSchema, TriageDecisionSetSchema, TriageDispositionSchema, TriageEvaluationResponseSchema, TriageEvaluationSchema, TriageFieldSchema, TriageProjectionSchema, TriageSeverityDecisionSchema, triageBoundary, CategoryDecisionInputSchema, SeverityDecisionInputSchema, AssigneeDecisionInputSchema, type AssigneeDecisionInput, type CategoryDecisionInput, type CreationSla, type IncidentCreationResponse, type SeverityDecisionInput, type TriageAssigneeDecision, type TriageCategoryDecision, type TriageDecision, type TriageDecisionBody, type TriageDecisionResponse, type TriageDecisionSet, type TriageDisposition, type TriageEvaluation, type TriageEvaluationResponse, type TriageField, type TriageProjection, type TriageSeverityDecision } from "@shelfops/contracts/triage";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { TriageForbiddenError as ApplicationTriageForbiddenError, TriageIdempotencyConflictError as ApplicationTriageIdempotencyConflictError, TriageInvalidTransitionError as ApplicationTriageInvalidTransitionError, TriageStaleVersionError as ApplicationTriageStaleVersionError, TriageValidationError as ApplicationTriageValidationError } from "@shelfops/application/triage/authority";
import { normalizeApiError } from "../src/error-handler.js";

const ids = {
  incident: "00000000-0000-7000-8000-000000000001", evaluation: "00000000-0000-7000-8000-000000000002", rule: "00000000-0000-7000-8000-000000000003", ruleVersion: "00000000-0000-7000-8000-000000000004", store: "00000000-0000-7000-8000-000000000005", sector: "00000000-0000-7000-8000-000000000006", location: "00000000-0000-7000-8000-000000000007", assignee: "00000000-0000-7000-8000-000000000008", actor: "00000000-0000-7000-8000-000000000009", categoryDecision: "00000000-0000-7000-8000-000000000010", severityDecision: "00000000-0000-7000-8000-000000000011", assigneeDecision: "00000000-0000-7000-8000-000000000012", decisionSet: "00000000-0000-7000-8000-000000000013", cycle: "00000000-0000-7000-8000-000000000014", evidence: "00000000-0000-7000-8000-000000000015", event: "00000000-0000-7000-8000-000000000016", triageEvent: "00000000-0000-7000-8000-000000000017"
} as const;
const timestamp = "2026-08-10T12:00:00.000Z";
const fields: TriageField[] = ["category", "severity", "assignee"];
const dispositions: readonly TriageDisposition[] = ["confirmed", "corrected", "manual"];
const auditFields = ["id", "setId", "evaluationId", "actorUserId", "decidedAt", "actionCorrelationId"] as const;
const evaluation = {
  id: ids.evaluation, incidentId: ids.incident, incidentVersion: 1,
  rule: { identifier: "default-catch-all", ruleId: ids.rule, versionId: ids.ruleVersion, version: 1 },
  inputs: { storeId: ids.store, sectorId: ids.sector, locationId: ids.location, productId: null, category: "out-of-stock", severity: "high", eligibleAssigneeIds: [ids.assignee] },
  suggested: { category: "out-of-stock", severity: "high", assigneeUserId: ids.assignee, manualFields: [] },
  explanation: { code: "matched-single-eligible", facts: { eligibleAssigneeCount: 1 }, text: "Input category and severity preserved; exactly one eligible assignee suggested." },
  evaluatedAt: timestamp, actionCorrelationId: "triage-action"
} satisfies TriageEvaluation;
const audit = { setId: ids.decisionSet, evaluationId: ids.evaluation, disposition: "confirmed", reason: null, actorUserId: ids.actor, decidedAt: timestamp, actionCorrelationId: "triage-action" } as const;
const categoryDecision = { ...audit, id: ids.categoryDecision, field: "category", value: "out-of-stock" } satisfies TriageCategoryDecision;
const severityDecision = { ...audit, id: ids.severityDecision, field: "severity", value: "high" } satisfies TriageSeverityDecision;
const assigneeDecision = { ...audit, id: ids.assigneeDecision, field: "assignee", value: ids.assignee } satisfies TriageAssigneeDecision;
const decisions: readonly TriageDecision[] = [categoryDecision, severityDecision, assigneeDecision];
const categoryInput = { field: "category", disposition: "confirmed", value: "out-of-stock" } satisfies CategoryDecisionInput;
const severityInput = { field: "severity", disposition: "corrected", value: "high", reason: "Verified severity" } satisfies SeverityDecisionInput;
const assigneeInput = { field: "assignee", disposition: "manual", value: ids.assignee, reason: "Selected eligible owner" } satisfies AssigneeDecisionInput;
const body = { evaluationId: ids.evaluation, expectedVersion: 1, idempotencyKey: "triage-decision-1", complete: true, decisions: [categoryInput, severityInput, assigneeInput] } satisfies TriageDecisionBody;
const projection = { incidentId: ids.incident, state: "open", version: 1, status: "awaiting-decision", currentEvaluation: evaluation, latestDecisions: { category: null, severity: null, assignee: null }, complete: false } satisfies TriageProjection;
const decisionProjection = { ...projection, state: "classified", status: "complete", version: 2, latestDecisions: { category: categoryDecision, severity: severityDecision, assignee: assigneeDecision }, complete: true } satisfies TriageProjection;
const sla = { cycleId: ids.cycle, cycleSequence: 1, condition: "on-track", warningAt: timestamp, deadlineAt: "2026-08-10T14:00:00.000Z", policyVersionId: ids.ruleVersion, policyVersion: 1, clockMode: "continuous-utc", pausesWhenBlocked: false } satisfies CreationSla;
const creationResponse = { incidentId: ids.incident, evidenceId: ids.evidence, eventId: ids.event, triageEventId: ids.triageEvent, reporterId: ids.actor, createdAt: timestamp, state: "open", version: 1, actionCorrelationId: "triage-action", sla, triage: projection, correlationId: "http-correlation" } satisfies IncidentCreationResponse;
const evaluationResponse = { evaluation, triage: projection, actionCorrelationId: "triage-action", correlationId: "http-correlation" } satisfies TriageEvaluationResponse;
const decisionSet = { id: ids.decisionSet, evaluationId: ids.evaluation, sequence: 1, recordedFields: fields, complete: true, decidedAt: timestamp } satisfies TriageDecisionSet;
const decisionResponse = { decisionSet, triage: decisionProjection, actionCorrelationId: "triage-action", correlationId: "http-correlation" } satisfies TriageDecisionResponse;
const staleError = { code: "stale-version", message: "Expected version is stale", correlationId: "http-correlation", currentVersion: 2, retrievalUri: `/api/v1/incidents/${ids.incident}/triage` } satisfies TriageStaleVersionError;
const invalidTransitionError = { code: "invalid-transition", message: "Incident must be open for triage", correlationId: "http-correlation", currentState: "classified" } satisfies TriageInvalidTransitionError;
const mutationErrors: readonly TriageMutation409Error[] = [{ code: "idempotency-conflict", message: "Idempotency key is already used for a different request", correlationId: "http-correlation" }, staleError, invalidTransitionError];
const validationSchemas = { field: TriageFieldSchema, disposition: TriageDispositionSchema, evaluation: TriageEvaluationSchema, categoryDecision: TriageCategoryDecisionSchema, severityDecision: TriageSeverityDecisionSchema, assigneeDecision: TriageAssigneeDecisionSchema, decision: TriageDecisionSchema, categoryInput: CategoryDecisionInputSchema, severityInput: SeverityDecisionInputSchema, assigneeInput: AssigneeDecisionInputSchema, decisionBody: TriageDecisionBodySchema, projection: TriageProjectionSchema, creationSla: CreationSlaSchema, creationResponse: IncidentCreationResponseSchema, evaluationResponse: TriageEvaluationResponseSchema, decisionSet: TriageDecisionSetSchema, decisionResponse: TriageDecisionResponseSchema, idempotencyConflict: IdempotencyConflictErrorSchema, staleError: TriageStaleVersionErrorSchema, invalidTransition: TriageInvalidTransitionErrorSchema, mutation409: TriageMutation409ErrorSchema, apiError: ApiErrorSchema } as const;
type ValidationSchema = keyof typeof validationSchemas;
const validationApps: FastifyInstance[] = [];

function validationApp(): FastifyInstance {
  const app = Fastify({ ajv: { customOptions: { removeAdditional: false } } });
  for (const [name, schema] of Object.entries(validationSchemas)) app.post(`/contracts/${name}`, { schema: { body: { type: "object", properties: { value: schema }, required: ["value"], additionalProperties: false } } }, () => ({ accepted: true }));
  validationApps.push(app);
  return app;
}

async function validates(app: FastifyInstance, schema: ValidationSchema, payload: unknown): Promise<boolean> {
  return (await app.inject({ method: "POST", url: `/contracts/${schema}`, payload: { value: payload } })).statusCode === 200;
}

function without(value: object, key: string): Record<string, unknown> {
  const copy = { ...(value as Record<string, unknown>) };
  delete copy[key];
  return copy;
}

afterEach(async () => { await Promise.all(validationApps.splice(0).map((app) => app.close())); });

describe("contracts package boundary", () => {
  it("resolves its six neutral public subpaths and closed response DTOs", async () => {
    const app = validationApp();
    expect(commonBoundary).toBe("common");
    expect(errorsBoundary).toBe("errors");
    expect(paginationBoundary).toBe("pagination");
    expect(slaPolicyBoundary).toBe("sla-policy");
    expect(recurrenceBoundary).toBe("recurrence");
    expect(triageBoundary).toBe("triage");
    for (const [schema, value] of [["creationSla", sla], ["creationResponse", creationResponse], ["evaluationResponse", evaluationResponse], ["decisionSet", decisionSet], ["decisionResponse", decisionResponse]] as const) {
      expect(await validates(app, schema, value)).toBe(true);
      expect(await validates(app, schema, { ...value, unexpected: true })).toBe(false);
    }
  });

  it("rejects closed nested triage DTO, member, projection, and client-input violations", async () => {
    const app = validationApp();
    for (const field of fields) expect(await validates(app, "field", field)).toBe(true);
    for (const disposition of dispositions) expect(await validates(app, "disposition", disposition)).toBe(true);
    expect(await validates(app, "field", "unknown")).toBe(false);
    expect(await validates(app, "disposition", "unknown")).toBe(false);
    expect(await validates(app, "evaluation", evaluation)).toBe(true);
    for (const invalid of [{ ...evaluation, unexpected: true }, { ...evaluation, rule: { ...evaluation.rule, unexpected: true } }, { ...evaluation, inputs: { ...evaluation.inputs, unexpected: true } }, { ...evaluation, suggested: { ...evaluation.suggested, unexpected: true } }, { ...evaluation, explanation: { ...evaluation.explanation, unexpected: true } }, { ...evaluation, explanation: { ...evaluation.explanation, facts: { ...evaluation.explanation.facts, unexpected: true } } }]) expect(await validates(app, "evaluation", invalid)).toBe(false);
    for (const [schema, decision] of [["categoryDecision", categoryDecision], ["severityDecision", severityDecision], ["assigneeDecision", assigneeDecision]] as const) {
      expect(await validates(app, schema, decision)).toBe(true);
      expect(await validates(app, schema, { ...decision, unexpected: true })).toBe(false);
      for (const auditField of auditFields) expect(await validates(app, schema, without(decision, auditField))).toBe(false);
    }
    for (const decision of decisions) expect(await validates(app, "decision", decision)).toBe(true);
    for (const [schema, input] of [["categoryInput", categoryInput], ["severityInput", severityInput], ["assigneeInput", assigneeInput]] as const) expect(await validates(app, schema, input)).toBe(true);
    expect(await validates(app, "categoryDecision", { ...categoryDecision, value: " " })).toBe(false);
    expect(await validates(app, "severityDecision", { ...severityDecision, value: "" })).toBe(false);
    expect(await validates(app, "assigneeDecision", { ...assigneeDecision, value: "not-a-uuid" })).toBe(false);
    for (const invalid of [{ ...decisionProjection, latestDecisions: { ...decisionProjection.latestDecisions, category: severityDecision } }, { ...decisionProjection, latestDecisions: { ...decisionProjection.latestDecisions, severity: assigneeDecision } }, { ...decisionProjection, latestDecisions: { ...decisionProjection.latestDecisions, assignee: categoryDecision } }]) expect(await validates(app, "projection", invalid)).toBe(false);
    expect(await validates(app, "decisionBody", body)).toBe(true);
    for (const input of [categoryInput, severityInput, assigneeInput]) for (const auditField of auditFields) expect(await validates(app, "decisionBody", { ...body, decisions: [{ ...input, [auditField]: "server-owned" }] })).toBe(false);
    for (const invalid of [{ ...body, unexpected: true }, { ...body, expectedVersion: 0 }, { ...body, idempotencyKey: " " }, { ...body, decisions: [] }, { ...body, decisions: [...body.decisions, categoryInput] }]) expect(await validates(app, "decisionBody", invalid)).toBe(false);
  });

  it("accepts exactly the closed triage 409 members and rejects invalid transition variants", async () => {
    const app = validationApp();
    expect(TriageMutation409ErrorSchema.anyOf).toHaveLength(3);
    expect(await validates(app, "idempotencyConflict", mutationErrors[0]!)).toBe(true);
    for (const error of mutationErrors) expect(await validates(app, "mutation409", error)).toBe(true);
    expect(await validates(app, "staleError", staleError)).toBe(true);
    expect(await validates(app, "invalidTransition", invalidTransitionError)).toBe(true);
    expect(await validates(app, "apiError", staleError)).toBe(true);
    expect(await validates(app, "apiError", invalidTransitionError)).toBe(true);
    expect(ApiErrorSchema.anyOf).toContain(TriageStaleVersionErrorSchema);
    expect(ApiErrorSchema.anyOf).toContain(TriageInvalidTransitionErrorSchema);
    expect(await validates(app, "staleError", { ...staleError, retrievalUri: "/api/v1/incidents/not-a-uuid/triage" })).toBe(false);
    for (const invalid of [{ ...invalidTransitionError, retrievalUri: staleError.retrievalUri }, { ...invalidTransitionError, unexpected: true }, { ...invalidTransitionError, currentState: "open" }, { ...invalidTransitionError, currentState: "unknown" }]) {
      expect(await validates(app, "invalidTransition", invalid)).toBe(false);
      expect(await validates(app, "mutation409", invalid)).toBe(false);
    }
    for (const invalid of [{ code: "forbidden", message: "Request is forbidden", correlationId: "http-correlation" }, { ...mutationErrors[0]!, currentVersion: 2 }]) expect(await validates(app, "mutation409", invalid)).toBe(false);
  });

  it("triangulates nullable evaluation and alternative triage union members", async () => {
    const app = validationApp();
    const manualEvaluation = { ...evaluation, rule: { ...evaluation.rule, ruleId: null }, suggested: { category: null, severity: null, assigneeUserId: null, manualFields: fields }, explanation: { code: "manual-no-match", facts: { eligibleAssigneeCount: 0 }, text: "No triage rule matched; category, severity, and assignee require human selection." } };
    const correctedCategory = { ...categoryDecision, disposition: "corrected", reason: "Corrected after inspection", value: "damaged" };
    const manualAssignee = { ...assigneeDecision, disposition: "manual", reason: "Selected eligible owner" };
    expect(await validates(app, "evaluation", manualEvaluation)).toBe(true);
    expect(await validates(app, "decision", correctedCategory)).toBe(true);
    expect(await validates(app, "decision", manualAssignee)).toBe(true);
    expect(await validates(app, "invalidTransition", { ...invalidTransitionError, currentState: "resolved" })).toBe(true);
  });

  it("normalizes triage stale-version and invalid-transition errors into exact bodies", () => {
    const request = { id: "http-correlation", params: { incidentId: ids.incident } } as never;
    expect(normalizeApiError(new ApplicationTriageStaleVersionError(2), request)).toEqual({ status: 409, body: staleError });
    expect(normalizeApiError(new ApplicationTriageInvalidTransitionError("classified"), request)).toEqual({ status: 409, body: invalidTransitionError });
    expect(normalizeApiError(new ApplicationTriageValidationError(), request)).toEqual({ status: 400, body: { code: "validation-failed", message: "Request validation failed", correlationId: "http-correlation", fields: [{ name: "body", code: "invalid" }] } });
    expect(normalizeApiError(new ApplicationTriageForbiddenError(), request)).toEqual({ status: 403, body: { code: "forbidden", message: "Request is forbidden", correlationId: "http-correlation" } });
    expect(normalizeApiError(new ApplicationTriageIdempotencyConflictError(), request)).toEqual({ status: 409, body: { code: "idempotency-conflict", message: "Idempotency key is already used for a different request", correlationId: "http-correlation" } });
  });
});
