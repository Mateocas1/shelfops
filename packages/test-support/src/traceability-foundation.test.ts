import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { canonicalJson, canonicalJsonLine, sha256 } from "../../../scripts/traceability/canonical-json.js";
import { appendEvidence, assertAppendOnly, assertNoCandidateDrift, buildCandidateManifest, candidateDigest, recordDigest, validateHistory, validateRecord, type SliceEvidenceRecord } from "../../../scripts/traceability/evidence-schema.js";
import { loadApprovedSourceIds, parseSourceCorpus } from "../../../scripts/traceability/source-ids.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shelfops-trace-")); roots.push(root);
  const path = join(root, "candidate.txt");
  const baseline = await buildCandidateManifest(["candidate.txt", "absent.txt"], root);
  await writeFile(path, "frozen\n");
  const manifest = await buildCandidateManifest(["candidate.txt", "absent.txt"], root, baseline);
  const sourceIds = new Set(["REQ-test-foundation"]);
  const base = {
    schemaVersion: 1 as const, sliceId: "T0", recordOrdinal: 1,
    sourceIds: [...sourceIds], invariant: "Traceability evidence is deterministic",
    evidenceOwner: "T0", candidateManifest: manifest, candidateDigest: candidateDigest(manifest),
    testFile: "packages/test-support/src/traceability-foundation.test.ts", testName: "traceability evidence",
    command: "pnpm test:unit -- traceability-foundation", runtimeBoundary: "unit" as const,
    environmentPrerequisites: ["Node 22", "pnpm"], setupFixture: "temporary candidate files",
    expectedObservable: "validated canonical evidence", result: { status: "passed" as const, exitCode: 0, artifactOrOutput: "tests passed" },
    changedLines: 1, rollbackBoundary: ["candidate.txt", "evidence/T0.ndjson"]
  };
  const record = { ...base, recordDigest: recordDigest(base) };
  return { root, path, sourceIds, record };
}

