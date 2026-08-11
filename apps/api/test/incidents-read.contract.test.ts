import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, readdir } from "node:fs/promises";

import type { AuthorizedPrincipal } from "@shelfops/application/authorization/authorized-principal";
import { createDevelopmentIdentityProvider, createOpaqueSessionId } from "@shelfops/application/identity/session";
import { createCursor } from "@shelfops/contracts/pagination";
import type { IncidentRead, PostgresAuthorizedIncidentRepository } from "@shelfops/infrastructure/repositories/authorized-incident-repository";

import { buildApi } from "../src/app.js";
import { openApiDocument } from "../src/openapi.js";
import { startApi } from "../src/startup.js";

type IncidentRepository = Pick<PostgresAuthorizedIncidentRepository, "detail" | "list">;
const apps: Awaited<ReturnType<typeof buildApi>>[] = [];
const uuid = (value: number) => `00000000-0000-7000-8000-${String(value).padStart(12, "0")}`;
const ids = { user: uuid(1), otherUser: uuid(2), incident: uuid(3), store: uuid(4), sector: uuid(5), location: uuid(6), team: uuid(7) };
const principal: AuthorizedPrincipal = {
  id: ids.user,
  active: true,
  roleScopes: [{ role: "sector-lead", storeIds: [ids.store], sectorIds: [ids.sector], categoryResponsibilities: [], teamIds: [ids.team] }],
  grants: []
};
const incident: IncidentRead = {
  id: ids.incident,
  organizationId: uuid(8),
  storeId: ids.store,
  sectorId: ids.sector,
  locationId: ids.location,
  category: "equipment-failure",
  severity: "high",
  categoryProvisional: false,
  severityProvisional: false,
  title: "Freezer alarm",
  description: "The freezer temperature is rising.",
  occurredAt: "2026-08-06T01:00:00.000Z",
  reporterId: ids.user,
  assigneeId: ids.otherUser,
  assigneeTeamId: ids.team,
  ownershipGap: false,
  state: "open",
  reopenCount: 0,
  version: 1,
  createdAt: "2026-08-06T01:01:00.000Z",
  updatedAt: "2026-08-06T01:02:00.000Z"
};

const cookie = (sessionId: string) => `shelfops_session=${sessionId}`;
const record = (value: unknown) => value as Record<string, any>;

async function appFor(repository: IncidentRepository, cursorSecret = "incident-cursor-secret", currentPrincipal = principal) {
  const sessionId = createOpaqueSessionId();
  const identityProvider = createDevelopmentIdentityProvider((requestedId) => requestedId === sessionId
    ? { id: sessionId, expiresAt: Date.now() + 60_000, csrfToken: "unused", principal: currentPrincipal }
    : undefined);
  const app = await buildApi({
    configurationExecutor: { execute: async () => { throw new Error("unused"); } },
    cursorSecret,
    identityProvider,
    incidentRepository: repository
  });
  apps.push(app);
  return { app, sessionId };
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
  vi.unstubAllEnvs();
});

