import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import type { CreateIncidentInput } from "@shelfops/application/incidents/create-incident";
import type { PostgresIncidentCreationExecutor } from "@shelfops/infrastructure/incidents/postgres-incident-creation-executor";
import { AuthenticationRequiredErrorSchema, ForbiddenErrorSchema, IdempotencyConflictErrorSchema, TemporaryUnavailableErrorSchema, ValidationErrorSchema } from "@shelfops/contracts/errors";
import { createMutationGuard } from "../auth/session-boundary.js";
import { TemporaryUnavailableError, ValidationError } from "../error-handler.js";

type Body = Omit<CreateIncidentInput, "correlationId">;
const allowed = new Set(["storeId", "sectorId", "locationId", "productId", "category", "severity", "title", "description", "occurredAt", "textEvidence", "idempotencyKey"]);
const uuid = { type: "string", format: "uuid" };
const nonblank = { type: "string", pattern: "\\S" };
const correlationHeader = { type: "string", description: "Correlation for this HTTP request; replays receive a new value." };
const response = (schema: object) => ({ ...schema, headers: { "X-Correlation-Id": correlationHeader } });
const bodySchema = {
  type: "object", additionalProperties: false,
  properties: { storeId: uuid, sectorId: uuid, locationId: uuid, productId: uuid, category: nonblank, severity: nonblank, title: nonblank, description: nonblank, occurredAt: { type: "string", format: "date-time" }, textEvidence: { ...nonblank, maxLength: 4_000 }, idempotencyKey: nonblank },
  required: ["storeId", "sectorId", "locationId", "category", "severity", "title", "description", "occurredAt", "textEvidence", "idempotencyKey"]
} as const;
const successSchema = { type: "object", additionalProperties: false, properties: { incidentId: uuid, evidenceId: uuid, eventId: uuid, reporterId: uuid, createdAt: { type: "string", format: "date-time" }, state: { type: "string", enum: ["open"] }, version: { type: "integer", enum: [1] }, correlationId: { type: "string" } }, required: ["incidentId", "evidenceId", "eventId", "reporterId", "createdAt", "state", "version", "correlationId"] } as const;

async function rejectUnknownBody(request: FastifyRequest): Promise<void> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) return;
  const fields = Object.keys(request.body as object).filter((name) => !allowed.has(name)).map((name) => ({ name, code: "unknown" }));
  if (fields.length) throw new ValidationError(fields);
}

export interface IncidentCreationRouteDependencies { identityProvider?: IdentityProvider; incidentCreationExecutor: Pick<PostgresIncidentCreationExecutor, "execute">; }

export async function registerIncidentCreationRoute(app: FastifyInstance, dependencies: IncidentCreationRouteDependencies): Promise<void> {
  app.post<{ Body: Body }>("/api/v1/incidents", {
    preValidation: rejectUnknownBody,
    preHandler: createMutationGuard(dependencies.identityProvider),
    schema: { summary: "Create an incident with initial text evidence", security: [{ sessionCookie: [] }], body: bodySchema, response: { 201: response(successSchema), 400: response(ValidationErrorSchema), 401: response(AuthenticationRequiredErrorSchema), 403: response(ForbiddenErrorSchema), 409: response(IdempotencyConflictErrorSchema), 503: response(TemporaryUnavailableErrorSchema) } }
  }, async (request, reply) => {
    if (!request.principal) throw new Error("forbidden");
    const outcome = await dependencies.incidentCreationExecutor.execute(request.principal, { ...request.body, correlationId: request.id });
    if (outcome.status === "indeterminate") throw new TemporaryUnavailableError();
    const { status: _status, ...receipt } = outcome;
    return reply.code(201).send({ ...receipt, correlationId: request.id });
  });
}
