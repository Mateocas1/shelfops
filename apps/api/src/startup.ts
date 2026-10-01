import type { FastifyInstance } from "fastify";
import { Pool } from "pg";
import { PostgresIdentityProvider } from "@shelfops/infrastructure/identity/postgres-identity-provider";
import { PostgresOidcLoginStore } from "@shelfops/infrastructure/identity/postgres-oidc-login-store";
import { PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";
import { PostgresIncidentCreationExecutor } from "@shelfops/infrastructure/incidents/postgres-incident-creation-executor";
import { PostgresTriageAuthorityExecutor } from "@shelfops/infrastructure/triage/postgres-triage-authority-executor";
import { PostgresConfigurationExecutor } from "@shelfops/infrastructure/reference-data/postgres-configuration-executor";
import { PostgresSlaPolicyExecutor } from "@shelfops/infrastructure/postgres/sla-policy-executor";
import { PostgresRecurrenceAuthorityExecutor } from "@shelfops/infrastructure/recurrence/postgres-recurrence-authority-executor";
import { readDatabaseConnectionConfig } from "@shelfops/infrastructure/postgres/database-config";
import type { ConfigurationExecutor } from "@shelfops/application/ports/configuration-executor";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";

import { buildApi, type BuildApiOptions } from "./app.js";
import { createLifecycle, type Lifecycle } from "./lifecycle.js";
import { createApiLogger, validateLogLevel, type ApiLogger } from "./logging.js";
import { createMetrics, validateMetricsCredential, type PoolDiagnostics } from "./metrics.js";
import { readOidcConfig } from "./auth/oidc-config.js";
import { createOidcProtocol, type OidcProtocol } from "./auth/oidc-client.js";

const TCP_PORT_PATTERN = /^\d+$/;
const INVALID_PORT_MESSAGE = "PORT must be a TCP port between 1 and 65535";
const TEST_METRICS_CREDENTIAL = "synthetic-test-metrics-credential-32-bytes";

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
  lifecycle?: Lifecycle;
  dependencyProbe?: () => Promise<void>;
  logger?: ApiLogger | false;
  logLevel?: string;
  metricsCredential?: string;
  metricsDiagnostics?: () => PoolDiagnostics;
  oidcEnvironment?: Readonly<Record<string, string | undefined>>;
  allowOidcLoopbackHttp?: boolean;
  createOidcProtocol?: typeof createOidcProtocol;
}

interface ApiPool {
  connect: Pool["connect"];
  query: Pool["query"];
  end: Pool["end"];
  totalCount?: number;
  idleCount?: number;
  waitingCount?: number;
  on?: Pool["on"];
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
  let logger = options.logger || undefined;
  const bootstrapLogger = options.logger === false ? undefined : logger ?? createApiLogger({ environment: process.env.NODE_ENV ?? "production", release: process.env.RELEASE ?? process.env.npm_package_version ?? "unknown" });
  const logError = options.logError ?? ((error: unknown) => (logger ?? bootstrapLogger)?.error("startup.failed", error));
  let app: FastifyInstance | undefined;
  let closeOwnedResource: (() => Promise<void>) | undefined;

