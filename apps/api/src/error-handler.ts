import type { FastifyInstance, FastifyRequest } from "fastify";

import { IdempotencyConflictError } from "@shelfops/application/ports/configuration-executor";
import { IncidentCreationForbiddenError, IncidentCreationIdempotencyConflictError, IncidentCreationValidationError, IncidentReferenceError } from "@shelfops/application/incidents/create-incident";
import { SlaPolicyValidationError } from "@shelfops/application/sla/configure-policy";
import { RecurrenceDecisionForbiddenError, RecurrenceDecisionIdempotencyConflictError, RecurrenceDecisionNotFoundError, RecurrenceDecisionValidationError } from "@shelfops/application/recurrence/authority";
import { TriageForbiddenError, TriageIdempotencyConflictError, TriageInvalidTransitionError, TriageStaleVersionError, TriageValidationError } from "@shelfops/application/triage/authority";
import { InvalidCursorError } from "@shelfops/contracts/pagination";
import { IndeterminateCommitError } from "@shelfops/infrastructure/reference-data/postgres-configuration-executor";

export class TemporaryUnavailableError extends Error {}
export class ValidationError extends Error {
  constructor(readonly fields: Array<{ name: string; code: string }>) {
    super("Request validation failed");
  }
}

function correlationId(request: FastifyRequest): string {
  return request.id;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function validationFields(error: unknown): Array<{ name: string; code: string }> {
  if (error instanceof ValidationError) return error.fields;
  if (error instanceof IncidentReferenceError) return [{ name: "reference", code: "invalid" }];
  if (error instanceof IncidentCreationValidationError) return [{ name: "body", code: "invalid" }];
  if (error instanceof SlaPolicyValidationError) return [{ name: "body", code: "invalid" }];
  if (error instanceof RecurrenceDecisionValidationError) return [{ name: "body", code: "invalid" }];
  if (error instanceof TriageValidationError) return [{ name: "body", code: "invalid" }];
  if (error instanceof InvalidCursorError) return [{ name: "cursor", code: "invalid" }];
  const validation = record(error)?.validation;
  if (!Array.isArray(validation)) return [];
  return validation.map((item) => {
    const detail = record(item);
    const path = detail?.instancePath;
    const keyword = detail?.keyword;
    return {
      name: typeof path === "string" && path.length > 1 ? path.slice(1) : "query",
      code: typeof keyword === "string" ? keyword : "invalid"
    };
  });
}

function apiError(code: string, message: string, correlationId: string) {
  return { code, message, correlationId };
}

function triageRetrievalUri(request: FastifyRequest): string {
  const incidentId = record(request.params)?.incidentId;
  if (typeof incidentId !== "string") throw new Error("Triage incident ID is required");
  return `/api/v1/incidents/${incidentId}/triage`;
}

export function normalizeApiError(error: unknown, request: FastifyRequest): { status: number; body: Record<string, unknown> } {
  const correlation = correlationId(request);
  const fields = validationFields(error);
  if (fields.length > 0) return { status: 400, body: { ...apiError("validation-failed", "Request validation failed", correlation), fields } };
  if (error instanceof TriageStaleVersionError) return { status: 409, body: { ...apiError("stale-version", "Expected version is stale", correlation), currentVersion: error.currentVersion, retrievalUri: triageRetrievalUri(request) } };
  if (error instanceof TriageInvalidTransitionError) return { status: 409, body: { ...apiError("invalid-transition", "Incident must be open for triage", correlation), currentState: error.currentState } };
  if (error instanceof IdempotencyConflictError || error instanceof IncidentCreationIdempotencyConflictError || error instanceof RecurrenceDecisionIdempotencyConflictError || error instanceof TriageIdempotencyConflictError) return { status: 409, body: apiError("idempotency-conflict", "Idempotency key is already used for a different request", correlation) };
  if (error instanceof IndeterminateCommitError) return { status: 503, body: apiError("temporarily-unavailable", "Service is temporarily unavailable", correlation) };
  if (error instanceof Error && error.message === "stale-version") return { status: 409, body: apiError("stale-version", "Expected version is stale", correlation) };
  if (error instanceof IncidentCreationForbiddenError || error instanceof RecurrenceDecisionForbiddenError || error instanceof TriageForbiddenError || error instanceof Error && error.message === "forbidden") return { status: 403, body: apiError("forbidden", "Request is forbidden", correlation) };
  if (error instanceof RecurrenceDecisionNotFoundError || error instanceof Error && error.message === "not-found") return { status: 404, body: apiError("not-found", "Resource not found", correlation) };
  return { status: 503, body: apiError("temporarily-unavailable", "Service is temporarily unavailable", correlation) };
}

export function registerErrorHandling(app: FastifyInstance): void {
  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-correlation-id", correlationId(request));
  });
  app.setErrorHandler((error, request, reply) => {
    const normalized = normalizeApiError(error, request);
    return reply.code(normalized.status).send(normalized.body);
  });
  app.setNotFoundHandler((request, reply) => {
    const normalized = normalizeApiError(new Error("not-found"), request);
    return reply.code(normalized.status).send(normalized.body);
  });
}
