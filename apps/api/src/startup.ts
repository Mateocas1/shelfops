import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { PostgresIdentityProvider } from "@shelfops/infrastructure/identity/postgres-identity-provider";
import { PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";
import { PostgresIncidentCreationExecutor } from "@shelfops/infrastructure/incidents/postgres-incident-creation-executor";
import { PostgresTriageAuthorityExecutor } from "@shelfops/infrastructure/triage/postgres-triage-authority-executor";
import { PostgresConfigurationExecutor } from "@shelfops/infrastructure/reference-data/postgres-configuration-executor";
import { PostgresSlaPolicyExecutor } from "@shelfops/infrastructure/postgres/sla-policy-executor";
import { PostgresRecurrenceAuthorityExecutor } from "@shelfops/infrastructure/recurrence/postgres-recurrence-authority-executor";
import type { ConfigurationExecutor } from "@shelfops/application/ports/configuration-executor";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";

import { buildApi, type BuildApiOptions } from "./app.js";

const TCP_PORT_PATTERN = /^\d+$/;
const INVALID_PORT_MESSAGE = "PORT must be a TCP port between 1 and 65535";

export interface StartupOptions {
  port?: string;
  host?: string;
  configurationExecutor?: ConfigurationExecutor;
  identityProvider?: IdentityProvider;
  incidentCreationExecutor?: BuildApiOptions["incidentCreationExecutor"];
  triageAuthoritySource?: BuildApiOptions["triageAuthoritySource"];
  triageAuthorityExecutor?: BuildApiOptions["triageAuthorityExecutor"];
  slaPolicyExecutor?: BuildApiOptions["slaPolicyExecutor"];
  recurrenceDecisionExecutor?: BuildApiOptions["recurrenceDecisionExecutor"];
  cursorSecret?: string;
  createPool?: (connectionString: string) => ApiPool;
  buildApi?: (options: BuildApiOptions) => Promise<FastifyInstance>;
  logError?: (error: unknown) => void;
}

interface ApiPool {
  connect: Pool["connect"];
  query: Pool["query"];
  end: Pool["end"];
}

function requireCursorSecret(value: string | undefined): string {
  const secret = value?.trim();
  if (!secret || secret === "development-only-cursor-secret" || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("CURSOR_SECRET must contain at least 32 bytes of secret material");
  }
  return secret;
}

export function parsePort(value: string | undefined): number {
  const port = value ?? "3000";

  if (!TCP_PORT_PATTERN.test(port)) {
    throw new Error(INVALID_PORT_MESSAGE);
  }

  const parsedPort = Number(port);

  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new Error(INVALID_PORT_MESSAGE);
  }

  return parsedPort;
}

function closeOnce(pool: ApiPool): () => Promise<void> {
  let closing: Promise<void> | undefined;

  return () => closing ??= Promise.resolve().then(() => pool.end());
}

export async function startApi(options: StartupOptions = {}): Promise<FastifyInstance> {
  const logError = options.logError ?? console.error;
  let app: FastifyInstance | undefined;
  let closeOwnedResource: (() => Promise<void>) | undefined;

  try {
    const cursorSecret = requireCursorSecret(options.cursorSecret ?? process.env.CURSOR_SECRET);
    let configurationExecutor = options.configurationExecutor;
    let identityProvider = options.identityProvider;
    let incidentRepository: BuildApiOptions["incidentRepository"];
    let incidentCreationExecutor = options.incidentCreationExecutor;
    let triageAuthoritySource = options.triageAuthoritySource;
    let triageAuthorityExecutor = options.triageAuthorityExecutor;
    let slaPolicyExecutor = options.slaPolicyExecutor;
    let recurrenceDecisionExecutor = options.recurrenceDecisionExecutor;

    if (!configurationExecutor) {
      const connectionString = process.env.DATABASE_URL?.trim();
      if (!connectionString) throw new Error("DATABASE_URL must be nonblank");

      const pool = (options.createPool ?? ((value) => new Pool({ connectionString: value })))(connectionString);
      closeOwnedResource = closeOnce(pool);
      configurationExecutor = new PostgresConfigurationExecutor(pool);
      identityProvider ??= new PostgresIdentityProvider(pool);
      const repository = new PostgresAuthorizedIncidentRepository(pool as Pool);
      incidentRepository = repository;
      incidentCreationExecutor ??= new PostgresIncidentCreationExecutor(pool);
      triageAuthoritySource ??= repository;
      triageAuthorityExecutor ??= new PostgresTriageAuthorityExecutor(pool);
      slaPolicyExecutor ??= new PostgresSlaPolicyExecutor(pool);
      recurrenceDecisionExecutor ??= new PostgresRecurrenceAuthorityExecutor(pool);
    } else if (!identityProvider) {
      throw new Error("A production identity provider is required with an external configuration executor");
    }

    app = await (options.buildApi ?? buildApi)({ configurationExecutor, identityProvider, incidentRepository, incidentCreationExecutor, triageAuthoritySource, triageAuthorityExecutor, slaPolicyExecutor, recurrenceDecisionExecutor, cursorSecret, environment: "production", closeOwnedResource, logError });
    await app.listen({
      host: options.host ?? process.env.HOST ?? "127.0.0.1",
      port: parsePort(options.port ?? process.env.PORT)
    });

    return app;
  } catch (error: unknown) {
    logError(error);

    if (app) {
      try {
        await app.close();
      } catch (closeError: unknown) {
        logError(closeError);
      }
    }

    if (closeOwnedResource) {
      try {
        await closeOwnedResource();
      } catch (closeError: unknown) {
        logError(closeError);
      }
    }

    throw error;
  }
}
