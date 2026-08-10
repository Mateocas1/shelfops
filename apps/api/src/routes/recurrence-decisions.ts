import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import type { RecurrenceDecisionExecutor } from "@shelfops/application/recurrence/authority";
import { AuthenticationRequiredErrorSchema, ForbiddenErrorSchema, IdempotencyConflictErrorSchema, NotFoundErrorSchema, StaleVersionErrorSchema, TemporaryUnavailableErrorSchema, ValidationErrorSchema } from "@shelfops/contracts/errors";
import { RecurrenceDecisionBodySchema, RecurrenceDecisionResponseSchema, type RecurrenceDecisionBody } from "@shelfops/contracts/recurrence";
import { createMutationGuard } from "../auth/session-boundary.js";
import { TemporaryUnavailableError, ValidationError } from "../error-handler.js";

const allowed = new Set(["state", "expectedVersion", "idempotencyKey", "note", "correctionReason"]);
const response = (schema: object) => ({
  ...schema,
  headers: { "X-Correlation-Id": { type: "string", description: "Correlation for this HTTP request; replays receive a new value." } }
});
async function rejectUnknownBody(request: FastifyRequest): Promise<void> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) return;
  const fields = Object.keys(request.body as object).filter((name) => !allowed.has(name)).map((name) => ({ name, code: "unknown" }));
  if (fields.length) throw new ValidationError(fields);
}
export interface RecurrenceDecisionRouteDependencies {
  identityProvider?: IdentityProvider;
  recurrenceDecisionExecutor: RecurrenceDecisionExecutor;
}
export async function registerRecurrenceDecisionRoute(app: FastifyInstance, dependencies: RecurrenceDecisionRouteDependencies): Promise<void> {
  app.post<{ Params: { sourceSuggestionId: string }; Body: RecurrenceDecisionBody }>("/api/v1/recurrence-suggestions/:sourceSuggestionId/decision", {
    preValidation: rejectUnknownBody, preHandler: createMutationGuard(dependencies.identityProvider),
    schema: { summary: "Confirm, dismiss, or correct a recurrence suggestion", security: [{ sessionCookie: [] }], params: { type: "object", additionalProperties: false, properties: { sourceSuggestionId: { type: "string", format: "uuid" } }, required: ["sourceSuggestionId"] }, body: RecurrenceDecisionBodySchema, response: { 201: response(RecurrenceDecisionResponseSchema), 400: response(ValidationErrorSchema), 401: response(AuthenticationRequiredErrorSchema), 403: response(ForbiddenErrorSchema), 404: response(NotFoundErrorSchema), 409: response({ oneOf: [IdempotencyConflictErrorSchema, StaleVersionErrorSchema] }), 503: response(TemporaryUnavailableErrorSchema) } }
  }, async (request, reply) => {
    if (!request.principal) throw new Error("forbidden");
    const outcome = await dependencies.recurrenceDecisionExecutor.execute(request.principal, { ...request.body, sourceSuggestionId: request.params.sourceSuggestionId, correlationId: request.id });
    if (outcome.status === "indeterminate") throw new TemporaryUnavailableError();
    const { status: _status, ...receipt } = outcome;
    return reply.code(201).send({ ...receipt, correlationId: request.id });
  });
}
