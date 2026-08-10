import { appendFile, lstat, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { canonicalJson, canonicalJsonLine, sha256 } from "./canonical-json.js";
import { loadApprovedSourceIds } from "./source-ids.js";

export type FileIdentity = { exists: boolean; mode: "regular" | "executable" | null; byteLength: number; sha256: string | null };
export type CandidateManifestEntry = { path: string; state: "missing" | "created" | "deleted" | "unchanged" | "modified"; baseline: FileIdentity; frozen: FileIdentity };
type Result = { status: "passed" | "rolled-back"; exitCode: number; artifactOrOutput: string };
export type SliceEvidenceRecord = { schemaVersion: 1; sliceId: string; recordOrdinal: number; supersedesRecordDigest?: string; sourceIds: string[]; invariant: string; evidenceOwner: string; candidateManifest: CandidateManifestEntry[]; candidateDigest: string; testFile: string; testName: string; command: string; runtimeBoundary: "unit" | "postgresql16" | "fastify" | "minio" | "mailpit" | "playwright" | "process"; environmentPrerequisites: string[]; setupFixture: string; expectedObservable: string; result: Result; changedLines: number; rollbackBoundary: string[]; recordDigest: string };

const digestPattern = /^[a-f0-9]{64}$/;
const requiredKeys = ["schemaVersion", "sliceId", "recordOrdinal", "sourceIds", "invariant", "evidenceOwner", "candidateManifest", "candidateDigest", "testFile", "testName", "command", "runtimeBoundary", "environmentPrerequisites", "setupFixture", "expectedObservable", "result", "changedLines", "rollbackBoundary", "recordDigest"];
const runtimeBoundaries = ["unit", "postgresql16", "fastify", "minio", "mailpit", "playwright", "process"];
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const exactKeys = (value: object, keys: string[]) => Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const normalize = (path: string) => {
  const normalized = path.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!text(normalized) || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized) || normalized.split("/").includes("..")) throw new Error(`Invalid manifest path: ${path}`);
  return normalized;
};

