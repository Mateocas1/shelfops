import swagger from "@fastify/swagger";
import { createCursor, readCursor } from "@shelfops/contracts/pagination";
import type { FastifyInstance } from "fastify";

import { buildApi } from "./app.js";
import { registerErrorHandling, ValidationError } from "./error-handler.js";
import { ApiRootSchema, defaultPage, type ApiQuery, type ApiRootResponse } from "./schemas.js";

export { TemporaryUnavailableError } from "./error-handler.js";

export interface ApiFoundationOptions { cursorSecret?: string; subject?: string; }
const apiRootCursorContext = { filters: "all", sort: "id:asc" };
type OpenApiRecord = Record<string, any>;

function rejectUnknownQuery(url: string | undefined): void {
  const query = new URL(url ?? "/", "http://shelfops.invalid").searchParams;
  for (const name of query.keys()) {
    if (name !== "limit" && name !== "cursor") throw new ValidationError([{ name, code: "unknown" }]);
  }
}

export async function registerApiFoundation(app: FastifyInstance, options: ApiFoundationOptions = {}): Promise<void> {
  const cursorSecret = options.cursorSecret ?? "development-only-cursor-secret";
  const subject = options.subject ?? "test-user";
  await app.register(swagger, {
    openapi: { openapi: "3.1.0", info: { title: "ShelfOps API", version: "1.0.0" }, components: { securitySchemes: { sessionCookie: { type: "apiKey", in: "cookie", name: "shelfops_session" } } } },
    transform: ({ schema, url }) => ({ schema: url === "/health" || url === "/ready" || url === "/api/v1/me" ? { ...schema, hide: true } : schema, url })
  });
  registerErrorHandling(app);
  app.get<{ Querystring: ApiQuery }>("/api/v1", { schema: ApiRootSchema, onRequest: async (request) => rejectUnknownQuery(request.raw.url) }, async (request): Promise<ApiRootResponse> => {
    const cursor = request.query.cursor ? readCursor(request.query.cursor, cursorSecret, { subject, ...apiRootCursorContext }) : undefined;
    return { apiVersion: "v1", correlationId: request.id, limit: defaultPage(request.query), ...(cursor ? { cursor: createCursor(cursor, cursorSecret) } : {}) };
  });
}

export async function openApiDocument(): Promise<object> {
  const unavailable = async () => { throw new Error("Documentation-only executor"); };
  const triageAuthoritySource = { triage: unavailable };
  const app = await buildApi({ configurationExecutor: { execute: unavailable }, incidentCreationExecutor: { execute: unavailable }, triageAuthorityExecutor: { execute: unavailable, decide: unavailable }, triageAuthoritySource, slaPolicyExecutor: { execute: unavailable }, recurrenceDecisionExecutor: { execute: unavailable }, incidentRepository: { list: async () => ({ items: [] }), detail: async () => undefined } });
  await app.ready();
  const document = app.swagger() as OpenApiRecord;
  const list = document.paths["/api/v1/incidents"].get; const detail = document.paths["/api/v1/incidents/{incidentId}"].get;
  const listSchema = list.responses["200"].content["application/json"].schema;
  const incident = { ...listSchema.properties.items.items }; delete incident.additionalProperties;
  document.components.schemas = { Incident: incident };
  listSchema.properties.items.items = { $ref: "#/components/schemas/Incident", unevaluatedProperties: false };
  detail.responses["200"].content["application/json"].schema = { allOf: [{ $ref: "#/components/schemas/Incident" }, { type: "object", properties: { correlationId: { type: "string" } }, required: ["correlationId"] }], unevaluatedProperties: false };
  const shared = { "400": "#/paths/~1api~1v1/get/responses/400", "401": "#/paths/~1api~1v1~1stores~1{storeId}~1locations~1{locationId}~1configuration/post/responses/401", "503": "#/paths/~1api~1v1/get/responses/503" };
  for (const [status, $ref] of Object.entries(shared)) { list.responses[status] = { $ref }; detail.responses[status] = { $ref }; }
  detail.responses["404"] = { $ref: "#/paths/~1api~1v1~1stores~1{storeId}~1locations~1{locationId}~1configuration/post/responses/404" };
  const { components, ...contract } = document;
  await app.close();
  return { ...contract, components };
}
