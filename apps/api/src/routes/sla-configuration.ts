import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import type { SlaPolicyConfigurationExecutor } from "@shelfops/application/sla/configure-policy";
import { AuthenticationRequiredErrorSchema, ForbiddenErrorSchema, IdempotencyConflictErrorSchema, StaleVersionErrorSchema, TemporaryUnavailableErrorSchema, ValidationErrorSchema } from "@shelfops/contracts/errors";
import { SlaPolicyConfigurationBodySchema, SlaPolicyConfigurationResponseSchema, type SlaPolicyConfigurationBody } from "@shelfops/contracts/sla-policy";
import { createMutationGuard } from "../auth/session-boundary.js";
import { ValidationError } from "../error-handler.js";

const allowed = new Set(["expectedVersion", "effectiveAt", "idempotencyKey", "rules"]);
const response = (schema: object) => ({ ...schema, headers: { "X-Correlation-Id": { type: "string", description: "Correlation for this HTTP request; replays receive a new value." } } });
async function rejectUnknownBody(request: FastifyRequest): Promise<void> { if (request.body && typeof request.body === "object" && !Array.isArray(request.body)) { const fields = Object.keys(request.body as object).filter((name) => !allowed.has(name)).map((name) => ({ name, code: "unknown" })); if (fields.length) throw new ValidationError(fields); } }
export interface SlaPolicyConfigurationRouteDependencies { identityProvider?: IdentityProvider; slaPolicyExecutor: SlaPolicyConfigurationExecutor; }

export async function registerSlaPolicyConfigurationRoute(app: FastifyInstance, dependencies: SlaPolicyConfigurationRouteDependencies): Promise<void> {
  app.post<{ Body: SlaPolicyConfigurationBody }>("/api/v1/sla-policy", { preValidation: rejectUnknownBody, preHandler: createMutationGuard(dependencies.identityProvider), schema: { summary: "Configure a future-effective SLA policy matrix", security: [{ sessionCookie: [] }], body: SlaPolicyConfigurationBodySchema, response: { 201: response(SlaPolicyConfigurationResponseSchema), 400: response(ValidationErrorSchema), 401: response(AuthenticationRequiredErrorSchema), 403: response(ForbiddenErrorSchema), 409: response({ oneOf: [IdempotencyConflictErrorSchema, StaleVersionErrorSchema] }), 503: response(TemporaryUnavailableErrorSchema) } } }, async (request, reply) => {
    if (!request.principal) throw new Error("forbidden"); const outcome = await dependencies.slaPolicyExecutor.execute(request.principal, request.body); return reply.code(201).send({ ...outcome, correlationId: request.id });
  });
}