describe("scoped incident read API", () => {
  it("uses only the authenticated principal and returns reusable context-bound cursors", async () => {
    const outOfScopeStore = uuid(90);
    const list = vi.fn(async (_principal: AuthorizedPrincipal, query: Parameters<IncidentRepository["list"]>[1]) => query?.cursor
      ? { items: [] }
      : query?.filters?.storeId === outOfScopeStore ? { items: [] }
      : { items: [incident], nextCursor: { updatedAt: incident.updatedAt, id: incident.id } });
    const repository = { list, detail: vi.fn() } satisfies IncidentRepository;
    const { app, sessionId } = await appFor(repository);
    const query = `limit=1&storeId=${ids.store}&sectorId=${ids.sector}&locationId=${ids.location}&state=open&category=equipment-failure&severity=high&assigneeId=${ids.otherUser}&reporterId=${ids.user}&slaCondition=warning&recurrenceDecisionState=confirmed&createdFrom=2026-08-06T01:00:00.000Z&createdTo=2026-08-06T01:01:00.000Z&updatedFrom=2026-08-06T01:01:00.000Z&updatedTo=2026-08-06T01:02:00.000Z`;

    const first = await app.inject({ method: "GET", url: `/api/v1/incidents?${query}`, headers: { cookie: cookie(sessionId) } });
    expect(first.statusCode).toBe(200);
    expect(list).toHaveBeenNthCalledWith(1, principal, { limit: 1, filters: { storeId: ids.store, sectorId: ids.sector, locationId: ids.location, state: "open", category: "equipment-failure", severity: "high", assigneeId: ids.otherUser, reporterId: ids.user, slaCondition: "warning", recurrenceDecisionState: "confirmed", createdFrom: "2026-08-06T01:00:00.000Z", createdTo: "2026-08-06T01:01:00.000Z", updatedFrom: "2026-08-06T01:01:00.000Z", updatedTo: "2026-08-06T01:02:00.000Z" } });
    const body = first.json();
    expect(body).toMatchObject({ items: [{ id: incident.id, storeId: ids.store, state: "open", updatedAt: incident.updatedAt }], limit: 1 });
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(JSON.stringify(body)).not.toContain(incident.organizationId);
    expect(JSON.stringify(body)).not.toContain(ids.team);
    expect(body.nextCursor).not.toContain(incident.updatedAt);
    const outerPayload = JSON.parse(Buffer.from(body.nextCursor.split(".")[0], "base64url").toString("utf8"));
    const decodedPosition = Buffer.from(outerPayload.lastId, "base64url").toString("utf8");
    expect(decodedPosition).not.toContain(incident.updatedAt);
    expect(decodedPosition).not.toContain(incident.id);

    for (let request = 0; request < 2; request += 1) {
      const next = await app.inject({ method: "GET", url: `/api/v1/incidents?${query}&cursor=${encodeURIComponent(body.nextCursor)}`, headers: { cookie: cookie(sessionId) } });
      expect(next.statusCode).toBe(200);
    }
    expect(list).toHaveBeenNthCalledWith(2, principal, { limit: 1, filters: { storeId: ids.store, sectorId: ids.sector, locationId: ids.location, state: "open", category: "equipment-failure", severity: "high", assigneeId: ids.otherUser, reporterId: ids.user, slaCondition: "warning", recurrenceDecisionState: "confirmed", createdFrom: "2026-08-06T01:00:00.000Z", createdTo: "2026-08-06T01:01:00.000Z", updatedFrom: "2026-08-06T01:01:00.000Z", updatedTo: "2026-08-06T01:02:00.000Z" }, cursor: { updatedAt: incident.updatedAt, id: incident.id } });

    const changedFilter = await app.inject({ method: "GET", url: `/api/v1/incidents?${query.replace(`storeId=${ids.store}`, `storeId=${ids.otherUser}`)}&cursor=${encodeURIComponent(body.nextCursor)}`, headers: { cookie: cookie(sessionId) } });
    expect(changedFilter.statusCode).toBe(400);
    expect(changedFilter.json()).toMatchObject({ code: "validation-failed", fields: [{ name: "cursor", code: "invalid" }] });
    const changedRecurrenceState = await app.inject({ method: "GET", url: `/api/v1/incidents?${query.replace("recurrenceDecisionState=confirmed", "recurrenceDecisionState=dismissed")}&cursor=${encodeURIComponent(body.nextCursor)}`, headers: { cookie: cookie(sessionId) } });
    expect(changedRecurrenceState.statusCode).toBe(400);
    expect(changedRecurrenceState.json()).toMatchObject({ code: "validation-failed", fields: [{ name: "cursor", code: "invalid" }] });
    const exposedPosition = createCursor({ subject: ids.user, filters: JSON.stringify({ storeId: ids.store, sectorId: ids.sector, locationId: ids.location, state: "open", category: "equipment-failure", severity: "high", assigneeId: ids.otherUser, reporterId: ids.user, slaCondition: "warning", recurrenceDecisionState: "confirmed", createdFrom: "2026-08-06T01:00:00.000Z", createdTo: "2026-08-06T01:01:00.000Z", updatedFrom: "2026-08-06T01:01:00.000Z", updatedTo: "2026-08-06T01:02:00.000Z" }), sort: "updatedAt:desc,id:asc", lastId: Buffer.from(JSON.stringify({ updatedAt: incident.updatedAt, id: incident.id })).toString("base64url"), expiresAt: Date.now() + 60_000 }, "incident-cursor-secret");
    const exposed = await app.inject({ method: "GET", url: `/api/v1/incidents?${query}&cursor=${encodeURIComponent(exposedPosition)}`, headers: { cookie: cookie(sessionId) } });
    expect(exposed.statusCode).toBe(400);
    expect(exposed.json()).toMatchObject({ code: "validation-failed", fields: [{ name: "cursor", code: "invalid" }] });
    const foreign = createCursor({ subject: ids.otherUser, filters: "{}", sort: "updatedAt:desc,id:asc", lastId: "opaque", expiresAt: Date.now() + 60_000 }, "incident-cursor-secret");
    const foreignSubject = await app.inject({ method: "GET", url: `/api/v1/incidents?cursor=${encodeURIComponent(foreign)}`, headers: { cookie: cookie(sessionId) } });
    expect(foreignSubject.statusCode).toBe(400);
    const injectedAuthority = await app.inject({ method: "GET", url: "/api/v1/incidents?organizationId=attacker&teamId=attacker", headers: { cookie: cookie(sessionId) } });
    expect(injectedAuthority.statusCode).toBe(400);
    const invalidRange = await app.inject({ method: "GET", url: "/api/v1/incidents?createdFrom=2026-08-07T00:00:00.000Z&createdTo=2026-08-06T00:00:00.000Z", headers: { cookie: cookie(sessionId) } });
    expect(invalidRange.json()).toMatchObject({ code: "validation-failed", fields: [{ name: "createdFrom", code: "range" }] });
    const invalidUpdatedRange = await app.inject({ method: "GET", url: "/api/v1/incidents?createdFrom=2026-08-07T00:00:00.000Z&updatedFrom=2026-08-07T00:00:00.000Z&updatedTo=2026-08-06T00:00:00.000Z", headers: { cookie: cookie(sessionId) } });
    expect(invalidUpdatedRange.json()).toMatchObject({ code: "validation-failed", fields: [{ name: "updatedFrom", code: "range" }] });
    for (const [future, invalid] of [["slaCondition", "late"], ["recurrenceDecisionState", "resolved"]] as const) {
      const response = await app.inject({ method: "GET", url: `/api/v1/incidents?${future}=${invalid}`, headers: { cookie: cookie(sessionId) } }); const body = response.json();
      expect(response.statusCode).toBe(400);
      expect(body).toEqual({ code: "validation-failed", message: "Request validation failed", correlationId: expect.any(String), fields: [{ name: future, code: "enum" }] });
      expect(response.headers["x-correlation-id"]).toBe(body.correlationId);
    }
    const outOfScope = await app.inject({ method: "GET", url: `/api/v1/incidents?storeId=${outOfScopeStore}&slaCondition=breached&recurrenceDecisionState=confirmed`, headers: { cookie: cookie(sessionId) } }); const outOfScopeBody = outOfScope.json();
    expect(outOfScope.statusCode).toBe(200);
    expect(outOfScopeBody).toEqual({ items: [], limit: 50, correlationId: expect.any(String) });
    expect(outOfScope.headers["x-correlation-id"]).toBe(outOfScopeBody.correlationId);
    expect(list).toHaveBeenLastCalledWith(principal, { limit: 50, filters: { storeId: outOfScopeStore, slaCondition: "breached", recurrenceDecisionState: "confirmed" } });
    const unauthenticated = await app.inject({ method: "GET", url: "/api/v1/incidents" });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json()).toMatchObject({ code: "authentication-required", correlationId: expect.any(String) });
  });

  it("passes authoritative role-and-scope inputs for supported-filter denials", async () => {
    const inventoryPrincipal: AuthorizedPrincipal = { ...principal, roleScopes: [{ role: "inventory-team", storeIds: [ids.store], sectorIds: [ids.sector], categoryResponsibilities: [], teamIds: [] }] };
    const list = vi.fn(async () => ({ items: [] }));
    const { app, sessionId } = await appFor({ list, detail: vi.fn() }, "incident-cursor-secret", inventoryPrincipal);
    const response = await app.inject({ method: "GET", url: `/api/v1/incidents?storeId=${ids.store}&sectorId=${ids.sector}&category=equipment-failure`, headers: { cookie: cookie(sessionId) } }); const body = response.json();
    expect(response.statusCode).toBe(200);
    expect(body).toEqual({ items: [], limit: 50, correlationId: expect.any(String) });
    expect(response.headers["x-correlation-id"]).toBe(body.correlationId);
    expect(list).toHaveBeenCalledWith(inventoryPrincipal, { limit: 50, filters: { storeId: ids.store, sectorId: ids.sector, category: "equipment-failure" } });
  });

  it("returns visible details and makes hidden and absent identifiers indistinguishable", async () => {
    const deniedId = uuid(98);
    const detail = vi.fn(async (_principal: AuthorizedPrincipal, incidentId: string) => {
      if (incidentId === deniedId) throw new Error("forbidden");
      return incidentId === ids.incident ? incident : undefined;
    });
    const repository = { list: vi.fn(), detail } satisfies IncidentRepository;
    const { app, sessionId } = await appFor(repository);

    const visible = await app.inject({ method: "GET", url: `/api/v1/incidents/${ids.incident}`, headers: { cookie: cookie(sessionId) } });
    expect(visible.statusCode).toBe(200);
    expect(detail).toHaveBeenCalledWith(principal, ids.incident);
    expect(visible.json()).toMatchObject({ id: ids.incident, occurredAt: incident.occurredAt, updatedAt: incident.updatedAt });
    expect(visible.body).not.toContain(incident.organizationId);
    expect(visible.body).not.toContain(ids.team);

    const forbidden = await app.inject({ method: "GET", url: `/api/v1/incidents/${deniedId}`, headers: { cookie: cookie(sessionId) } });
    const hidden = await app.inject({ method: "GET", url: `/api/v1/incidents/${uuid(99)}`, headers: { cookie: cookie(sessionId) } });
    const absent = await app.inject({ method: "GET", url: `/api/v1/incidents/${uuid(100)}`, headers: { cookie: cookie(sessionId) } });
    const hiddenBody = hidden.json();
    const absentBody = absent.json();
    expect(forbidden.json()).toMatchObject({ code: "forbidden" });
    expect([hidden.statusCode, absent.statusCode]).toEqual([404, 404]);
    expect({ code: hiddenBody.code, message: hiddenBody.message }).toEqual({ code: "not-found", message: "Resource not found" });
    expect({ code: absentBody.code, message: absentBody.message }).toEqual({ code: hiddenBody.code, message: hiddenBody.message });
    expect(hiddenBody.correlationId).toEqual(expect.any(String));
    expect(absentBody.correlationId).toEqual(expect.any(String));
    expect(hiddenBody.correlationId).not.toBe(absentBody.correlationId);
    expect(hidden.headers["x-correlation-id"]).toBe(hiddenBody.correlationId);
    expect(absent.headers["x-correlation-id"]).toBe(absentBody.correlationId);
    expect(`${hidden.body}${absent.body}`).not.toContain(incident.title);
    expect(`${hidden.body}${absent.body}`).not.toContain(incident.organizationId);

    const malformed = await app.inject({ method: "GET", url: "/api/v1/incidents/not-a-uuid", headers: { cookie: cookie(sessionId) } });
    expect(malformed.statusCode).toBe(400);
    expect(detail).toHaveBeenCalledTimes(4);
  });

  it("fails closed on production cursor secrets and passes configured entropy to composition", async () => {
    const identityProvider = { kind: "production" as const, lookupSession: async () => undefined };
    const configurationExecutor = { execute: async () => { throw new Error("unused"); } };
    for (const cursorSecret of [undefined, "short", "development-only-cursor-secret"]) {
      vi.stubEnv("CURSOR_SECRET", "");
      await expect(startApi({ port: "invalid", configurationExecutor, identityProvider, cursorSecret: (vi.stubEnv("CURSOR_SECRET", undefined), cursorSecret), buildApi: vi.fn(), logError: vi.fn() })).rejects.toThrow("CURSOR_SECRET must contain at least 32 bytes of secret material");
    }

    const runtime = await buildApi({ configurationExecutor, identityProvider, environment: "test" });
    vi.spyOn(runtime, "listen").mockResolvedValue(undefined);
    apps.push(runtime);
    let captured: string | undefined;
    const configured = "externally-configured-cursor-secret-32-bytes";
    await startApi({ configurationExecutor, identityProvider, dependencyProbe: async () => undefined, cursorSecret: configured, buildApi: async (options) => { captured = options.cursorSecret; return runtime; } });
    expect(captured).toBe(configured);
  });

  it("publishes the live incident read contract and operational guidance without internal authority fields", async () => {
    const fresh = record(await openApiDocument());
    const committed = JSON.parse(await readFile("openapi/openapi.json", "utf8")) as Record<string, unknown>;
    const paths = record(fresh.paths);
    const list = record(record(paths["/api/v1/incidents"]).get);
    const detail = record(record(paths["/api/v1/incidents/{incidentId}"]).get);
    const parameters = Object.fromEntries((list.parameters as Array<Record<string, any>>).map((parameter) => [parameter.name, record(parameter.schema)]));
    const listResponses = record(list.responses); const detailResponses = record(detail.responses);
    const incident = record(record(fresh.components).schemas).Incident as Record<string, any>;
    const apiGuide = await readFile("docs/api-conventions.md", "utf8");
    const developmentGuide = await readFile("docs/development.md", "utf8");
    const incidentGuide = apiGuide.split("## Incident reads")[1]?.split("\n## ")[0] ?? "";
    const cursorConfiguration = developmentGuide.split("## Production cursor configuration")[1]?.split("\n## ")[0] ?? "";

    expect(fresh).toEqual(committed);
    expect(parameters).toMatchObject({ limit: { type: "integer", minimum: 1, maximum: 200, default: 50 }, cursor: { type: "string", minLength: 1 }, storeId: { format: "uuid" }, sectorId: { format: "uuid" }, locationId: { format: "uuid" }, state: { enum: ["open", "classified", "in-progress", "blocked", "resolved"] }, category: { type: "string", minLength: 1 }, severity: { type: "string", minLength: 1 }, assigneeId: { format: "uuid" }, reporterId: { format: "uuid" }, slaCondition: { enum: ["on-track", "warning", "breached", "paused"] }, recurrenceDecisionState: { enum: ["pending", "confirmed", "dismissed"] }, createdFrom: { format: "date-time" }, createdTo: { format: "date-time" }, updatedFrom: { format: "date-time" }, updatedTo: { format: "date-time" } });
    expect(parameters.category.enum).toBeUndefined();
    expect(list.security).toEqual([{ sessionCookie: [] }]);
    expect(detail.security).toEqual([{ sessionCookie: [] }]);
    expect(Object.keys(listResponses)).toEqual(["200", "400", "401", "503"]);
    expect(Object.keys(detailResponses)).toEqual(["200", "400", "401", "403", "404", "503"]);
    expect(incident.required).toContain("category");
    expect(record(record(incident.properties).category)).toEqual({ type: "string", description: "Category key from the organization catalog." });
    expect(JSON.stringify({ list, detail, incident })).not.toMatch(/organizationId|assigneeTeamId|updatedAt:desc|lastId|authorization|predicate|cipher|signature/i);
    for (const internal of [/integrity-signed|signature|encryption|\bsigned\b/i, /organization,\s*store|store,\s*sector|assignee,\s*team|team,\s*role|authority dimensions/i, /repository|keyset|ordering tuple|updatedAt|lastId|\bSQL\b|predicate|hidden-record/i]) expect(incidentGuide).not.toMatch(internal);
    expect(incidentGuide).toMatch(/unknown or nonmatching category keys return an empty authorized result/i);
    expect(incidentGuide).toMatch(/unchanged subject, filters, and sort context/i);
    expect(incidentGuide).toMatch(/authorization context.*authenticated session.*cannot be overridden/i);
    expect(incidentGuide).toMatch(/public responses contain only documented fields/i);
    expect(cursorConfiguration).toMatch(/CURSOR_SECRET.*32 UTF-8 bytes/i);
    expect(cursorConfiguration).toMatch(/rotat(?:e|es|ed|ing|ion)/i);
    expect(cursorConfiguration).toMatch(/invalidat(?:e|es|ed|ing|ion) outstanding cursors/i);
  });

  it("documents all four authoritative read outcomes", async () => {
    const directory = "openapi/examples/incidents-read";
    expect((await readdir(directory)).sort()).toEqual(["allowed-combined.json", "denied-out-of-scope.json", "hidden-detail.json", "validation-failed.json"]);
    const allowed = record(JSON.parse(await readFile(`${directory}/allowed-combined.json`, "utf8")));
    const denied = record(JSON.parse(await readFile(`${directory}/denied-out-of-scope.json`, "utf8")));
    const hidden = record(JSON.parse(await readFile(`${directory}/hidden-detail.json`, "utf8")));
    const validation = record(JSON.parse(await readFile(`${directory}/validation-failed.json`, "utf8")));
    const guide = await readFile("docs/incident-reads.md", "utf8");
    expect(record(allowed.request).path).toMatch(/storeId=.*sectorId=.*state=.*slaCondition=warning.*recurrenceDecisionState=confirmed.*createdFrom=.*updatedTo=/);
    expect(record(allowed.response)).toMatchObject({ status: 200 }); expect(record(record(allowed.response).body).items).toEqual([expect.objectContaining({ storeId: ids.store, sectorId: ids.sector, state: "open" })]);
    expect(record(denied.request).path).toMatch(/storeId=00000000-0000-7000-8000-000000000090&slaCondition=breached&recurrenceDecisionState=confirmed$/);
    expect(record(denied.response)).toEqual({ status: 200, body: { items: [], limit: 50, correlationId: "example-correlation" } });
    expect(record(hidden.request).path).toMatch(/\/incidents\/00000000-0000-7000-8000-000000000099$/);
    expect(record(hidden.response)).toEqual({ status: 404, body: { code: "not-found", message: "Resource not found", correlationId: "example-correlation" } });
    expect(record(validation.request).path).toBe("/api/v1/incidents?slaCondition=late&recurrenceDecisionState=resolved");
    expect(record(validation.response)).toEqual({ status: 400, body: { code: "validation-failed", message: "Request validation failed", correlationId: "example-correlation", fields: [{ name: "slaCondition", code: "enum" }, { name: "recurrenceDecisionState", code: "enum" }] } });
    expect(guide).toMatch(/storeId.*sectorId.*locationId.*category.*severity.*state.*assigneeId.*reporterId/s);
    expect(guide).toMatch(/slaCondition.*on-track.*warning.*breached.*paused/s);
    expect(guide).toMatch(/recurrenceDecisionState.*pending.*confirmed.*dismissed/s);
    expect(guide).toMatch(/createdFrom.*createdTo.*updatedFrom.*updatedTo/s);
    expect(guide).toMatch(/Allowed combined[\s\S]*Denied out of scope[\s\S]*Hidden detail[\s\S]*Validation failure/);
    expect(guide).not.toMatch(/intentionally unavailable|rejected as unknown/i);
    expect(`${JSON.stringify(allowed)}${JSON.stringify(denied)}${JSON.stringify(hidden)}${JSON.stringify(validation)}${guide}`).not.toMatch(/organizationId|assigneeTeamId|scope snapshot/i);
  });
});
