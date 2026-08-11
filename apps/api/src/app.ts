import Fastify, { type FastifyInstance } from "fastify";
import type { ConfigurationExecutor } from "@shelfops/application/ports/configuration-executor";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import type { SlaPolicyConfigurationExecutor } from "@shelfops/application/sla/configure-policy";
import type { RecurrenceDecisionExecutor } from "@shelfops/application/recurrence/authority";
import type { PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";
import type { PostgresIncidentCreationExecutor } from "@shelfops/infrastructure/incidents/postgres-incident-creation-executor";
import type { PostgresTriageAuthorityExecutor } from "@shelfops/infrastructure/triage/postgres-triage-authority-executor";

import { registerApiFoundation } from "./openapi.js";
import { registerApiRoutes, type ApiRegistrationDependencies } from "./routes/register.js";
import type { Readiness } from "./routes/health.js";
import { registerRequestLogging, safeCorrelationId, type ApiLogger } from "./logging.js";
import type { Metrics } from "./metrics.js";

export interface BuildApiOptions {
  configurationExecutor: ConfigurationExecutor;
  environment?: "test" | "development" | "production";
  identityProvider?: IdentityProvider;
  incidentRepository?: Pick<PostgresAuthorizedIncidentRepository, "detail" | "list">;
  incidentCreationExecutor?: Pick<PostgresIncidentCreationExecutor, "execute">;
  triageAuthoritySource?: Pick<PostgresAuthorizedIncidentRepository, "triage">;
  triageAuthorityExecutor?: Pick<PostgresTriageAuthorityExecutor, "execute" | "decide">;
  slaPolicyExecutor?: SlaPolicyConfigurationExecutor;
  recurrenceDecisionExecutor?: RecurrenceDecisionExecutor;
  cursorSecret?: string;
  registerApi?: (app: FastifyInstance, dependencies: ApiRegistrationDependencies) => Promise<void>;
  closeOwnedResource?: () => Promise<void>;
  logError?: (error: unknown) => void;
  readiness?: Readiness;
  logger?: ApiLogger | false;
  metrics?: Metrics;
}

export async function buildApi(options: BuildApiOptions): Promise<FastifyInstance> {
  if (options.environment === "production" && options.identityProvider?.kind === "development") {
    throw new Error("Development identity adapters cannot run in production");
  }

  const app = Fastify({ logger: false, genReqId: (request) => safeCorrelationId(request.headers["x-correlation-id"], crypto.randomUUID()) });
  if (options.logger) registerRequestLogging(app, options.logger);
  if (options.metrics) await options.metrics.register(app);

  if (options.closeOwnedResource) app.addHook("onClose", async () => options.closeOwnedResource?.());
  try {
    await registerApiFoundation(app, { cursorSecret: options.cursorSecret });
    await (options.registerApi ?? registerApiRoutes)(app, {
      configurationExecutor: options.configurationExecutor,
      identityProvider: options.identityProvider,
      incidentRepository: options.incidentRepository,
      incidentCreationExecutor: options.incidentCreationExecutor,
      triageAuthoritySource: options.triageAuthoritySource,
      triageAuthorityExecutor: options.triageAuthorityExecutor,
      slaPolicyExecutor: options.slaPolicyExecutor,
      recurrenceDecisionExecutor: options.recurrenceDecisionExecutor,
      cursorSecret: options.cursorSecret ?? "development-only-cursor-secret",
      readiness: options.readiness ?? { isDraining: () => false, probe: async () => { throw new Error("Readiness dependency is not configured"); } }
    });
  } catch (error: unknown) {
    try { await app.close(); } catch (closeError: unknown) { options.logError?.(closeError); }
    throw error;
  }

  return app;
}
