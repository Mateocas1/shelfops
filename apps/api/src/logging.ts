import type { FastifyInstance, FastifyRequest } from "fastify";

const LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = typeof LEVELS[number];
type Fields = Record<string, unknown>;

export interface ApiLogger {
  info(event: string, fields?: Fields): void;
  error(event: string, error: unknown, fields?: Fields): void;
}

export function validateLogLevel(value = "info"): LogLevel {
  if (!LEVELS.includes(value as LogLevel)) throw new Error(`LOG_LEVEL must be one of: ${LEVELS.join(", ")}`);
  return value as LogLevel;
}

export function safeCorrelationId(value: unknown, fallback: string): string {
  return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value) ? value : fallback;
}

function safeError(event: string, error: unknown): Fields {
  const value = error instanceof Error ? error : undefined;
  const code = value && "code" in value && typeof value.code === "string" ? value.code : undefined;
  return { type: value?.name ?? "Error", ...(code ? { code } : {}), message: event.startsWith("startup.") ? "Startup failed" : event.startsWith("shutdown.") ? "Shutdown failed" : "Request failed" };
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

export function createApiLogger(options: { environment: string; release: string; level?: string; write?: (line: string) => void }): ApiLogger {
  const level = validateLogLevel(options.level);
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  const emit = (eventLevel: LogLevel, event: string, fields: Fields = {}) => {
    if (LEVELS.indexOf(eventLevel) < LEVELS.indexOf(level)) return;
    write(`${JSON.stringify(sanitize({ event, level: eventLevel, timestamp: new Date().toISOString(), service: "shelfops-api", release: options.release, environment: options.environment, ...fields }))}\n`);
  };
  return { info: (event, fields) => emit("info", event, fields), error: (event, error, fields) => emit("error", event, { ...fields, error: safeError(event, error) }) };
}

export function registerRequestLogging(app: FastifyInstance, logger: ApiLogger): void {
  const started = new WeakMap<FastifyRequest, bigint>();
  app.addHook("onRequest", async (request) => { started.set(request, process.hrtime.bigint()); });
  app.addHook("onError", async (request, _reply, error) => {
    logger.error("request.failed", error, { requestId: request.id, correlationId: request.id, method: request.method, path: request.url.split("?", 1)[0] });
  });
  app.addHook("onResponse", async (request, reply) => {
    const start = started.get(request) ?? process.hrtime.bigint();
    logger.info("request.completed", {
      requestId: request.id,
      correlationId: request.id,
      method: request.method,
      path: request.url.split("?", 1)[0],
      statusCode: reply.statusCode,
      elapsedMs: Number(process.hrtime.bigint() - start) / 1_000_000
    });
  });
}