describe("T0 traceability foundation", () => {
  it("parses stable, collision-free approved source identities", async () => {
    const corpus = await loadApprovedSourceIds();
    expect(corpus.proposal).toHaveLength(10);
    expect(corpus.requirements).toHaveLength(75);
    expect(corpus.scenarios).toHaveLength(134);
    expect(new Set(corpus.all.map(({ id }) => id)).size).toBe(219);
    expect((await loadApprovedSourceIds()).all).toEqual(corpus.all);
    expect(() => parseSourceCorpus("## Proposal-Level Acceptance Boundaries\n- duplicate\n- duplicate", {})).toThrow();
    expect(() => parseSourceCorpus("## Proposal-Level Acceptance Boundaries\n- only one", { "bad/spec.md": "#### Scenario: orphan" })).toThrow();
  });

  it("canonicalizes recursively without sorting arrays or hiding newline differences", () => {
    expect(canonicalJson({ z: [{ b: 2, a: 1 }, 0], a: "x" })).toBe('{"a":"x","z":[{"a":1,"b":2},0]}');
    expect(canonicalJsonLine({ b: 2, a: 1 })).toBe('{"a":1,"b":2}\n');
    expect(sha256("x\n")).not.toBe(sha256("x"));
  });

  it("freezes a sorted non-evidence manifest and rejects drift or evidence inclusion", async () => {
    const { root, path, sourceIds, record } = await fixture();
    expect(record.candidateManifest.map(({ path }) => path)).toEqual(["absent.txt", "candidate.txt"]);
    expect(record.candidateManifest.map(({ state }) => state)).toEqual(["missing", "created"]);
    await expect(assertNoCandidateDrift(record, root)).resolves.toBeUndefined();
    await writeFile(path, "drift\n");
    await expect(assertNoCandidateDrift(record, root)).rejects.toThrow("drift");
    const poisoned = { ...record, candidateManifest: [...record.candidateManifest, { ...record.candidateManifest[0]!, path: "evidence/T0.ndjson" }] };
    expect(() => validateRecord(poisoned, sourceIds, "evidence/T0.ndjson")).toThrow("evidence path");
  });

  it("hashes neither digest through itself and validates append-only supersession", async () => {
    const { root, sourceIds, record } = await fixture();
    expect(record.recordDigest).toBe(recordDigest(record));
    expect(record.candidateDigest).toBe(candidateDigest(record.candidateManifest));
    const file = join(root, "T0.ndjson");
    await appendEvidence(file, record, sourceIds, "evidence/T0.ndjson");
    const prior = await readFile(file, "utf8");
    const correctionBase = { ...record, recordOrdinal: 2, supersedesRecordDigest: record.recordDigest, result: { ...record.result, artifactOrOutput: "corrected pass" } };
    const correction = { ...correctionBase, recordDigest: recordDigest(correctionBase) };
    await appendEvidence(file, correction, sourceIds, "evidence/T0.ndjson");
    const history = validateHistory(await readFile(file, "utf8"), sourceIds, "evidence/T0.ndjson");
    expect(history.activeHeads.get("T0")?.recordDigest).toBe(correction.recordDigest);
    expect(() => assertAppendOnly(prior, canonicalJsonLine(correction))).toThrow("append-only");
  });

  it("requires supersession ordinals to increase strictly", async () => {
    const { sourceIds, record } = await fixture();
    const initialBase = { ...record, recordOrdinal: 2 };
    const initial = { ...initialBase, recordDigest: recordDigest(initialBase) };
    const superseding = (recordOrdinal: number) => {
      const base = { ...record, recordOrdinal, supersedesRecordDigest: initial.recordDigest };
      return { ...base, recordDigest: recordDigest(base) };
    };
    expect(() => validateHistory(canonicalJsonLine(initial) + canonicalJsonLine(superseding(2)), sourceIds, "evidence/T0.ndjson")).toThrow(/ordinal/i);
    expect(() => validateHistory(canonicalJsonLine(initial) + canonicalJsonLine(superseding(1)), sourceIds, "evidence/T0.ndjson")).toThrow(/ordinal/i);
    expect(validateHistory(canonicalJsonLine(initial) + canonicalJsonLine(superseding(3)), sourceIds, "evidence/T0.ndjson").activeHeads.get("T0")?.recordOrdinal).toBe(3);
  });

  it("rejects duplicate ordinals, broken supersession, owner conflict, rollback heads, and malformed records", async () => {
    const { sourceIds, record } = await fixture();
    const line = canonicalJsonLine(record);
    expect(() => validateHistory(line + line, sourceIds, "evidence/T0.ndjson")).toThrow("ordinal");
    const brokenBase = { ...record, recordOrdinal: 2, supersedesRecordDigest: "0".repeat(64) };
    const broken = { ...brokenBase, recordDigest: recordDigest(brokenBase) };
    expect(() => validateHistory(line + canonicalJsonLine(broken), sourceIds, "evidence/T0.ndjson")).toThrow("supersession");
    const otherBase = { ...record, sliceId: "X", evidenceOwner: "X", recordOrdinal: 2 };
    const other = { ...otherBase, recordDigest: recordDigest(otherBase) };
    expect(() => validateHistory(line + canonicalJsonLine(other), sourceIds, "evidence/T0.ndjson")).toThrow("owner");
    const rollbackBase = { ...record, recordOrdinal: 2, supersedesRecordDigest: record.recordDigest, result: { ...record.result, status: "rolled-back" as const } };
    const rollback = { ...rollbackBase, recordDigest: recordDigest(rollbackBase) };
    expect(validateHistory(line + canonicalJsonLine(rollback), sourceIds, "evidence/T0.ndjson").activePassingHeads).toHaveLength(0);
    expect(() => validateRecord({ ...record, recordOrdinal: 0 } as SliceEvidenceRecord, sourceIds, "evidence/T0.ndjson")).toThrow();
    expect(() => validateHistory("{bad json}\n", sourceIds, "evidence/T0.ndjson")).toThrow(/malformed/i);
  });
});
