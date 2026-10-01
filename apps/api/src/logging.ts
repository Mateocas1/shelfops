import type { FastifyInstance, FastifyRequest } from "fastify";

import { normalizeApiError } from "./error-handler.js";

const LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = typeof LEVELS[number];
type Fields = Record<string, unknown>;

const SENSITIVE_ENVIRONMENT_VARIABLES = ["DATABASE_URL", "CURSOR_SECRET", "METRICS_BEARER_TOKEN", "SHELFOPS_OIDC_CLIENT_SECRET"] as const;
const MINIMUM_SECRET_LENGTH = 8;
const MAXIMUM_MESSAGE_LENGTH = 2_048;
const MAXIMUM_STACK_LENGTH = 8_192;

export interface ApiLogger {
  debug(event: string, fields?: Fields): void;
  info(event: string, fields?: Fields): void;
  warn(event: string, fields?: Fields): void;
  error(event: string, error: unknown, fields?: Fields): void;
}

export function validateLogLevel(value = "info"): LogLevel {
  if (!LEVELS.includes(value as LogLevel)) throw new Error(`LOG_LEVEL must be one of: ${LEVELS.join(", ")}`);
  return value as LogLevel;
}

export function safeCorrelationId(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : fallback;
}

function fallbackMessage(event: string): string {
  return event.startsWith("startup.") ? "Startup failed" : event.startsWith("shutdown.") ? "Shutdown failed" : "Request failed";
}

function truncated(value: string, maximum: number): string {
  return value.length > maximum ? `${value.slice(0, maximum)}…` : value;
}

function safeError(event: string, error: unknown): Fields {
  if (!(error instanceof Error)) return { type: "Error", message: fallbackMessage(event) };
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  return {
    type: error.name || "Error",
    ...(code ? { code } : {}),
    message: truncated(error.message || fallbackMessage(event), MAXIMUM_MESSAGE_LENGTH),
    ...(error.stack ? { stack: truncated(error.stack, MAXIMUM_STACK_LENGTH) } : {})
  };
}

function sanitize(value: unknown, key = ""): unknown {
  const normalized = key.replace(/[^a-z]/gi, "").toLowerCase();
  if (/(authorization|cookie|csrf|databaseurl|cursorsecret|password|token|session|rawsql)/.test(normalized)) return undefined;
  if (Array.isArray(value)) return value.map((item) => sanitize(item));
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(Object.entries(value).flatMap(([name, item]) => {
    const safe = sanitize(item, name);
    return safe === undefined ? [] : [[name, safe]];
  }));
}

function environmentSecrets(environment: NodeJS.ProcessEnv): string[] {
  return SENSITIVE_ENVIRONMENT_VARIABLES.flatMap((name) => {
    const value = environment[name]?.trim();
    return value && value.length >= MINIMUM_SECRET_LENGTH ? [value] : [];
  });
}

function redactSecrets(line: string, secrets: readonly string[]): string {
  return secrets.reduce((result, secret) => result.split(secret).join("[redacted]"), line);
}

export function createApiLogger(options: { environment: string; release: string; level?: string; write?: (line: string) => void; redact?: readonly string[] }): ApiLogger {
  const level = validateLogLevel(options.level);
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  const secrets = (options.redact ?? environmentSecrets(process.env)).filter((secret) => secret.length >= MINIMUM_SECRET_LENGTH);
  const emit = (eventLevel: LogLevel, event: string, fields: Fields = {}) => {
    if (LEVELS.indexOf(eventLevel) < LEVELS.indexOf(level)) return;
    const record = sanitize({ event, level: eventLevel, timestamp: new Date().toISOString(), service: "shelfops-api", release: options.release, environment: options.environment, ...fields });
    write(`${redactSecrets(JSON.stringify(record), secrets)}\n`);
  };
  return {
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, error, fields) => emit("error", event, { ...fields, error: safeError(event, error) })
  };
}

function requestStatus(error: unknown, request: FastifyRequest): number {
  try {
    return normalizeApiError(error, request).status;
  } catch {
    return 500;
  }
}

export function registerRequestLogging(app: FastifyInstance, logger: ApiLogger): void {
  const started = new WeakMap<FastifyRequest, bigint>();
  const requestFields = (request: FastifyRequest) => ({ requestId: request.id, correlationId: request.id, method: request.method, path: request.url.split("?", 1)[0] });
  app.addHook("onRequest", async (request) => {
    started.set(request, process.hrtime.bigint());
    logger.debug("request.received", requestFields(request));
  });
  app.addHook("onError", async (request, _reply, error) => {
    const statusCode = requestStatus(error, request);
    if (statusCode >= 500) logger.error("request.failed", error, { ...requestFields(request), statusCode });
    else logger.warn("request.rejected", { ...requestFields(request), statusCode });
  });
  app.addHook("onResponse", async (request, reply) => {
    const start = started.get(request) ?? process.hrtime.bigint();
    logger.info("request.completed", {
      ...requestFields(request),
      statusCode: reply.statusCode,
      elapsedMs: Number(process.hrtime.bigint() - start) / 1_000_000
    });
  });
}
