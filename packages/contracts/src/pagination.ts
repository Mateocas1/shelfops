import { createHmac, timingSafeEqual } from "node:crypto";

import { Type, type Static } from "@sinclair/typebox";

export const paginationBoundary = "pagination";

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 200;
export const PaginationQuerySchema = Type.Object({
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: MAX_PAGE_SIZE })),
  cursor: Type.Optional(Type.String({ minLength: 1 }))
}, { additionalProperties: false });
export type PaginationQuery = Static<typeof PaginationQuerySchema>;

export interface CursorPayload {
  subject: string;
  filters: string;
  sort: string;
  lastId: string;
  expiresAt: number;
}

export interface CursorContext {
  subject: string;
  filters: string;
  sort: string;
}

export class InvalidCursorError extends Error {}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function isCursorPayload(value: unknown): value is CursorPayload {
  const field = (name: string): unknown => typeof value === "object" && value !== null ? Reflect.get(value, name) : undefined;
  const expiresAt = field("expiresAt");
  return typeof value === "object" && value !== null
    && typeof field("subject") === "string" && typeof field("filters") === "string"
    && typeof field("sort") === "string" && typeof field("lastId") === "string"
    && typeof expiresAt === "number" && Number.isFinite(expiresAt);
}

export function createCursor(payload: CursorPayload, secret: string): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

export function readCursor(token: string, secret: string, context: CursorContext): CursorPayload {
  const [encoded, signature, extra] = token.split(".");
  if (!encoded || !signature || extra) throw new InvalidCursorError("Invalid cursor");
  const expected = Buffer.from(sign(encoded, secret));
  const supplied = Buffer.from(signature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new InvalidCursorError("Invalid cursor");
  let value: unknown;
  try { value = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { throw new InvalidCursorError("Invalid cursor"); }
  if (!isCursorPayload(value) || value.subject !== context.subject || value.filters !== context.filters || value.sort !== context.sort || value.expiresAt <= Date.now()) {
    throw new InvalidCursorError("Invalid cursor");
  }
  return value;
}
