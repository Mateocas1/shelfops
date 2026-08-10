import { createHash } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => [key, canonical(child)]));
  }
  if (value === undefined || typeof value === "bigint" || typeof value === "function" || typeof value === "symbol" || typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("Value is not canonical JSON");
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  const encoded = JSON.stringify(canonical(value));
  if (encoded === undefined) throw new Error("Value is not canonical JSON");
  return encoded;
}

export function canonicalJsonLine(value: unknown): string { return `${canonicalJson(value)}\n`; }
export function sha256(value: string | Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
