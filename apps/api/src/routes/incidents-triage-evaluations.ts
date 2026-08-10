import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import { reduceTriageProjection } from "@shelfops/application/triage/authority";
import type { PostgresTriageAuthorityExecutor } from "@shelfops/infrastructure/triage/postgres-triage-authority-executor";
import { AuthenticationRequiredErrorSchema, ForbiddenErrorSchema, NotFoundErrorSchema, TemporaryUnavailableErrorSchema, TriageMutation409ErrorSchema, ValidationErrorSchema } from "@shelfops/contracts/errors";
import { TriageEvaluationResponseSchema } from "@shelfops/contracts/triage";

import { createMutationGuard } from "../auth/session-boundary.js";
import { TemporaryUnavailableError, ValidationError } from "../error-handler.js";

type Body = { expectedVersion: number; idempotencyKey: string };
const allowed = new Set(["expectedVersion", "idempotencyKey"]);
const correlationHeader = { type: "string", description: "Correlation for this HTTP request; replays receive a new value." };
const response = (schema: object) => ({ ...schema, headers: { "X-Correlation-Id": correlationHeader } });
const bodySchema = {
  type: "object", additionalProperties: false,
  properties: { expectedVersion: { type: "integer", minimum: 1 }, idempotencyKey: { type: "string", minLength: 1, pattern: "\\S" } },
  required: ["expectedVersion", "idempotencyKey"]
} as const;
const paramsSchema = {
  type: "object", additionalProperties: false,
  properties: { incidentId: { type: "string", format: "uuid" } }, required: ["incidentId"]
} as const;

async function rejectUnknownBody(request: FastifyRequest): Promise<void> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) return;
  const fields = Object.keys(request.body as object).filter((name) => !allowed.has(name)).map((name) => ({ name, code: "unknown" }));
  if (fields.length) throw new ValidationError(fields);
}

export interface IncidentTriageEvaluationRouteDependencies {
  identityProvider?: IdentityProvider;
  triageAuthorityExecutor: Pick<PostgresTriageAuthorityExecutor, "execute">;
}

export async function registerIncidentTriageEvaluationRoute(app: FastifyInstance, dependencies: IncidentTriageEvaluationRouteDependencies): Promise<void> {
  app.post<{ Params: { incidentId: string }; Body: Body }>("/api/v1/incidents/:incidentId/triage/evaluations", {
    preValidation: rejectUnknownBody,
    preHandler: createMutationGuard(dependencies.identityProvider),
    schema: {
      summary: "Evaluate deterministic triage for an open incident",
      security: [{ sessionCookie: [] }],
      params: paramsSchema,
      body: bodySchema,
      response: {
        201: response(TriageEvaluationResponseSchema),
        400: response(ValidationErrorSchema),
        401: response(AuthenticationRequiredErrorSchema),
        403: response(ForbiddenErrorSchema),
        404: response(NotFoundErrorSchema),
        409: response(TriageMutation409ErrorSchema),
        503: response(TemporaryUnavailableErrorSchema)
      }
    }
  }, async (request, reply) => {
    if (!request.principal) throw new Error("forbidden");
    const outcome = await dependencies.triageAuthorityExecutor.execute(request.principal, { incidentId: request.params.incidentId, ...request.body, correlationId: request.id });
    if (outcome.status === "indeterminate") throw new TemporaryUnavailableError();
    const triage = reduceTriageProjection<typeof outcome.evaluation, never>({ incidentId: outcome.incidentId, state: "open", version: outcome.version, evaluations: [outcome.evaluation], decisionSets: [] });
    return reply.code(201).send({ evaluation: outcome.evaluation, triage, actionCorrelationId: outcome.evaluation.actionCorrelationId, correlationId: request.id });
  });
}
