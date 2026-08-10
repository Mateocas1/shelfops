import type { FastifyInstance, FastifyRequest } from "fastify";

import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import { reduceTriageProjection } from "@shelfops/application/triage/authority";
import { AuthenticationRequiredErrorSchema, ForbiddenErrorSchema, NotFoundErrorSchema, TemporaryUnavailableErrorSchema, TriageMutation409ErrorSchema, ValidationErrorSchema } from "@shelfops/contracts/errors";
import { TriageDecisionBodySchema, TriageDecisionResponseSchema, type TriageDecisionBody } from "@shelfops/contracts/triage";
import type { PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";
import type { PostgresTriageAuthorityExecutor } from "@shelfops/infrastructure/triage/postgres-triage-authority-executor";

import { createMutationGuard } from "../auth/session-boundary.js";
import { TemporaryUnavailableError, ValidationError } from "../error-handler.js";

type Body = TriageDecisionBody;
type Repository = Pick<PostgresAuthorizedIncidentRepository, "triage">;
const allowed = new Set(["evaluationId", "expectedVersion", "idempotencyKey", "complete", "decisions"]);
const decisionAllowed = new Set(["field", "disposition", "value", "reason"]);
const correlationHeader = { type: "string", description: "Correlation for this HTTP request; replays receive a new value." };
const response = (schema: object) => ({ ...schema, headers: { "X-Correlation-Id": correlationHeader } });
const paramsSchema = {
  type: "object", additionalProperties: false,
  properties: { incidentId: { type: "string", format: "uuid" } }, required: ["incidentId"]
} as const;

async function rejectInvalidBody(request: FastifyRequest): Promise<void> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) return;
  const input = request.body as { decisions?: unknown };
  const unknown = Object.keys(input).filter((name) => !allowed.has(name)).map((name) => ({ name, code: "unknown" }));
  if (unknown.length > 0) throw new ValidationError(unknown);
  if (!Array.isArray(input.decisions)) return;
  const fields = new Set<string>();
  for (const [index, decision] of input.decisions.entries()) {
    if (typeof decision !== "object" || decision === null || Array.isArray(decision)) continue;
    const item = decision as { field?: unknown };
    const nestedUnknown = Object.keys(item).filter((name) => !decisionAllowed.has(name)).map((name) => ({ name: `decisions.${index}.${name}`, code: "unknown" }));
    if (nestedUnknown.length > 0) throw new ValidationError(nestedUnknown);
    if (typeof item.field === "string" && fields.has(item.field)) throw new ValidationError([{ name: "decisions", code: "duplicate-field" }]);
    if (typeof item.field === "string") fields.add(item.field);
  }
}

export interface IncidentTriageDecisionRouteDependencies {
  identityProvider?: IdentityProvider;
  triageAuthorityExecutor: Pick<PostgresTriageAuthorityExecutor, "decide">;
  triageRepository: Repository;
}

export async function registerIncidentTriageDecisionRoute(app: FastifyInstance, dependencies: IncidentTriageDecisionRouteDependencies): Promise<void> {
  app.post<{ Params: { incidentId: string }; Body: Body }>("/api/v1/incidents/:incidentId/triage/decisions", {
    preValidation: rejectInvalidBody,
    preHandler: createMutationGuard(dependencies.identityProvider),
    schema: {
      summary: "Record accountable triage decisions for an open incident",
      security: [{ sessionCookie: [] }],
      params: paramsSchema,
      body: TriageDecisionBodySchema,
      response: {
        201: response(TriageDecisionResponseSchema),
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
    const outcome = await dependencies.triageAuthorityExecutor.decide(request.principal, { incidentId: request.params.incidentId, ...request.body, correlationId: request.id });
    if (outcome.status === "indeterminate") throw new TemporaryUnavailableError();
    const authority = await dependencies.triageRepository.triage(request.principal, outcome.incidentId);
    if (!authority) throw new Error("not-found");
    const { actionCorrelationId, ...decisionSet } = outcome.decisionSet;
    return reply.code(201).send({ decisionSet, triage: reduceTriageProjection(authority), actionCorrelationId, correlationId: request.id });
  });
}
