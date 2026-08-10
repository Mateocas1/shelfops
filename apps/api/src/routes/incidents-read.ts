import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { IdentityProvider } from "@shelfops/application/ports/identity-provider";
import { AuthenticationRequiredErrorSchema, ForbiddenErrorSchema, NotFoundErrorSchema, TemporaryUnavailableErrorSchema, ValidationErrorSchema } from "@shelfops/contracts/errors";
import { createCursor, DEFAULT_PAGE_SIZE, InvalidCursorError, MAX_PAGE_SIZE, readCursor, type CursorContext } from "@shelfops/contracts/pagination";
import type { IncidentCursor, IncidentFilters, IncidentRead, PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";

import { createReadGuard } from "../auth/session-boundary.js";
import { ValidationError } from "../error-handler.js";

type IncidentRepository = Pick<PostgresAuthorizedIncidentRepository, "detail" | "list">;
type IncidentQuery = Readonly<{ limit?: number; cursor?: string; storeId?: string; sectorId?: string; locationId?: string; state?: IncidentFilters["state"]; category?: string; severity?: string; assigneeId?: string; reporterId?: string; slaCondition?: IncidentFilters["slaCondition"]; recurrenceDecisionState?: IncidentFilters["recurrenceDecisionState"]; createdFrom?: string; createdTo?: string; updatedFrom?: string; updatedTo?: string }>;
type IncidentParams = { incidentId: string };
const sort = "updatedAt:desc,id:asc";
const allowedQuery = new Set(["limit", "cursor", "storeId", "sectorId", "locationId", "state", "category", "severity", "assigneeId", "reporterId", "slaCondition", "recurrenceDecisionState", "createdFrom", "createdTo", "updatedFrom", "updatedTo"]);
const states = ["open", "classified", "in-progress", "blocked", "resolved"];
const slaConditions = ["on-track", "warning", "breached", "paused"];
const recurrenceDecisionStates = ["pending", "confirmed", "dismissed"];
const correlationHeader = { type: "string", description: "Server-generated identifier for support correlation." };
const uuid = { type: "string", format: "uuid" };
const timestamp = { type: "string", format: "date-time" };
const incidentProperties = {
  id: uuid, storeId: uuid, sectorId: uuid, locationId: uuid, productId: uuid,
  category: { type: "string", description: "Category key from the organization catalog." }, severity: { type: "string" }, categoryProvisional: { type: "boolean" }, severityProvisional: { type: "boolean" },
  title: { type: "string" }, description: { type: "string" }, occurredAt: timestamp, reporterId: uuid, assigneeId: uuid,
  ownershipGap: { type: "boolean" }, state: { type: "string", enum: states }, reopenCount: { type: "integer" }, version: { type: "integer" },
  createdAt: timestamp, updatedAt: timestamp
} as const;
const incidentRequired = ["id", "storeId", "sectorId", "locationId", "category", "severity", "categoryProvisional", "severityProvisional", "title", "description", "occurredAt", "reporterId", "ownershipGap", "state", "reopenCount", "version", "createdAt", "updatedAt"];
const incidentSchema = { type: "object", additionalProperties: false, properties: incidentProperties, required: incidentRequired };
const response = (schema: object) => ({ ...schema, headers: { "X-Correlation-Id": correlationHeader } });

export interface IncidentReadRouteDependencies {
  cursorSecret: string;
  identityProvider?: IdentityProvider;
  repository: IncidentRepository;
}

function publicIncident(value: IncidentRead) {
  return {
    id: value.id, storeId: value.storeId, sectorId: value.sectorId, locationId: value.locationId, ...(value.productId ? { productId: value.productId } : {}),
    category: value.category, severity: value.severity, categoryProvisional: value.categoryProvisional, severityProvisional: value.severityProvisional,
    title: value.title, description: value.description, occurredAt: value.occurredAt, reporterId: value.reporterId, ...(value.assigneeId ? { assigneeId: value.assigneeId } : {}),
    ownershipGap: value.ownershipGap, state: value.state, reopenCount: value.reopenCount, version: value.version, createdAt: value.createdAt, updatedAt: value.updatedAt
  };
}

async function rejectUnknownQuery(request: FastifyRequest): Promise<void> {
  const query = new URL(request.raw.url ?? "/", "http://shelfops.invalid").searchParams;
  const fields = [...query.keys()].filter((name) => !allowedQuery.has(name)).map((name) => ({ name, code: "unknown" }));
  if (fields.length > 0) throw new ValidationError(fields);
}

function validateRanges(query: IncidentQuery): void {
  for (const [name, from, to] of [["createdFrom", query.createdFrom, query.createdTo], ["updatedFrom", query.updatedFrom, query.updatedTo]] as const) {
    if (from && to && Date.parse(from) > Date.parse(to)) throw new ValidationError([{ name, code: "range" }]);
  }
}

async function validateQuery(request: FastifyRequest): Promise<void> {
  await rejectUnknownQuery(request);
  validateRanges(request.query as IncidentQuery);
}

function filters(query: IncidentQuery): IncidentFilters | undefined {
  const value = { storeId: query.storeId, sectorId: query.sectorId, locationId: query.locationId, state: query.state, category: query.category, severity: query.severity, assigneeId: query.assigneeId, reporterId: query.reporterId, slaCondition: query.slaCondition, recurrenceDecisionState: query.recurrenceDecisionState, createdFrom: query.createdFrom, createdTo: query.createdTo, updatedFrom: query.updatedFrom, updatedTo: query.updatedTo };
  return Object.values(value).some((entry) => entry !== undefined) ? value : undefined;
}

function context(subject: string, selectedFilters: IncidentFilters | undefined) {
  return { subject, filters: JSON.stringify(selectedFilters ?? {}), sort };
}

function positionKey(secret: string): Buffer {
  return createHash("sha256").update("shelfops:incident-position:v1\0").update(secret).digest();
}

function packCursor(value: IncidentCursor, secret: string, cursorContext: CursorContext): string {
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", positionKey(secret), nonce);
  cipher.setAAD(Buffer.from(JSON.stringify(cursorContext)));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]).toString("base64url");
}

