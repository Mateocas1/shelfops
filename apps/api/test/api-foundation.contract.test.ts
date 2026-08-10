import "@shelfops/contracts/common";
import "@shelfops/contracts/errors";
import { createCursor } from "@shelfops/contracts/pagination";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import {
  TemporaryUnavailableError,
  openApiDocument,
  registerApiFoundation
} from "../src/openapi.js";
import { buildApi } from "../src/app.js";

async function foundation() {
  const app = Fastify();
  await registerApiFoundation(app, { cursorSecret: "contract-secret" });
  return app;
}

function signedCursor(payload: object): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", "contract-secret").update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function response(document: Record<string, unknown>, status: string): Record<string, unknown> | undefined {
  const paths = record(document.paths);
  const root = paths && record(paths["/api/v1"]);
  const get = root && record(root.get);
  const responses = get && record(get.responses);
  return responses && record(responses[status]);
}

function errorCode(document: Record<string, unknown>, status: string): unknown {
  const statusResponse = response(document, status);
  const content = statusResponse && record(statusResponse.content);
  const json = content && record(content["application/json"]);
  const schema = json && record(json.schema);
  const properties = schema && record(schema.properties);
  const code = properties && record(properties.code);
  return code?.enum;
}

function correlationHeader(document: Record<string, unknown>, status: string): unknown {
  return response(document, status)?.headers && record(response(document, status)?.headers)?.["X-Correlation-Id"];
}

describe("API foundation", () => {
  it("composes the real runtime foundation and sole configuration route once", async () => {
    const app = await buildApi({ configurationExecutor: { execute: async () => { throw new Error("inert"); } } });

    expect((await app.inject("/health")).json()).toEqual({ status: "ok" });
    expect((await app.inject("/api/v1/me")).statusCode).toBe(401);
    expect((await app.inject("/api/v1")).json()).toMatchObject({ apiVersion: "v1", limit: 50, correlationId: expect.any(String) });
    expect(app.printRoutes().split("\n").filter((route) => route.includes("configuration"))).toHaveLength(1);
    await app.close();
  });

  it("publishes /api/v1 with a correlation ID and documented 50/200 pagination bounds", async () => {
    const app = await foundation();
    const cursor = createCursor({ subject: "test-user", filters: "all", sort: "id:asc", lastId: "incident-1", expiresAt: Number.MAX_SAFE_INTEGER }, "contract-secret");
    const defaultPage = await app.inject("/api/v1");
    const maximumPage = await app.inject(`/api/v1?limit=200&cursor=${encodeURIComponent(cursor)}`);

    expect(defaultPage.statusCode).toBe(200);
    expect(defaultPage.headers["x-correlation-id"]).toEqual(expect.any(String));
    expect(defaultPage.json()).toMatchObject({ limit: 50, correlationId: expect.any(String) });
    expect(maximumPage.json()).toMatchObject({ limit: 200, cursor: expect.any(String) });
    const responseCursor = maximumPage.json<{ cursor: unknown }>().cursor;
    if (typeof responseCursor !== "string") throw new Error("Response cursor must be an opaque string");
    expect(responseCursor).not.toContain("incident-1");
    expect((await app.inject(`/api/v1?cursor=${encodeURIComponent(responseCursor)}`)).statusCode).toBe(200);
    await app.close();
  });

  it("returns stable field details for invalid pagination and query input", async () => {
    const app = await foundation();
    const unknown = await app.inject("/api/v1?unexpected=true");
    const anotherUnknown = await app.inject("/api/v1?unsupported=true");
    const tooLarge = await app.inject("/api/v1?limit=201");
    const expired = createCursor({ subject: "test-user", filters: "all", sort: "id:asc", lastId: "old", expiresAt: 0 }, "contract-secret");
    const subjectMismatch = createCursor({ subject: "other-user", filters: "all", sort: "id:asc", lastId: "other", expiresAt: Number.MAX_SAFE_INTEGER }, "contract-secret");
    const filterMismatch = createCursor({ subject: "test-user", filters: "open", sort: "id:asc", lastId: "filtered", expiresAt: Number.MAX_SAFE_INTEGER }, "contract-secret");
    const sortMismatch = createCursor({ subject: "test-user", filters: "all", sort: "createdAt:desc", lastId: "sorted", expiresAt: Number.MAX_SAFE_INTEGER }, "contract-secret");
    const missingExpiry = signedCursor({ subject: "test-user", filters: "all", sort: "id:asc", lastId: "legacy" });

    expect(unknown.json()).toMatchObject({ code: "validation-failed", correlationId: expect.any(String), fields: [{ name: "unexpected", code: "unknown" }] });
    expect(unknown.headers["x-correlation-id"]).toEqual(expect.any(String));
    expect(anotherUnknown.json()).toMatchObject({ code: "validation-failed", fields: [{ name: "unsupported", code: "unknown" }] });
    expect(tooLarge.json()).toMatchObject({ code: "validation-failed", fields: [{ name: "limit", code: "maximum" }] });
    expect((await app.inject(`/api/v1?cursor=${expired}`)).json()).toMatchObject({ code: "validation-failed", fields: [{ name: "cursor", code: "invalid" }] });
    for (const cursor of [subjectMismatch, filterMismatch, sortMismatch, missingExpiry, "malformed", `${subjectMismatch}x`]) {
      expect((await app.inject(`/api/v1?cursor=${encodeURIComponent(cursor)}`)).json()).toMatchObject({ code: "validation-failed", correlationId: expect.any(String), fields: [{ name: "cursor", code: "invalid" }] });
    }
    await app.close();
  });

  it("maps only temporary failures to 503 and sends correlation headers", async () => {
    const app = await foundation();
    app.get("/temporary", () => { throw new TemporaryUnavailableError(); });
    const unavailable = await app.inject("/temporary");

    expect(unavailable.statusCode).toBe(503);
    expect(unavailable.headers["x-correlation-id"]).toEqual(expect.any(String));
    expect(unavailable.json()).toMatchObject({ code: "temporarily-unavailable", correlationId: expect.any(String) });
    await app.close();
  });

  it("keeps fresh and committed OpenAPI at the exact sole configuration operation", async () => {
    const fresh = await openApiDocument() as Record<string, unknown>;
    const committed = JSON.parse(await readFile("openapi/openapi.json", "utf8")) as Record<string, unknown>;
    const paths = record(fresh.paths);
    const configurationPaths = Object.keys(paths ?? {}).filter((path) => path.includes("configuration"));
    const operation = paths && record(paths["/api/v1/stores/{storeId}/locations/{locationId}/configuration"])?.post;
    const responses = record(record(operation)?.responses);

    expect(fresh).toEqual(committed);
    expect(configurationPaths).toEqual(["/api/v1/stores/{storeId}/locations/{locationId}/configuration"]);
    expect(record(operation)?.requestBody).toBeDefined();
    expect(Object.keys(responses ?? {})).toEqual(["200", "400", "401", "403", "404", "409", "503"]);
    expect(JSON.stringify(fresh)).not.toMatch(/organization.*configuration|generic.*target/i);
    expect(fresh.openapi).toBe("3.1.0");
    expect(errorCode(fresh, "400")).toEqual(["validation-failed"]);
    expect(errorCode(fresh, "503")).toEqual(["temporarily-unavailable"]);
    for (const status of ["200", "400", "503"]) {
      expect(correlationHeader(fresh, status)).toMatchObject({ schema: { type: "string" } });
    }
  });

});