  try {
    validateLogLevel(options.logLevel ?? process.env.LOG_LEVEL);
    if (options.logger !== false) logger ??= createApiLogger({ environment: process.env.NODE_ENV ?? "production", release: process.env.RELEASE ?? process.env.npm_package_version ?? "unknown", level: options.logLevel ?? process.env.LOG_LEVEL });
    const cursorSecret = requireCursorSecret(options.cursorSecret ?? process.env.CURSOR_SECRET);
    const oidcConfig = readOidcConfig(options.oidcEnvironment ?? process.env, { allowLoopbackHttp: options.allowOidcLoopbackHttp });
    const metricsCredential = validateMetricsCredential(options.metricsCredential ?? process.env.METRICS_BEARER_TOKEN ?? (process.env.NODE_ENV === "test" ? TEST_METRICS_CREDENTIAL : undefined));
    let configurationExecutor = options.configurationExecutor;
    let identityProvider = options.identityProvider;
    let incidentRepository: BuildApiOptions["incidentRepository"];
    let incidentCreationExecutor = options.incidentCreationExecutor;
    let triageAuthoritySource = options.triageAuthoritySource;
    let triageAuthorityExecutor = options.triageAuthorityExecutor;
    let slaPolicyExecutor = options.slaPolicyExecutor;
    let recurrenceDecisionExecutor = options.recurrenceDecisionExecutor;
    const lifecycle = options.lifecycle ?? createLifecycle();
    let dependencyProbe = options.dependencyProbe;
    let metricsDiagnostics = options.metricsDiagnostics;
    let oidc: BuildApiOptions["oidc"];
    let oidcProtocol: OidcProtocol | undefined;

    if (!configurationExecutor) {
      const connectionString = process.env.DATABASE_URL?.trim();
      if (!connectionString) throw new Error("DATABASE_URL must be nonblank");

      let pool: ApiPool;
      if (options.createPool) {
        pool = options.createPool(connectionString);
      } else {
        const databaseConfig = await readDatabaseConnectionConfig(process.env);
        pool = new Pool({ connectionString, connectionTimeoutMillis: 1_000, ...databaseConfig });
      }
      pool.on?.("error", (error) => logger?.error("dependency.failed", error));
      closeOwnedResource = closeOnce(pool);
      dependencyProbe = async () => { await pool.query("SELECT 1"); };
      metricsDiagnostics = () => ({ total: pool.totalCount ?? 0, idle: pool.idleCount ?? 0, waiting: pool.waitingCount ?? 0 });
      configurationExecutor = new PostgresConfigurationExecutor(pool);
      identityProvider ??= new PostgresIdentityProvider(pool);
      const repository = new PostgresAuthorizedIncidentRepository(pool as Pool);
      incidentRepository = repository;
      incidentCreationExecutor ??= new PostgresIncidentCreationExecutor(pool);
      triageAuthoritySource ??= repository;
      triageAuthorityExecutor ??= new PostgresTriageAuthorityExecutor(pool);
      slaPolicyExecutor ??= new PostgresSlaPolicyExecutor(pool);
      recurrenceDecisionExecutor ??= new PostgresRecurrenceAuthorityExecutor(pool);
      if (oidcConfig) {
        const store = new PostgresOidcLoginStore(pool as Pool);
        oidcProtocol = await (options.createOidcProtocol ?? createOidcProtocol)(oidcConfig);
        const closePool = closeOwnedResource;
        closeOwnedResource = closeOnce({ end: async () => { await oidcProtocol?.close(); await closePool?.(); } } as ApiPool);
        oidc = { config: oidcConfig, protocol: oidcProtocol, persistence: store, identityProvider, revoke: store.scopedRevoker(oidcConfig.organizationId).revoke };
      }
    } else if (!identityProvider) {
      throw new Error("A production identity provider is required with an external configuration executor");
    }

    if (!dependencyProbe) throw new Error("A production dependency probe is required");
    if (!metricsDiagnostics && process.env.NODE_ENV === "test") metricsDiagnostics = () => ({ total: 0, idle: 0, waiting: 0 });
    if (!metricsDiagnostics) throw new Error("Bounded production pool diagnostics are required");
    await dependencyProbe();

    const readiness = { ...lifecycle, probe: dependencyProbe };
    const metrics = createMetrics({ credential: metricsCredential, environment: process.env.NODE_ENV ?? "production", release: process.env.RELEASE ?? process.env.npm_package_version ?? "unknown", readiness, pool: metricsDiagnostics });
    app = await (options.buildApi ?? buildApi)({ configurationExecutor, identityProvider, incidentRepository, incidentCreationExecutor, triageAuthoritySource, triageAuthorityExecutor, slaPolicyExecutor, recurrenceDecisionExecutor, oidc, cursorSecret, environment: "production", closeOwnedResource, logError, logger, readiness, metrics });
    await app.listen({
      host: options.host ?? process.env.HOST ?? "127.0.0.1",
      port: parsePort(options.port ?? process.env.PORT)
    });
    logger?.info("startup.ready", { host: options.host ?? process.env.HOST ?? "127.0.0.1", port: parsePort(options.port ?? process.env.PORT) });

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
