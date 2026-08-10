import type { FastifyInstance } from "fastify";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import { reduceTriageProjection } from "@shelfops/application/triage/authority";
import { AuthenticationRequiredErrorSchema, NotFoundErrorSchema, TemporaryUnavailableErrorSchema, ValidationErrorSchema } from "@shelfops/contracts/errors";
import { TriageProjectionSchema } from "@shelfops/contracts/triage";
import type { PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";

import { createReadGuard } from "../auth/session-boundary.js";

type Repository = Pick<PostgresAuthorizedIncidentRepository, "triage">;
const uuid = { type: "string", format: "uuid" };
const correlationHeader = { type: "string", description: "Server-generated identifier for support correlation." };
const response = (schema: object) => ({ ...schema, headers: { "X-Correlation-Id": correlationHeader } });

export interface IncidentTriageReadRouteDependencies { identityProvider?: IdentityProvider; repository: Repository; }

export async function registerIncidentTriageReadRoute(app: FastifyInstance, dependencies: IncidentTriageReadRouteDependencies): Promise<void> {
  app.get<{ Params: { incidentId: string } }>("/api/v1/incidents/:incidentId/triage", {
    preHandler: createReadGuard(dependencies.identityProvider),
    schema: {
      summary: "Read visible incident triage", security: [{ sessionCookie: [] }],
      params: { type: "object", additionalProperties: false, properties: { incidentId: uuid }, required: ["incidentId"] },
      response: { 200: response(TriageProjectionSchema), 400: response(ValidationErrorSchema), 401: response(AuthenticationRequiredErrorSchema), 404: response(NotFoundErrorSchema), 503: response(TemporaryUnavailableErrorSchema) }
    }
  }, async (request) => {
    if (!request.principal) throw new Error("not-found");
    const authority = await dependencies.repository.triage(request.principal, request.params.incidentId);
    if (!authority) throw new Error("not-found");
    return reduceTriageProjection(authority);
  });
}