function unpackCursor(value: string, secret: string, cursorContext: CursorContext): IncidentCursor {
  try {
    const sealed = Buffer.from(value, "base64url");
    if (sealed.length <= 28) throw new Error();
    const decipher = createDecipheriv("aes-256-gcm", positionKey(secret), sealed.subarray(0, 12));
    decipher.setAAD(Buffer.from(JSON.stringify(cursorContext)));
    decipher.setAuthTag(sealed.subarray(12, 28));
    const parsed: unknown = JSON.parse(Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString("utf8"));
    if (!parsed || typeof parsed !== "object" || typeof Reflect.get(parsed, "updatedAt") !== "string" || typeof Reflect.get(parsed, "id") !== "string") throw new Error();
    return { updatedAt: Reflect.get(parsed, "updatedAt") as string, id: Reflect.get(parsed, "id") as string };
  } catch { throw new InvalidCursorError("Invalid cursor"); }
}

export async function registerIncidentReadRoutes(app: FastifyInstance, dependencies: IncidentReadRouteDependencies): Promise<void> {
  const readGuard = createReadGuard(dependencies.identityProvider);
  app.get<{ Querystring: IncidentQuery }>("/api/v1/incidents", {
    preValidation: validateQuery,
    preHandler: readGuard,
    schema: {
      summary: "List visible incidents", security: [{ sessionCookie: [] }],
      querystring: { type: "object", additionalProperties: false, properties: { limit: { type: "integer", minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE }, cursor: { type: "string", minLength: 1, description: "Opaque continuation cursor; reuse only with the same session subject, filters, and fixed updated-time order." }, storeId: uuid, sectorId: uuid, locationId: uuid, state: { type: "string", enum: states }, category: { type: "string", minLength: 1, description: "Exact catalog category key; unknown or nonmatching keys return an empty authorized result." }, severity: { type: "string", minLength: 1 }, assigneeId: uuid, reporterId: uuid, slaCondition: { type: "string", enum: slaConditions }, recurrenceDecisionState: { type: "string", enum: recurrenceDecisionStates }, createdFrom: timestamp, createdTo: timestamp, updatedFrom: timestamp, updatedTo: timestamp } },
      response: { 200: response({ type: "object", additionalProperties: false, properties: { items: { type: "array", items: incidentSchema }, limit: { type: "integer" }, nextCursor: { type: "string", description: "Opaque continuation cursor present only when more rows exist." }, correlationId: { type: "string" } }, required: ["items", "limit", "correlationId"] }), 400: response(ValidationErrorSchema), 401: response(AuthenticationRequiredErrorSchema), 503: response(TemporaryUnavailableErrorSchema) }
    }
  }, async (request) => {
    if (!request.principal) throw new Error("forbidden");
    const selectedFilters = filters(request.query);
    const cursorContext = context(request.principal.id, selectedFilters);
    const cursorPayload = request.query.cursor ? readCursor(request.query.cursor, dependencies.cursorSecret, cursorContext) : undefined;
    const limit = request.query.limit ?? DEFAULT_PAGE_SIZE;
    const result = await dependencies.repository.list(request.principal, { limit, ...(selectedFilters ? { filters: selectedFilters } : {}), ...(cursorPayload ? { cursor: unpackCursor(cursorPayload.lastId, dependencies.cursorSecret, cursorContext) } : {}) });
    const nextCursor = result.nextCursor ? createCursor({ ...cursorContext, lastId: packCursor(result.nextCursor, dependencies.cursorSecret, cursorContext), expiresAt: Date.now() + 15 * 60_000 }, dependencies.cursorSecret) : undefined;
    return { items: result.items.map(publicIncident), limit, ...(nextCursor ? { nextCursor } : {}), correlationId: request.id };
  });

  app.get<{ Params: IncidentParams }>("/api/v1/incidents/:incidentId", {
    preHandler: readGuard,
    schema: { summary: "Get a visible incident", security: [{ sessionCookie: [] }], params: { type: "object", additionalProperties: false, properties: { incidentId: uuid }, required: ["incidentId"] }, response: { 200: response({ ...incidentSchema, properties: { ...incidentProperties, correlationId: { type: "string" } }, required: [...incidentRequired, "correlationId"] }), 400: response(ValidationErrorSchema), 401: response(AuthenticationRequiredErrorSchema), 403: response(ForbiddenErrorSchema), 404: response(NotFoundErrorSchema), 503: response(TemporaryUnavailableErrorSchema) } }
  }, async (request) => {
    if (!request.principal) throw new Error("forbidden");
    const incident = await dependencies.repository.detail(request.principal, request.params.incidentId);
    if (!incident) throw new Error("not-found");
    return { ...publicIncident(incident), correlationId: request.id };
  });
}
