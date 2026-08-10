import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ConfigurationExecutor } from "@shelfops/application/ports/configuration-executor";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";

import { createMutationGuard } from "../auth/session-boundary.js";
import { ValidationError } from "../error-handler.js";
import { LocationConfigurationSchema, type LocationConfigurationBody, type LocationConfigurationParams } from "../schemas.js";

const locationConfigurationPath = "/api/v1/stores/:storeId/locations/:locationId/configuration";
const allowedBodyProperties = new Set(["expectedVersion", "effectiveAt", "effectiveUntil", "active", "label", "idempotencyKey"]);

export interface LocationConfigurationRouteDependencies {
  configurationExecutor: ConfigurationExecutor;
  identityProvider?: IdentityProvider;
}

async function rejectUnknownBodyProperties(request: FastifyRequest): Promise<void> {
  if (!request.body || typeof request.body !== "object" || Array.isArray(request.body)) return;
  const fields = Object.keys(request.body as Record<string, unknown>)
    .filter((name) => !allowedBodyProperties.has(name))
    .map((name) => ({ name, code: "unknown" }));
  if (fields.length > 0) throw new ValidationError(fields);
}

export async function registerLocationConfigurationRoute(app: FastifyInstance, dependencies: LocationConfigurationRouteDependencies): Promise<void> {
  app.post<{ Params: LocationConfigurationParams; Body: LocationConfigurationBody }>(locationConfigurationPath, {
    schema: LocationConfigurationSchema,
    preValidation: rejectUnknownBodyProperties,
    preHandler: createMutationGuard(dependencies.identityProvider)
  }, async (request, reply) => {
    if (!request.principal) throw new Error("forbidden");
    const outcome = await dependencies.configurationExecutor.execute(request.principal, { ...request.params, ...request.body, correlationId: request.id });
    reply.header("x-correlation-id", outcome.correlationId);
    return outcome;
  });
}
