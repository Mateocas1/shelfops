# Slice evidence

Each implementation slice owns one append-only `docs/acceptance/evidence/<slice>.ndjson` history. The slice owner is also its `sliceId`; a later owner cannot claim the same active source ID.

## Freeze and append

1. Snapshot every declared non-evidence path before implementation, including absent paths.
2. After implementation, freeze those paths and build the normalized, path-sorted candidate manifest.
3. Run the focused check, applicable builds and typecheck, and exactly one final `pnpm test:all` against those frozen bytes.
4. Rebuild the manifest and require the same `candidateDigest`; any byte drift fails the slice.
5. Compute `recordDigest` from the canonical record without `recordDigest`, then append one canonical JSON line.
6. Validate the appended history without rerunning product checks:

```sh
pnpm traceability:check -- docs/acceptance/evidence/T0.ndjson
```

Canonical JSON recursively sorts object keys, preserves array order, and uses exactly one newline per NDJSON record. `candidateDigest` hashes only the canonical non-evidence manifest. The owning NDJSON file is excluded from that manifest and digest, but it remains part of rollback and the 399 complete-changed-line cap.

## Correction and rollback

A correction appends a higher unique `recordOrdinal`, names the active prior `recordDigest` in `supersedesRecordDigest`, and preserves every prior line. A rollback follows the same rule with `result.status` set to `rolled-back`; that active head invalidates the prior passing admission.

Never edit, reorder, or delete an existing line. Restore or remove only the slice's declared files during rollback, retain evidence history, and append a rollback record when removing previously admitted behavior.
