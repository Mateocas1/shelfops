import type { ConfigurationExecutor } from "@shelfops/application/ports/configuration-executor";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import type { SlaPolicyConfigurationExecutor } from "@shelfops/application/sla/configure-policy";
import type { RecurrenceDecisionExecutor } from "@shelfops/application/recurrence/authority";
import type { PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";
import type { PostgresIncidentCreationExecutor } from "@shelfops/infrastructure/incidents/postgres-incident-creation-executor";
import type { PostgresTriageAuthorityExecutor } from "@shelfops/infrastructure/triage/postgres-triage-authority-executor";
import type { FastifyInstance } from "fastify";

import { registerSessionBoundary } from "../auth/session-boundary.js";
import { registerHealthRoute } from "./health.js";
import { registerIncidentReadRoutes } from "./incidents-read.js";
import { registerIncidentCreationRoute } from "./incidents-create.js";
import { registerIncidentTriageEvaluationRoute } from "./incidents-triage-evaluations.js";
import { registerIncidentTriageReadRoute } from "./incidents-triage-read.js";
import { registerIncidentTriageDecisionRoute } from "./incidents-triage-decisions.js";
import { registerLocationConfigurationRoute } from "./location-configuration.js";
import { registerSlaPolicyConfigurationRoute } from "./sla-configuration.js";
import { registerRecurrenceDecisionRoute } from "./recurrence-decisions.js";

export interface ApiRegistrationDependencies {
  configurationExecutor: ConfigurationExecutor;
  identityProvider?: IdentityProvider;
  incidentRepository?: Pick<PostgresAuthorizedIncidentRepository, "detail" | "list">;
  incidentCreationExecutor?: Pick<PostgresIncidentCreationExecutor, "execute">;
  triageAuthoritySource?: Pick<PostgresAuthorizedIncidentRepository, "triage">;
  triageAuthorityExecutor?: Pick<PostgresTriageAuthorityExecutor, "execute" | "decide">;
  slaPolicyExecutor?: SlaPolicyConfigurationExecutor;
  recurrenceDecisionExecutor?: RecurrenceDecisionExecutor;
  cursorSecret: string;
}

export async function registerPublishedRoutes(app: FastifyInstance, dependencies: ApiRegistrationDependencies): Promise<void> {
  await registerLocationConfigurationRoute(app, dependencies);
  if (dependencies.slaPolicyExecutor) await registerSlaPolicyConfigurationRoute(app, { identityProvider: dependencies.identityProvider, slaPolicyExecutor: dependencies.slaPolicyExecutor });
  if (dependencies.recurrenceDecisionExecutor) await registerRecurrenceDecisionRoute(app, { identityProvider: dependencies.identityProvider, recurrenceDecisionExecutor: dependencies.recurrenceDecisionExecutor });
  if (dependencies.incidentRepository) await registerIncidentReadRoutes(app, {
    cursorSecret: dependencies.cursorSecret,
    identityProvider: dependencies.identityProvider,
    repository: dependencies.incidentRepository
  });
  if (dependencies.incidentCreationExecutor) await registerIncidentCreationRoute(app, { identityProvider: dependencies.identityProvider, incidentCreationExecutor: dependencies.incidentCreationExecutor });
  if (dependencies.triageAuthorityExecutor) await registerIncidentTriageEvaluationRoute(app, { identityProvider: dependencies.identityProvider, triageAuthorityExecutor: dependencies.triageAuthorityExecutor });
  if (dependencies.triageAuthoritySource) await registerIncidentTriageReadRoute(app, { identityProvider: dependencies.identityProvider, repository: dependencies.triageAuthoritySource });
  if (dependencies.triageAuthorityExecutor && dependencies.triageAuthoritySource) await registerIncidentTriageDecisionRoute(app, { identityProvider: dependencies.identityProvider, triageAuthorityExecutor: dependencies.triageAuthorityExecutor, triageRepository: dependencies.triageAuthoritySource });
}

export async function registerApiRoutes(app: FastifyInstance, dependencies: ApiRegistrationDependencies): Promise<void> {
  await registerHealthRoute(app);
  await registerSessionBoundary(app, { identityProvider: dependencies.identityProvider });
  await registerPublishedRoutes(app, dependencies);
}