async function identity(root: string, path: string): Promise<FileIdentity> {
  const target = resolve(root, path);
  try {
    const stat = await lstat(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Candidate is not a regular file: ${path}`);
    const bytes = await readFile(target);
    return { exists: true, mode: stat.mode & 0o111 ? "executable" : "regular", byteLength: bytes.byteLength, sha256: sha256(bytes) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { exists: false, mode: null, byteLength: 0, sha256: null };
    throw error;
  }
}

function state(baseline: FileIdentity, frozen: FileIdentity): CandidateManifestEntry["state"] {
  if (!baseline.exists && !frozen.exists) return "missing";
  if (!baseline.exists) return "created";
  if (!frozen.exists) return "deleted";
  return canonicalJson(baseline) === canonicalJson(frozen) ? "unchanged" : "modified";
}

export async function buildCandidateManifest(paths: string[], root: string, baseline?: CandidateManifestEntry[]): Promise<CandidateManifestEntry[]> {
  const normalized = paths.map(normalize).sort();
  if (new Set(normalized).size !== normalized.length) throw new Error("Duplicate candidate path");
  const prior = new Map(baseline?.map((entry) => [entry.path, entry.frozen]));
  return Promise.all(normalized.map(async (path) => {
    const frozen = await identity(root, path);
    const original = prior?.get(path) ?? frozen;
    return { path, state: state(original, frozen), baseline: original, frozen };
  }));
}

export const candidateDigest = (manifest: CandidateManifestEntry[]) => sha256(canonicalJson(manifest));
export function recordDigest(record: object): string { const { recordDigest: _ignored, ...projection } = record as SliceEvidenceRecord; return sha256(canonicalJson(projection)); }

function validIdentity(value: FileIdentity): boolean {
  return value !== null && exactKeys(value, ["exists", "mode", "byteLength", "sha256"]) && typeof value.exists === "boolean" && (value.mode === "regular" || value.mode === "executable" || value.mode === null) && Number.isSafeInteger(value.byteLength) && value.byteLength >= 0 && (value.sha256 === null || digestPattern.test(value.sha256)) && (value.exists ? value.mode !== null && value.sha256 !== null : value.mode === null && value.byteLength === 0 && value.sha256 === null);
}

export function validateRecord(record: SliceEvidenceRecord, knownSourceIds: Set<string>, evidencePath: string): void {
  if (!record || typeof record !== "object") throw new Error("Malformed record");
  const keys = Object.keys(record); const allowed = new Set([...requiredKeys, "supersedesRecordDigest"]);
  if (requiredKeys.some((key) => !keys.includes(key)) || keys.some((key) => !allowed.has(key))) throw new Error("Malformed record fields");
  if (record.schemaVersion !== 1 || !text(record.sliceId) || record.evidenceOwner !== record.sliceId || !Number.isSafeInteger(record.recordOrdinal) || record.recordOrdinal < 1 || !Number.isSafeInteger(record.changedLines) || record.changedLines < 0 || !runtimeBoundaries.includes(record.runtimeBoundary)) throw new Error("Malformed record identity");
  const strings = [record.invariant, record.testFile, record.testName, record.command, record.setupFixture, record.expectedObservable, record.result?.artifactOrOutput];
  if (strings.some((value) => !text(value)) || !Array.isArray(record.environmentPrerequisites) || record.environmentPrerequisites.length === 0 || !record.environmentPrerequisites.every(text) || !Array.isArray(record.rollbackBoundary) || !record.rollbackBoundary.every(text)) throw new Error("Malformed record evidence");
  if (!Array.isArray(record.sourceIds) || new Set(record.sourceIds).size !== record.sourceIds.length || record.sourceIds.some((id) => !knownSourceIds.has(id))) throw new Error("Unknown or duplicate source ID");
  if (!record.result || !exactKeys(record.result, ["status", "exitCode", "artifactOrOutput"]) || !["passed", "rolled-back"].includes(record.result.status) || !Number.isInteger(record.result.exitCode) || record.result.status === "passed" && record.result.exitCode !== 0) throw new Error("Malformed result");
  if (record.supersedesRecordDigest !== undefined && !digestPattern.test(record.supersedesRecordDigest)) throw new Error("Malformed supersession digest");
  if (!Array.isArray(record.candidateManifest)) throw new Error("Malformed candidate manifest");
  let previous = "";
  for (const entry of record.candidateManifest) {
    if (!exactKeys(entry, ["path", "state", "baseline", "frozen"])) throw new Error("Malformed candidate manifest entry");
    const path = normalize(entry.path);
    if (path <= previous || path === normalize(evidencePath)) throw new Error("Candidate manifest order or evidence path inclusion");
    if (!validIdentity(entry.baseline) || !validIdentity(entry.frozen) || entry.state !== state(entry.baseline, entry.frozen)) throw new Error("Malformed candidate identity or state");
    previous = path;
  }
  if (!digestPattern.test(record.candidateDigest) || record.candidateDigest !== candidateDigest(record.candidateManifest)) throw new Error("Candidate digest mismatch");
  if (!digestPattern.test(record.recordDigest) || record.recordDigest !== recordDigest(record)) throw new Error("Record digest mismatch");
}

export function validateHistory(ndjson: string, knownSourceIds: Set<string>, evidencePath: string) {
  const records = ndjson === "" ? [] : ndjson.split("\n").slice(0, -1).map((line, index) => {
    try { const record = JSON.parse(line) as SliceEvidenceRecord; if (line !== canonicalJson(record)) throw new Error("noncanonical"); return record; }
    catch { throw new Error(`Malformed evidence line ${index + 1}`); }
  });
  if (ndjson && !ndjson.endsWith("\n")) throw new Error("Malformed NDJSON newline");
  const byDigest = new Map<string, SliceEvidenceRecord>(); const ordinals = new Set<number>(); const activeHeads = new Map<string, SliceEvidenceRecord>();
  for (const record of records) {
    validateRecord(record, knownSourceIds, evidencePath);
    if (ordinals.has(record.recordOrdinal)) throw new Error("Duplicate record ordinal");
    ordinals.add(record.recordOrdinal);
    const prior = record.supersedesRecordDigest && byDigest.get(record.supersedesRecordDigest);
    if (record.supersedesRecordDigest && (!prior || prior.evidenceOwner !== record.evidenceOwner || activeHeads.get(record.evidenceOwner)?.recordDigest !== prior.recordDigest)) throw new Error("Broken supersession");
    if (prior && record.recordOrdinal <= prior.recordOrdinal) throw new Error("Supersession ordinal must increase");
    if (!record.supersedesRecordDigest && activeHeads.has(record.evidenceOwner)) throw new Error("Missing supersession");
    byDigest.set(record.recordDigest, record); activeHeads.set(record.evidenceOwner, record);
  }
  const activePassingHeads = [...activeHeads.values()].filter(({ result }) => result.status === "passed"); const owners = new Map<string, string>();
  for (const record of activePassingHeads) for (const id of record.sourceIds) { const owner = owners.get(id); if (owner && owner !== record.evidenceOwner) throw new Error(`Conflicting owner for ${id}`); owners.set(id, record.evidenceOwner); }
  return { records, activeHeads, activePassingHeads };
}

export function assertAppendOnly(prior: string, current: string): void { if (!current.startsWith(prior) || current.length <= prior.length) throw new Error("Evidence history is not append-only"); }
export async function assertNoCandidateDrift(record: SliceEvidenceRecord, root: string): Promise<void> {
  validateRecord(record, new Set(record.sourceIds), "docs/acceptance/evidence/never-in-manifest.ndjson");
  for (const entry of record.candidateManifest) if (canonicalJson(await identity(root, entry.path)) !== canonicalJson(entry.frozen)) throw new Error(`Candidate drift: ${entry.path}`);
}
export async function appendEvidence(path: string, record: SliceEvidenceRecord, knownSourceIds: Set<string>, evidencePath: string): Promise<void> {
  let prior = ""; try { prior = await readFile(path, "utf8"); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
  validateHistory(prior + canonicalJsonLine(record), knownSourceIds, evidencePath);
  await appendFile(path, canonicalJsonLine(record), "utf8");
}

async function checkEvidence(): Promise<void> {
  const file = process.argv[2]; if (!file) throw new Error("Usage: traceability:check <evidence.ndjson>");
  const ids = await loadApprovedSourceIds(); validateHistory(await readFile(file, "utf8"), new Set(ids.all.map(({ id }) => id)), file.replace(/\\/g, "/"));
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/evidence-schema.ts")) checkEvidence().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
