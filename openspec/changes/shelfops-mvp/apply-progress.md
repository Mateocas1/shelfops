# Apply Progress: ShelfOps MVP

## Current work unit

- Work unit: WU-07C-A — Application-owned configuration execution (final mandatory-eventId correction passed apply proof)
- Delivery strategy: auto-chain bounded stacked slice
- Chain strategy: stacked-to-main
- Intended review boundary: only the autonomous WU-07C-A Application slice; no WU-07C-B/C or public WU-07 work began.
- WU-02, WU-03T, WU-03TH, WU-03P, WU-03, WU-03Q, WU-04TH, WU-04H, WU-04, WU-05, WU-07P, and WU-07C-A are completed/passed at apply; WU-07C-B/C, WU-07, WU-06, and later work remain unchecked.
- Resolved mode: Strict TDD. The WU-01 harness is runnable.

## WU-07P ordinal-58 topology-safe retry (stopped and rolled back)

- Native ordinal/token: 58 / `sha256:ff409abfe81f84769f1162e4d4a3ceaca24a6918ce8b6e4f9a4b29284d5499bb`.
- Safety net: Docker daemon `29.6.2`; `pnpm test:contract -- application-package` exited 0 (1 file, 2 tests).
- Sentinel authoring first replaced an eagerly resolved application dynamic-import literal with a runtime specifier and sequenced later checks, then the valid RED exited 1 (1 file, 1 failed test) solely on the missing Domain governance export; it created no API-to-Domain import.
- Ordered REDs then exited 1 with 0 tests: `versioned-policy` missing module; `configure-reference-data` missing module; `configuration-events` missing PostgreSQL repository.
- Domain GREEN passed 1 file/1 test and its invalid-range triangulation passed 1 file/2 tests. Application GREEN passed after a Domain producer build (1/1), then store authorization and organization-grant denial/no-side-effect triangulation passed (1 file/2 tests).
- `pnpm install --lockfile-only`, Domain build, and Application build exited 0. The required PostgreSQL GREEN selector exited 1 before tests at a TypeScript transform parse error in the temporary repository's nested `history()` return type (`Expected ',' or '>' but found '{'`). No required gate was retried.
- Gates 4–6 (`application-package`, `contracts-package`, build, typecheck, and the single final `test:all`) were not run after that failure.
- Rollback removed the migration, Domain/Application exports and sources/tests, infrastructure package/repository/test, lockfile importer, and sentinel update; it retained prior ordinal-56/57 evidence unchanged.

### WU-07P ordinal-58 Strict TDD Cycle Evidence

| Task | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- |
| Topology and range/use case | Contract + unit | contract 1 file/2 tests | sentinel 1 failed; domain/application modules absent | domain 1/1; application 1/1 | domain 2/2; application 2/2 | Rolled back after integration gate |
| PostgreSQL configuration events | PostgreSQL 16 | N/A (new) | repository absent, 0 tests | Transform failed, 0 tests | Not reached | Rolled back |

### WU-07P ordinal-58 Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused tests | Valid topology RED: exit 1, 1 failed test; domain/application GREEN and triangulation as above; integration GREEN: exit 1, 0 tests at parser failure. |
| Runtime harness | Docker daemon reachable; the failing integration suite never started a container; cleanup query returned `TESTCONTAINERS_LABELLED_RESOURCE_COUNT=0`. |
| Cleanup | Generated Domain/Application `dist` removed; `git diff --check` exit 0; `gentle-ai doctor` 8 passed, 0 failed, 0 warnings. |
| Complete accounting | No native candidate snapshot was finalized after the gate failure; every temporary product/test/topology path was restored. Retained ordinal-58 evidence is +30/-2 = 32 changed lines, below the 450-line cap. |
| Rollback boundary | Only temporary WU-07P migration, exports/manifests, port/use case, infrastructure repository/test, lockfile importer, and topology sentinel. |

## WU-07P ordinal-59 exact syntax correction (stopped and rolled back)

- Native ordinal/token: 59 / `sha256:0a703e33f1d8f707676c1295baa85ff213b14eec7da66cdef6202df824bddeb0`; prior ordinal-56 through ordinal-58 evidence remains unchanged.
- Docker daemon was reachable (`29.6.2`). `pnpm install --lockfile-only`, Domain build, and Application build exited 0.
- First authoritative inherited-failure proof executed: `pnpm test:integration -- configuration-events` exited 0 (1 file, 1 PostgreSQL 16 test), proving the corrected `history()` parser reached and completed the runtime boundary.
- Focused selectors then passed: `pnpm test:unit -- versioned-policy` and `pnpm test:unit -- configure-reference-data` each exited 0 (1 file, 2 tests).
- Required topology gate stopped: `pnpm test:contract -- application-package` exited 1 (1 file, 1 passed, 1 failed). Its temporary recursive scanner included `apps/api/node_modules`, then reported transitive Application-to-Domain imports as API violations. No gate was retried and gates 5–6, including the final `pnpm test:all`, were not run.
- Rollback removed every ordinal-59 migration, Domain/Application export/source/test, infrastructure manifest/repository/test, lockfile importer, and sentinel byte; all four WU-07P tasks remain unchecked.

### WU-07P ordinal-59 Strict TDD Cycle Evidence

| Task | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- |
| Topology, range, and use case | Contract + unit | Docker reachable; inherited ordinal-58 RED | inherited absent-module/sentinel RED | integration 1/1; units 2/2 each | inherited ordinal-58 cases retained | Rolled back after topology gate |
| PostgreSQL configuration events | PostgreSQL 16 | N/A (new boundary) | inherited absent repository RED | 1 file/1 test passed with canonical ISO history | stale write and restrictive deletion asserted | Rolled back after topology gate |

### WU-07P ordinal-59 Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused/runtime proof | Integration exit 0 (1 file/1 test); both unit selectors exit 0 (1 file/2 tests each). |
| Failure boundary | `application-package`: exit 1; 1 passed/1 failed because the temporary API scanner traversed `node_modules`. |
| Cleanup | Domain/Application/Contracts/Infrastructure/API/Web/Worker `dist` removed; labelled Testcontainers resource count 0; `git diff --check` exit 0; `gentle-ai doctor` 8/0/0. |
| Rollback boundary | Only ordinal-59 WU-07P migration, package/export, port/use-case, infrastructure, lockfile, and sentinel bytes; retained ordinal-56–58 evidence is unaffected. |

## WU-07P ordinal-60 scanner correction (stopped and rolled back)

- Native ordinal/token: 60 / `sha256:9adf30c0b933c74e00e7c3bda3ae446f747b6ac399016df6003a27b168279b07`; ordinal-56–59 evidence remains preserved.
- `pnpm install --lockfile-only` and the first inherited-failure proof, `pnpm test:contract -- application-package`, passed (1 file, 2 tests). The bounded scanner enumerated only owned `src` and `test` roots.
- `pnpm test:integration -- configuration-events` passed (1 file, 1 PostgreSQL 16 test); both unit selectors passed (1 file, 2 tests each); `contracts-package` passed (1 file, 1 test); `pnpm build` passed, including Infrastructure outside root producers.
- Required `pnpm typecheck` then failed once with TS2345 in the temporary scanner: `node.arguments[0]` remained typed as `Expression | undefined` when supplied to `ts.isStringLiteral`. No retry occurred; the final `pnpm test:all` was not run.
- Rollback removed all ordinal-60 product/test/manifest/lockfile/sentinel bytes. WU-07P's four tasks remain unchecked.

### WU-07P ordinal-60 Strict TDD Cycle Evidence

| Task | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- |
| Topology scanner and package boundary | Contract | inherited ordinal-59 false-positive RED | scanner correction was authored before continuation proof | package selector 1/2 passed | contract/integration/unit proofs passed | Rolled back after typecheck |
| PostgreSQL configuration events | PostgreSQL 16 | inherited ordinal-59 parser/runtime proof | inherited absent-repository RED | integration 1/1 with ISO history | stale write and restrictive deletion retained | Rolled back after typecheck |

### WU-07P ordinal-60 Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused/runtime proof | Application package 1/2, integration 1/1, both unit selectors 2/2, contracts package 1/1, and build all exited 0. |
| Failure boundary | Typecheck exit 2: TS2345 at temporary scanner `node.arguments[0]`; no retry, no final suite. |
| Cleanup | Generated dist removed; Testcontainers-labelled resource count 0; `git diff --check` exit 0; doctor 8/0/0. |
| Rollback boundary | Only ordinal-60 WU-07P candidate paths; ordinal-56–59 evidence remains unaffected. |

## WU-07P ordinal-61 exact AST narrowing correction (accepted)

- Native ordinal/token: 61 / `sha256:a01266fd53dbf7123e6f64ea162bbc57d2142807dbd034f4211d0c2d9a236ae4`; ordinal-56–60 evidence remains preserved.
- The only ordinal-60 scanner change bound `const [argument] = node.arguments` and required `argument !== undefined` before `ts.isStringLiteral(argument)`; discovery, expression-kind checks, ownership/exclusion/traversal protections, and product behavior are unchanged.
- `pnpm test:contract -- application-package` passed first (1 file, 2 tests); integration passed 1/1; both unit selectors passed 2/2; `contracts-package` passed 1/1; build and typecheck passed.
- The one final `pnpm test:all` passed: unit 6/26, integration 4/4, contract 6/16, and all workspace builds.
- Cleanup removed all generated dist; Testcontainers-labelled resource count was 0; `git diff --check` passed; doctor was 8/0/0. Infrastructure remains outside root `build:producers`.

### WU-07P ordinal-61 Strict TDD Cycle Evidence

| Task | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- |
| Topology scanner and package boundary | Contract | ordinal-60 TS2345 | inherited indexed-access failure | package selector 1/2 | full topology, package, and build gates passed | Local AST argument narrowing only |
| PostgreSQL configuration events | PostgreSQL 16 | inherited ordinal-60 runtime proof | inherited repository/parser REDs | integration 1/1 with ISO history | stale write and restrictive deletion retained | No behavior refactor needed |

### WU-07P ordinal-61 Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused/runtime proof | Application package 1/2; integration 1/1; both units 2/2; contracts package 1/1; build/typecheck all exited 0. |
| Full harness | Exactly one `pnpm test:all`: units 6/26, integration 4/4, contracts 6/16, and all builds passed. |
| Rollback boundary | Revert only WU-07P migration, package/export, port/use-case, infrastructure, lockfile, sentinel, task marks, and ordinal-61 evidence; retain WU-05C and ordinal-56–60 history. |

### WU-07P ordinal-61 authoritative settlement and accounting correction

- Native status is authoritative: ordinal 61 is settled `passed` / `complete`. The dispatcher reports 63/172 tasks complete, `apply: ready`, `verify: blocked`, and `nextRecommended: apply`; the next route is WU-07 / apply, not verification.
- Complete accounting: `+177/-11 = 188` changed lines across exactly 16 paths, under the hard cap of 450. Temporary-index candidate: `efe7a7c88fa3755e7fd220fd9378c40ae4e1268c` → `f5fb0be548375f6e6265b6e0bc394364b649ee86`.
- Exact paths: `apps/api/test/application-package.contract.test.ts`; `migrations/003_configuration-events.sql`; `openspec/changes/shelfops-mvp/apply-progress.md`; `openspec/changes/shelfops-mvp/tasks.md`; `packages/application/package.json`; `packages/application/src/ports/configuration-repository.ts`; `packages/application/src/reference-data/configure-reference-data.test.ts`; `packages/application/src/reference-data/configure-reference-data.ts`; `packages/domain/package.json`; `packages/domain/src/governance/versioned-policy.test.ts`; `packages/domain/src/governance/versioned-policy.ts`; `packages/infrastructure/package.json`; `packages/infrastructure/src/reference-data/postgres-configuration-repository.ts`; `packages/infrastructure/test/configuration-events.test.ts`; `packages/infrastructure/tsconfig.json`; `pnpm-lock.yaml`.
- Gates: application-package 1 file/2 tests; configuration-events 1/1; both unit selectors 2/2; contracts-package 1/1; build; typecheck; and exactly one final full suite (units 6/26, integration 4/4, contracts 6/16, all builds) all passed.
- Cleanup: generated dist removed; Testcontainers-labelled resources 0; `git diff --check` passed; doctor 8/0/0. Rollback boundary remains the 16 paths above, including four WU-07P task marks and ordinal-61 evidence; retain WU-05C and historical ordinal-56–60 evidence.

## WU-07C-A mandatory eventId correction (passed)

- Authority fingerprint: `sdd-apply|shelfops-mvp|wu07ca-mandatory-eventid|20260801-03-final`; clone-local RDD remained off and no native lifecycle, review, commit, push, or PR command ran.
- The first executable project command was exactly `pnpm --filter @shelfops/domain build` and passed before any selector or edit. The post-edit Domain, Application, and Contracts producer builds also passed in order.
- `ConfigurationCommand.eventId` is mandatory. The only compatibility edits add deterministic event IDs to the two existing direct Infrastructure repository command literals; `packages/infrastructure/src/reference-data/postgres-configuration-repository.ts` is unchanged and supplied-event persistence remains WU-07C-B.
- Required proof passed without retry: PostgreSQL `configuration-events` 1/1; `configuration-executor` 3/3; `configure-reference-data` 3/3; `application-package` 2/2; root build and typecheck; exactly one `pnpm test:all` with unit 30/30, integration 4/4, contract 16/16, and all workspace builds.

### WU-07C-A Strict TDD Cycle Evidence

| Task | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- |
| WU-07C-A | Unit + structural contract | Domain built before selectors/edits; inherited configure baseline 2/2 | Preserved semantic RED: granted organization command resolved before the executor boundary existed | Executor 3/3; configure 3/3; mandatory eventId type and compatible literals compiled | Absent, replay, fingerprint conflict, stale, and organization-catalog exclusion remain covered | Required event identity only; no repository persistence refactor |

### WU-07C-A Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Producer builds | Pre-edit Domain build passed; post-edit Domain, Application, and Contracts builds each exited 0. |
| Focused tests | `pnpm test:integration -- configuration-events`: 1 file/1 test; `pnpm test:unit -- configuration-executor`: 1 file/3 tests; `pnpm test:unit -- configure-reference-data`: 1 file/3 tests; all exited 0. |
| Topology | `pnpm test:contract -- application-package`: 1 file/2 tests, exit 0. |
| Root proof | `pnpm build` and `pnpm typecheck` exited 0. Exactly one `pnpm test:all` passed: unit 7 files/30 tests, integration 4 files/4 tests, contract 6 files/16 tests, and all workspace builds. |
| Runtime harness | Existing PostgreSQL 16 Testcontainers `configuration-events` scenario passed 1/1. It proves compatibility only; supplied-event persistence remains explicitly out of scope until WU-07C-B. |
| Cleanup | Generated workspace `dist` outputs and local package links created by builds were removed; the standalone Docker label query returned no IDs (`TESTCONTAINERS_LABELLED_RESOURCE_COUNT=0`); standalone `git diff --check` passed; standalone `gentle-ai doctor` reported 8 passed, 0 failed, 0 warnings. |
| Complete accounting | Reapplied proven WU-07C-A candidate: +103/-11 = 114 changed lines, below the 350-line hard cap. The bounded mandatory-eventId correction itself is +2/-2 across the two product/test paths before task/evidence bookkeeping. |
| Rollback boundary | Revert only `packages/application/src/ports/configuration-repository.ts`, the two deterministic eventId literal additions in `packages/infrastructure/test/configuration-events.test.ts`, the three WU-07C-A task marks, and this WU-07C-A evidence section. Retain WU-07P and all earlier cumulative history. |

### WU-07C-A boundaries and next state

- PR boundary: autonomous `auto-chain` / `stacked-to-main` WU-07C-A slice, with no PR created by this executor.
- WU-07C-B, WU-07C-C, WU-07, WU-06, and later work remain unchanged and unchecked.
- The candidate is ready for fresh independent phase-contract validation. This apply record does not claim independent acceptance.

## WU-07C-B PostgreSQL atomic idempotency attempt (stopped and rolled back)

- Authority fingerprint: `sdd-apply|shelfops-mvp|wu07cb-postgres-idempotency|20260802-01`; clone-local RDD remained off and no native lifecycle, review, commit, push, or PR command ran.
- Safety net passed: Domain producer build exited 0 and existing PostgreSQL `configuration-events` passed 1 file/1 test before edits.
- Semantic repository RED executed assertions: the new selector failed 1/1 because repository-owned `COMMIT` made the caller's `ROLLBACK` unable to restore location version 1/active true.
- Minimal repository GREEN and triangulation each passed 1/1, proving caller-owned rollback and supplied `ConfigurationCommand.eventId` persistence. Migration RED then failed semantically on `to_regclass('idempotency_records') = null`; migration GREEN passed 1/1.
- The first mandatory complete focused GREEN failed 1/1: PostgreSQL rejected the pending claim with `idempotency_records_check1` because the migration's database-time 24-hour check raced the executor's application-time expiry by milliseconds.
- Per the no-retry rule, no correction or later package/build/typecheck/full-suite gate ran. All temporary migration, store, executor, test, manifest, and repository bytes were restored; WU-07C-B tasks remain unchecked.

### WU-07C-B stopped-attempt evidence

| Evidence | Exact result |
| --- | --- |
| Strict-TDD RED | Real PostgreSQL 16 selector reached assertions and failed on nested transaction ownership; later schema RED reached an assertion and received `null` instead of `idempotency_records`. |
| Intermediate GREEN | Repository rollback/supplied-ID selector passed 1/1; schema plus repository selector passed 1/1. |
| Mandatory failure | `pnpm test:integration -- reference-configuration-idempotency`: exit 1, 1 file/1 failed test; SQLSTATE check-constraint rejection during `insertPending`. No retry. |
| Cleanup | Domain/Application/Infrastructure `dist` absent after cleanup; standalone Testcontainers label query returned no IDs; standalone `git diff --check` passed; doctor reported 8/0/0. |
| Complete accounting | Temporary WU-07C-B product/test candidate restored to zero retained lines. This stopped-attempt evidence adds 22 lines; no task marker changed. |
| Rollback boundary | Restored only temporary migration 004, Infrastructure store/executor/repository/manifest/test bytes. WU-07C-A and all earlier cumulative history remain intact. |
| PR boundary | Autonomous `auto-chain` / `stacked-to-main` WU-07C-B slice stopped before a candidate or PR boundary could be delivered. |

## WU-07P ordinal-57 corrected retry (stopped and rolled back)

- Native ordinal: 57; token: `sha256:6f9c7fcae73d586223661c9e5cc847e6b5abbf6af701df4ae3b2cc14115e6225`.
- Docker daemon reachability passed (`29.6.2`) and the existing package-boundary safety net passed: `pnpm test:contract -- application-package`, 1 file/2 tests.
- RED was test-first: the approved sentinel change failed with the absent governance public subpath; all three inherited selectors also failed truthfully at their missing module/repository boundaries (0 tests each).
- GREEN/triangulation temporarily reached domain 1 file/2 tests, application 1 file/3 tests, and PostgreSQL 1 file/1 test. The adapter normalized driver `Date` timestamps to ISO strings and the PostgreSQL scenario covered append-only events, stale optimistic version, historical snapshots, and restrictive deletion.
- Required gate 5 failed: `pnpm test:contract -- application-package` exited 1 before tests because the temporary API test imported `@shelfops/domain/governance/versioned-policy` without an authorized API-to-domain dependency. This violates the existing `apps/api -> application -> domain` topology; no further gate or retry ran.
- Rollback removed the temporary migration, domain/application/infrastructure sources and tests, package exports/manifests, sentinel update, and regenerated lockfile. Generated producer `dist` directories were removed; Docker cleanup ended with `TESTCONTAINERS_LABELLED_RESOURCE_COUNT=0`.
- Accounting: the temporary candidate was rolled back before a native candidate snapshot/count could be finalized; no unverified total is claimed. Retained change is this evidence only; WU-07P RED/GREEN/TRIANGULATE/REFACTOR tasks remain unchecked.

### WU-07P Strict TDD Cycle Evidence

| Task | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- |
| Effective range and configuration use case | Unit | package sentinel 1 file/2 tests | absent public/module boundaries, exit 1 | domain 2; application 3 | denial, stale version, and non-forward time | Rolled back after gate 5 |
| Configuration-event persistence | PostgreSQL 16 | N/A (new test) | missing repository, exit 1 | 1 file/1 test | append-only, deletion, stale-write, ISO timestamp | Rolled back after gate 5 |

### WU-07P Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused test | `pnpm test:unit -- versioned-policy`: exit 0, 1 file/2 tests; `pnpm test:unit -- configure-reference-data`: exit 0, 1 file/3 tests. |
| Runtime harness | `pnpm test:integration -- configuration-events`: exit 0, 1 file/1 PostgreSQL 16 Testcontainers test; a preceding RED cleanup timeout was manually cleaned to zero labelled resources. |
| Failure boundary | `pnpm test:contract -- application-package`: exit 1, 1 failed suite/0 tests at unauthorized direct API-to-domain import resolution. |
| Rollback boundary | Only the WU-07P temporary paths above; accepted WU-05C and prior ordinal-56 evidence are retained. |

## Completed tasks

- [x] Create the pnpm workspace, strict TypeScript/Vitest scripts, three minimal composition roots, and one passing `packages/test-support/src/smoke.test.ts` so `pnpm test` is runnable.
- [x] Add `apps/api/src/routes/health.ts`, full-test/typecheck/build script wiring, and `docs/development.md` bootstrap commands; record passing output for all four required commands and the health smoke.
- [x] Add focused tests for malformed and out-of-range `PORT` values plus startup diagnostic and cleanup behavior.
- [x] Strictly parse the TCP port and report startup errors through an enabled diagnostic sink while closing a failed app instance.
- [x] Require Node `>=22.12.0` in the project engine and development guide for locked Vite 8.1.5 compatibility.
- [x] WU-01T: add runnable unit/integration command routing and separate Vitest discovery without adding WU-02 tests or behavior.
- [x] WU-01TH: harden empty-selector behavior, add one integration sentinel, and typecheck integration test files without adding WU-02 behavior.
- [x] WU-01P: add a reusable real PostgreSQL Testcontainers lifecycle smoke without adding WU-02 reference-data behavior.
- [x] WU-01PH: harden the Testcontainers integration command, prerequisite documentation, Node engine, and PostgreSQL image reference without adding WU-02 behavior.
- [x] WU-03T: add fail-closed contract test routing and one domain-neutral Node sentinel without WU-03 API behavior.
- [x] WU-03T: add only the TypeBox and Fastify Swagger direct dependencies and regenerate the lockfile.
- [x] WU-03T: remove temporary probes and record rollback, test, and exact native-delta evidence.
- [x] WU-03TH: prove contract-stage failure propagates through `pnpm test:all` and restore the sentinel byte-for-byte.
- [x] WU-03TH: include the API contract-test/config scope in root typechecking without changing application ownership.
- [x] WU-03TH: triangulate the sentinel/no-match/typecheck paths and run the complete suite with Testcontainers cleanup.
- [x] WU-03TH: record scoped rollback, cleanup, and native accounting without implementing WU-03.

## Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused test | `pnpm test` | Exit 0; Vitest v4.1.10: 1 test file passed, 1 test passed. |
| Full harness | `pnpm test:all` | Exit 0; `tsc --noEmit`, Vitest (1 file/1 test), and builds for API, web, and worker passed. |
| Runtime harness | PowerShell: `$env:PORT = '3111'; pnpm --filter @shelfops/api dev`; then `GET http://127.0.0.1:3111/health` | Passed; exit 0 and `200 {"status":"ok"}`. The process tree was stopped; no listener remained on port 3111. |
| Rollback boundary | Workspace roots, Vitest harness, bootstrap API health route, and development guide | Remove the exact bootstrap files listed below together. No later business behavior is affected. |

## WU-01H TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Startup hardening | `packages/test-support/src/smoke.test.ts` | Unit | `pnpm vitest run packages/test-support/src/smoke.test.ts`: 1/1 passed | Missing `startup.js` import: 1 suite failed, 0 tests ran | Same focused command: 1 file, 6 tests passed | Valid `3111`; malformed `3111oops`; range-invalid `0` and `65536`; failed listen diagnostic/close path | Extracted shared invalid-port message; focused command remained 1/6 passing |
| Node requirement alignment | `package.json`, `docs/development.md` | Structural configuration | N/A — no runtime behavior added | N/A — requirement alignment only | `pnpm test:all` passed under Node v25.9.0 | Skipped — one pinned minimum governs both declarations | None needed |

## WU-01H Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused test | `pnpm vitest run packages/test-support/src/smoke.test.ts` | Exit 0; Vitest v4.1.10: 1 test file passed, 6 tests passed. |
| Full test | `pnpm test` | Exit 0; Vitest v4.1.10: 1 test file passed, 6 tests passed. |
| Full harness | `pnpm test:all` | Exit 0; `tsc --noEmit`, Vitest (1 file/6 tests), and builds for API, web, and worker passed. |
| Runtime harness | PowerShell: `PORT=3111`, `pnpm --filter @shelfops/api dev`, then `GET http://127.0.0.1:3111/health` | Exit 0; `200 {"status":"ok"}`. Process tree was terminated; no listener remained on port 3111. |
| Dependency verification | `pnpm why vite --depth 99` | Exit 0; one resolved version: `vite@8.1.5` through Vitest 4.1.10. |
| Rollback boundary | WU-01H startup, test, engine, and guide files | Revert `apps/api/src/startup.ts`, the `apps/api/src/server.ts` startup invocation, the focused smoke tests, `package.json` engine, and `docs/development.md` together. WU-01 bootstrap remains runnable. |

## Review budget and rollback

- Authored review count: **219 additions / 0 deletions = 219 changed lines**,
  under the 400-line review boundary. This measures only the listed WU-01
  rollback files against the empty root commit, excluding generated output and
  OpenSpec phase artifacts.
- Reproducible method: from the repository root, run `git diff --no-index
  --numstat -- NUL <path>` for each path in this ordered list, then sum the two
  numeric columns: `.gitignore`, `package.json`, `pnpm-workspace.yaml`,
  `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, every file in
  `apps/api/`, `apps/web/`, `apps/worker/`, and `packages/test-support/`, plus
  `docs/development.md`. The measured per-path total is 219 additions and zero
  deletions. `pnpm-lock.yaml` is excluded as generated; `openspec/config.yaml`,
  `tasks.md`, and this progress file are phase artifacts excluded from the
  authored product-review boundary.
- Native complete-candidate accounting is separate: attempt 1 measured
  **1,692 changed lines** across the complete candidate snapshot. The
  maintainer reset that native cap to 2,000 lines for attempt 2; it does not
  alter the 400-line authored review boundary.
- Revertable behavior boundary: remove `.gitignore` Node-output entries;
  `package.json`; `pnpm-workspace.yaml`; `tsconfig.base.json`; `tsconfig.json`;
  `vitest.config.ts`; `apps/api/`; `apps/web/`; `apps/worker/`;
  `packages/test-support/`; and `docs/development.md`. Remove the generated
  lockfile with the manifest if the bootstrap is fully reverted.

## Generated artifacts

- `pnpm-lock.yaml` was generated by `pnpm install` and is excluded from the authored review-line count.
- `dist/` and `node_modules/` are ignored local outputs.

## WU-01H review budget and scope

- Delivery: bounded `stacked-to-main` follow-up; no commit or PR was created.
- Native attempt-3 candidate-tree delta: **152 changed lines** (authoritative).
- Begin candidate: `sha256:a72661b9c31a0b070512843ec54d30735905aa2932f870f4778d6345edc6f8bd`;
  tree: `931db024fefe98b3de1fccf834d033d31d77932e`.
- Finish candidate: `sha256:54d161019167312a5cad84412405b861450f1879173028fe9a792026747587e8`;
  tree: `accc10409a3f01925700ab80cc253b1fdf05843d`.
- Candidate-tree accounting is authoritative because the baseline files are untracked;
  HEAD/NUL comparisons cannot isolate the WU-01H delta.
- Out of scope: WU-02 and all business-domain behavior.

## Historical pre-WU-01P blocker (resolved)

- Before WU-01P, WU-02 could not start because the real PostgreSQL Testcontainers boundary was unavailable. This preserved history is superseded by the completed WU-02 evidence and attempt-14 correction below.

## WU-01T TDD Cycle Evidence

| Task | Test file/config | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Test command routing and discovery | `package.json`, `vitest.config.ts`, `vitest.integration.config.ts` | Test-runner configuration | `pnpm test`: 1 file/6 tests passed | `pnpm test:unit -- harness` and `pnpm test:integration -- reference-data`: both exited 1 with `Command "test:unit" not found` / `Command "test:integration" not found` | `pnpm test:unit -- smoke`: exit 0; 1 file/6 tests passed. `pnpm test:integration -- reference-data`: exit 0; Vitest loaded integration config and reported no matching files. | Unit include retained and integration include explicitly reported as `packages/**/test/**/*.test.ts`; filtered future path reached Vitest without an undefined-command failure. | No refactor needed; two focused config files keep unit and integration discovery explicit. |

## WU-01T Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused unit command | `pnpm test:unit -- smoke` | Exit 0; Vitest v4.1.10: 1 test file passed, 6 tests passed. |
| Focused integration command | `pnpm test:integration -- reference-data` | Exit 0; Vitest v4.1.10 loaded `vitest.integration.config.ts`, reported `include: packages/**/test/**/*.test.ts`, then `No test files found, exiting with code 0`. `passWithNoTests` accepts only the expected pre-WU-02 empty discovery; discovered test failures still exit nonzero. |
| Integration discovery baseline | `pnpm test:integration` | Exit 0; Vitest v4.1.10 reported `include: packages/**/test/**/*.test.ts` and `No test files found, exiting with code 0`. |
| Full test | `pnpm test` | Exit 0; Vitest v4.1.10: 1 test file passed, 6 tests passed. |
| Full harness | `pnpm test:all` | Exit 0; `tsc --noEmit`, unit Vitest (1 file/6 tests), empty integration discovery, and builds for API, web, and worker passed. |
| Runtime harness | N/A | Test-runner configuration has no runtime boundary; command routing and glob discovery were exercised directly by Vitest. |
| Rollback boundary | WU-01T command and Vitest-discovery configuration | Revert `package.json`, `tsconfig.json`, and `vitest.integration.config.ts`; `vitest.config.ts` remains the unchanged unit-discovery boundary. |

## WU-01T review budget and scope

- Delivery: one bounded `stacked-to-main` prerequisite slice; no commit or PR was created.
- Native accounting uses a temporary index against begin tree `43f7c32d4b123e50290bd6ac431c0f3c2d3f7167`; the final tree ID and 51 additions / 11 deletions = 62 changed lines are reported in the apply result.
- Historical WU-01T scope: every WU-02 marker was unchecked; no `packages/infrastructure/test/reference-data.test.ts` or reference-data implementation existed then.

## WU-01TH TDD Cycle Evidence

| Task | Test file/config | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Integration harness hardening | `packages/test-support/test/integration-harness.test.ts`, `package.json`, `tsconfig.json` | Integration/configuration | `pnpm test`: 1 file/6 tests passed; `pnpm test:all` passed while the suite was empty | `pnpm test:integration -- reference-data` exited 0 with no files; a temporary invalid type in the sentinel still let `pnpm typecheck` exit 0 and `--listFiles` omitted the path | Removed `--passWithNoTests`, added integration `tsconfig` inclusion, and retained a sentinel asserting `NODE_ENV === "test"`; selector now exits 1 and the focused sentinel/typecheck pass | A temporary discovered failure exited 1 with 1/1 failed, then was removed; the no-match path independently exits 1 | Removed the temporary typecheck and failure probes; focused sentinel remains 1/1 passing |

## WU-01TH Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused unit | `pnpm test:unit -- smoke` | Exit 0; 1 file/6 tests passed. |
| Focused integration | `pnpm test:integration -- integration-harness` | Exit 0; 1 file/1 test passed. |
| Negative selector | `pnpm test:integration -- reference-data` | Exit 1; no test files found. |
| Discovered failure | Temporary `integration-failure-probe.test.ts` run with `pnpm test:integration -- integration-failure-probe` | Exit 1; 1 file/1 test failed because `NODE_ENV` was `test`, not `production`; probe removed afterward. |
| Typecheck sentinel | `pnpm typecheck --listFiles` | Exit 0; `packages/test-support/test/integration-harness.test.ts` is listed. |
| Full checks | `pnpm test`; `pnpm test:all` | Both exit 0; unit 1 file/6 tests and integration 1 file/1 test; `test:all` also typechecks and builds all three apps. |
| Runtime harness | N/A | This work unit changes only Vitest/TypeScript harness contracts; no service, port, container, or external runtime boundary is introduced. |
| Rollback boundary | Integration command, root TypeScript include, and sentinel | Revert `package.json`, `tsconfig.json`, and `packages/test-support/test/integration-harness.test.ts` together; WU-02 remains untouched. |

## WU-01TH integration sentinel correction

- Lineage: `review-cf172d6bb79c21a8`; scope is only the approved warning that
  `NODE_ENV` is an inherited process value, not proof of Vitest's Node runtime.
- The sentinel now asserts Vitest's runtime marker, Node process identity, a
  Node builtin-module capability, and the absence of a browser `window` global.
  It does not mutate `NODE_ENV` in a package script.
- Historical WU-01TH scope: no WU-02 reference-data test or behavior was added.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Sentinel correction | `packages/test-support/test/integration-harness.test.ts` | Integration/configuration | `pnpm test:integration -- integration-harness`: 1/1 passed | `NODE_ENV=production` command: 1/1 failed; expected `test`, received `production` | Same command passed 1/1 with inherited `NODE_ENV` unset, `test`, and `production` | Three inherited values prove the assertion is independent of `NODE_ENV`; Vitest marker, Node capability, and no-DOM checks exercise distinct runtime facts | Replaced the env proxy with direct runtime observations; focused test remained 1/1 passing |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused test | `pnpm test:integration -- integration-harness` with inherited `NODE_ENV` unset, `test`, and `production` | Exit 0 for each run; Vitest v4.1.10: 1 file/1 test passed. Environment was restored to unset after each override. |
| No-match fail closed | `pnpm test:integration -- reference-data` | Exit 1; `No test files found, exiting with code 1`. |
| Discovered failure | Temporary `integration-failure-probe.test.ts` | Exit 1; 1 file/1 test failed (`VITEST` was `true`), then the probe was removed. |
| Typecheck sentinel | `pnpm typecheck --listFiles` | Exit 0; listed `packages/test-support/test/integration-harness.test.ts`. |
| Full checks | `pnpm test`; `pnpm test:all` | Both exit 0; unit 1 file/6 tests, integration 1 file/1 test, typecheck, and all three builds passed. |
| Runtime harness | N/A | This correction changes only the Vitest Node-environment sentinel; no service or external runtime boundary exists. |
| Rollback boundary | Sentinel and this correction evidence | Revert the sentinel assertion in `packages/test-support/test/integration-harness.test.ts` and this section only; WU-01TH hardening and WU-02 scope remain otherwise unchanged. |

## WU-01P PostgreSQL Testcontainers harness

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL lifecycle smoke | `packages/infrastructure/test/postgres-harness.test.ts` | Real PostgreSQL integration | `pnpm test:integration -- integration-harness`: prior sentinel passed 1/1 | `pnpm test:integration -- postgres-harness` exited 1 before dependencies: failed to resolve `@testcontainers/postgresql`, 0 tests ran | After adding `@testcontainers/postgresql`, `pg`, and `@types/pg`, the same command exited 0: 1 file/1 test passed against Docker PostgreSQL | `SELECT 1 AS value` and `current_database()` assert independent SQL and configured-database outcomes on the same disposable lifecycle | Kept explicit PostgreSQL 16.10 alpine image and nested `finally` cleanup; focused command remained green |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused runtime test | `pnpm test:integration -- postgres-harness` | Exit 0; Vitest v4.1.10: 1 file passed, 1 test passed in 22.24s using `postgres:16.10-alpine`. |
| Focused unit smoke | `pnpm test:unit -- smoke` | Exit 0; Vitest v4.1.10: 1 file passed, 6 tests passed. |
| Reference-data scope guard | `pnpm test:integration -- reference-data` | Exit 1 as required; no test files found under the integration discovery glob. |
| Typecheck inclusion | `pnpm typecheck --listFiles` | Exit 0; output listed `packages/infrastructure/test/postgres-harness.test.ts`. |
| Full test | `pnpm test` | Exit 0; Vitest v4.1.10: 1 file passed, 6 tests passed. |
| Full harness | `pnpm test:all` | Exit 0; typecheck, unit tests (1 file/6 tests), integration tests (2 files/2 tests), and all three application builds passed. |
| Runtime cleanup | Docker `ps -a` filtered by `org.testcontainers=true` and `postgres:16.10-alpine`, plus running Testcontainers label query | No matching containers and no running Testcontainers-labeled process remained. |
| Rollback boundary | Testcontainers dependencies/configuration and harness test | Revert `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, and `packages/infrastructure/test/postgres-harness.test.ts` together. No WU-02 behavior is removed. |

### Review budget and scope

- Delivery: one bounded `stacked-to-main` prerequisite slice; no commit or PR was created.
- Authored scope: root development dependencies, explicit build-script denials required by pnpm 11's generated workspace policy, and one infrastructure integration test. `pnpm-lock.yaml` is generated and excluded from the 400-line authored count.
- Historical WU-01P scope: no WU-02 migration, reference-data test, domain code, fixtures, or product documentation was created.

## WU-02 historical blocker evidence (resolved by WU-01P)

This is preserved pre-WU-01P history only; it is not current WU-02 status and is superseded by the completed evidence below.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RED — reference-data rules | New `packages/domain/src/reference-data/*.test.ts` and `packages/infrastructure/test/reference-data.test.ts` | Unit + real PostgreSQL integration | N/A — new files | Blocked before test authoring: the required real PostgreSQL Testcontainers boundary cannot start | Not attempted — no production code written | Not attempted | Not attempted |
| GREEN — migration, domain, fixtures, guide | WU-02 paths only | Unit + real PostgreSQL integration | N/A — new files | Blocked by the same runtime prerequisite | Not attempted — no production code written | Not attempted | Not attempted |
| TRIANGULATE — representative fixtures | New WU-02 fixture and integration tests | Unit + real PostgreSQL integration | N/A — new files | Blocked by the same runtime prerequisite | Not attempted | Not attempted | Not attempted |
| REFACTOR — fixture vocabulary | `packages/test-support/src/fixtures/vocabulary.ts` | Unit + real PostgreSQL integration | N/A — new file | Blocked by the same runtime prerequisite | Not attempted | Not attempted | Not attempted |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused integration selector | `pnpm test:integration -- reference-data` | Exit 1; Vitest v4.1.10 found no matching `reference-data` test file and failed closed. |
| Required runtime dependency | `pnpm exec node -e "require.resolve('testcontainers')"` | Exit 1; `MODULE_NOT_FOUND: Cannot find module 'testcontainers'`. |
| Required container runtime | PowerShell `Get-Command docker` | Exit 1; `DOCKER_COMMAND_MISSING`. |
| Required runtime scenario | Apply `migrations/001_reference-data.sql` to PostgreSQL in Testcontainers, then prove the singleton-organization and cross-store foreign-key constraints | Blocked. The design prohibits SQLite or parser substitutes; no weaker integration test was substituted. |
| Full commands | `pnpm test:unit -- reference-data`; `pnpm test`; `pnpm test:all` | Not run after the real-runtime prerequisite failure; Strict TDD requires stopping rather than reporting irrelevant green results. |
| Rollback boundary | WU-02 product paths | Historical pre-WU-01P record only; current WU-02 rollback is recorded below. |

### WU-02 historical native-tree accounting

- Begin tree: `d49787687f10d40cacd569798df125129b9a2972`.
- Candidate at blocker detection, before this evidence bookkeeping: `d49787687f10d40cacd569798df125129b9a2972`.
- Additions: **0**; deletions: **0**; total: **0** before bookkeeping. The temporary Git index was removed and the real index remained untouched.
- Historical result: WU-02 had a zero-line blocked delta then; current bounded completion and WU-03+ status are recorded below.

## WU-01PH Testcontainers hardening

- Lineage: `review-dda0eaf421987d11`; scope is limited to its three native
  warnings (Node/runtime alignment, Docker prerequisite documentation, and
  immutable PostgreSQL image) plus the captured immediate Ryuk-cleanup failure.
- The root engine and development guide now require Node `>=22.19.0`, matching
  locked `undici@8.9.0` rather than the prior lower project minimum.
- `pnpm test:integration` runs one TypeScript runner that invokes Vitest without
  a shell, forwards every CLI argument unchanged, captures Vitest's exact exit
  code, then polls `docker ps -aq --filter label=org.testcontainers=true` for up
  to 30 seconds. A cleanup timeout names remaining resource IDs. If tests and
  cleanup both fail, the runner reports both while retaining the test exit code.
- Docker Desktop or a compatible engine and `docker info` health check are now
  documented for `pnpm test:all`. Ryuk remains enabled.
- Historical WU-01PH scope: no WU-02 reference-data, migration, fixture, or
  product behavior was created.

### TDD Cycle Evidence

| Task | Test file or command | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Integration cleanup boundary | `scripts/run-integration-tests.ts`; real PostgreSQL harness and temporary failure probe | Real PostgreSQL integration | `pnpm test:integration -- integration-harness`: exit 0, 1 file/1 test | Before the runner, focused PostgreSQL success exited 0 but immediately found 1 labelled Ryuk resource; temporary discovered failure exited 1 and immediately found 1 labelled Ryuk resource | Focused PostgreSQL harness exited 0 and immediate labelled-resource query returned 0; temporary discovered failure still exited 1 and immediate query returned 0, then the probe was removed | No-match `-- reference-data` exited 1; sentinel passed with `NODE_ENV` unset, `test`, and `production`; full integration passed 2/2 | Kept one shell-free runner with named timeout/interval constants and shared command invocation; all focused checks remained green |
| Node, Docker, and image prerequisites | `package.json`, `docs/development.md`, `postgres-harness.test.ts` | Configuration + real integration | Prior unit smoke: exit 0, 1 file/6 tests | Project/docs declared `>=22.12.0` while locked Undici requires `>=22.19.0`; Docker prerequisite was absent; harness used mutable image tag | Engine/docs use `>=22.19.0`, Docker daemon health is documented, and the focused real PostgreSQL harness passes with the pinned digest | Full integration 2/2 and `pnpm test:all` passed with the pinned image | One shared engine declaration/message and a concise prerequisite section; no Testcontainers cleanup mechanism was disabled |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| RED: lock and docs inspection | `pnpm-lock.yaml`, `package.json`, `docs/development.md`, PostgreSQL harness source | Locked `undici@8.9.0` declares Node `>=22.19.0`; project/docs declared `>=22.12.0`; Docker prerequisite/health check was absent; image was mutable `postgres:16.10-alpine`. |
| RED: immediate Ryuk observation | `pnpm test:integration -- postgres-harness`, then `docker ps -aq --filter label=org.testcontainers=true` | Test exit 0; immediate query found 1 resource: `testcontainers/ryuk:0.14.0` with `org.testcontainers.ryuk=true`. |
| Focused runtime test | `pnpm test:integration -- postgres-harness`, then exact Docker label query | Exit 0; Vitest 1 file/1 test passed. Immediate labelled-resource count: 0. |
| Full runtime suite | `pnpm test:integration` | Exit 0; Vitest 2 files/2 tests passed. |
| Failure preservation and cleanup | Temporary `cleanup-failure-probe.test.ts` run through `pnpm test:integration -- cleanup-failure-probe`, then exact Docker label query | Exit 1; 1 file/1 intentional assertion failure. Immediate labelled-resource count: 0. Probe removed afterward. |
| No-match fail closed | `pnpm test:integration -- reference-data` | Exit 1; no test files found. Filter reached Vitest through the runner. |
| NODE_ENV-independent sentinel | `pnpm test:integration -- integration-harness` with NODE_ENV unset, `test`, and `production` | Each exit 0; each run passed 1 file/1 test; final labelled-resource count: 0. |
| Unit smoke | `pnpm test:unit -- smoke` | Exit 0; Vitest 1 file/6 tests passed. |
| Full checks | `pnpm typecheck`; `pnpm test`; `pnpm test:all`; `pnpm build` | All exit 0; `test:all` ran typecheck, 1 unit file/6 tests, 2 integration files/2 tests, and all three application builds. |
| Rollback boundary | WU-01PH runner, engine/command/typecheck config, development guide, and PostgreSQL image constant | Revert `scripts/run-integration-tests.ts`, `package.json`, `tsconfig.json`, `docs/development.md`, and `packages/infrastructure/test/postgres-harness.test.ts` together; WU-02 and WU-03 remain untouched. |

### Native candidate accounting correction (attempt 12)

- Prior scope-drift failure: unignored `.codegraph/` local-tool state appeared in
  `git status` and entered candidate accounting. The corrected snapshot removes
  its `.codegraph/.gitignore` entry while preserving the directory and database.
- Correction attempt: begin tree `75c7b72b65c52fd2c5657b0dfbc615692e435a20`;
  finish tree `63351490bab76c9251717395ea49f7d0a279988e`; 22 additions, 11
  deletions, 33 total changed lines.
- Corrected WU-01PH scope: begin tree
  `8b353232d7e6108c6a9c0805ddd2707baaa49599`; finish tree
  `63351490bab76c9251717395ea49f7d0a279988e`; 176 additions, 10 deletions,
  186 total changed lines.
- Both deltas use separate temporary indexes: `git read-tree --empty`,
  `git add -A`, `git write-tree`, and `git diff --numstat <begin> <finish>`.
  Each temporary index is removed; the real index is untouched; finish trees
  are the candidate snapshots immediately before this self-referential record.
- No tests were rerun: production, test, dependency, and functional-evidence
  bytes are unchanged. Only ignore, status, and accounting checks apply.

## WU-02 reference-data contract

- WU-02 remains complete/passed; WU-01PH's shell-free runner and bounded Testcontainers cleanup remain unchanged.
- Implemented the singleton-organization PostgreSQL hierarchy, reference catalog defaults, selection validation, deterministic simulated fixture vocabulary, and reference-data guide. WU-03+ remains unchecked.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Reference hierarchy and catalogs | `packages/domain/src/reference-data/reference-data.test.ts`, `packages/infrastructure/test/reference-data.test.ts` | Unit + real PostgreSQL | New files | Unit selector exited 1 because the fixture/domain module was absent; integration selector exited 1 because `migrations/001_reference-data.sql` was absent | Unit: 1 file/2 tests passed; integration: 1 file/1 test passed | Added active/inactive selection cases and fixture-builder reset cases; each first failed with its missing export, then unit passed 2/2 | Centralized fixed UUIDv7-shaped IDs and fixed clock in `fixtureVocabulary`; unit, typecheck, and integration checks remained green |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused unit test | `pnpm test:unit -- reference-data` | Exit 0; Vitest v4.1.10: 1 file passed, 3 tests passed. |
| Focused runtime test | `pnpm test:integration -- reference-data` | Exit 0; Vitest v4.1.10: 1 file passed, 1 test passed against real PostgreSQL Testcontainers. The migration seeded seven categories/four exact severities with organization attribution and timestamps, rejected a second organization, and rejected a Store-B location linked to a Store-A sector. |
| Typecheck | `pnpm typecheck` | Exit 0. |
| Cleanup | `docker ps -aq --filter label=org.testcontainers=true` | Exit 0; `TESTCONTAINERS_LABELLED_RESOURCE_COUNT=0`. No Testcontainers-labelled container remained. |
| Rollback boundary | WU-02 migration, domain module/tests, fixture vocabulary, integration test, and guide | Revert `migrations/001_reference-data.sql`, `packages/domain/src/reference-data/`, `packages/test-support/src/fixtures/vocabulary.ts`, `packages/infrastructure/test/reference-data.test.ts`, and `docs/reference-data.md` together; WU-01PH remains runnable. |

## WU-02 final evidence accounting (ordinal 15)

- Scope: only the frozen validator gaps; WU-03+, dependencies, runner, CodeGraph, commits, and PRs remain out of scope.
- Ordinal 14 completed/passed with final candidate `sha256:b8338fdebd021add44707979bd2348c328735d8ad912986dd7be7f18e946bf61`, final tree `00e1e41be3a2b17b0b61d4ff902251e0351e3413`, and evidence revision `sha256:f00de14e996dd9b25d22ec0aaeb00a39756168b243dcc2868a40b9123645eabe`.
- Authoritative direct complete behavioral tree accounting, `49195608fda773e881544af9d17b75fabcdda4bf` -> `00e1e41be3a2b17b0b61d4ff902251e0351e3413`: **+259/-22 = 281 changed lines**, 8 paths, under 400.
- Authoritative direct correction tree accounting, `09675c8b349610f761122c3b135deee9cbf8ced4` -> `00e1e41be3a2b17b0b61d4ff902251e0351e3413`: **+94/-37 = 131 changed lines**, 7 paths, under 198.
- Complete changed paths (8): `docs/reference-data.md`; `migrations/001_reference-data.sql`; `openspec/changes/shelfops-mvp/apply-progress.md`; `openspec/changes/shelfops-mvp/tasks.md`; `packages/domain/src/reference-data/reference-data.test.ts`; `packages/domain/src/reference-data/reference-data.ts`; `packages/infrastructure/test/reference-data.test.ts`; `packages/test-support/src/fixtures/vocabulary.ts`.
- Ordinal 15 is an evidence-only accounting transaction. Its terminal identity remains authoritative in the external native ledger and is intentionally not self-referenced inside this file.
- Read-only Git checks passed: complete and correction `git diff --check`; complete/correction `git diff --name-status`, `--numstat`, and `--shortstat`; all referenced objects are Git trees; `HEAD` remains `f6667293cdebebae4911461f66b03c98a62a6b3c`; no commit.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Validator correction | `reference-data.test.ts` | Unit + real PostgreSQL | Unit 2/2; integration 1/1 | Unit: mutable catalog, unstamped fixtures, missing hierarchy validator; integration: abbreviated severity guidance | Unit 3/3; integration 1/1 | Active selection excludes inactive product; hierarchy and unavailable-product cases; all four exact severity meanings | Frozen catalog entries, fixed-clock stamp helper, and pure reference validator retained |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused unit | `pnpm test:unit -- reference-data` | Exit 0; 1 file/3 tests passed. |
| Focused runtime | `pnpm test:integration -- reference-data` | Exit 0; 1 file/1 test passed using pinned PostgreSQL Testcontainers and real `migrations/001_reference-data.sql`. |
| Typecheck | `pnpm typecheck` | Exit 0. |
| Cleanup | Docker label query after integration | Exit 0; zero `org.testcontainers=true` resources. |
| Rollback boundary | WU-02 correction paths | Revert the migration, reference-domain module/tests, fixture vocabulary, integration test, WU-02 correction task marker, and this correction record together. |

- Changed paths: `migrations/001_reference-data.sql`, `packages/domain/src/reference-data/{reference-data.ts,reference-data.test.ts}`, `packages/test-support/src/fixtures/vocabulary.ts`, `packages/infrastructure/test/reference-data.test.ts`, `openspec/changes/shelfops-mvp/{tasks.md,apply-progress.md}`.
- Artifact merge: OpenSpec history retained and stale blocked wording repaired; Engram topic `sdd/shelfops-mvp/apply-progress` (#925) was read and will receive this same cumulative artifact.

## WU-03T contract-test and package foundation

- Scope is limited to the contract Vitest runner/configuration, one neutral sentinel, the `@shelfops/contracts` package manifest, two direct dependencies, and the generated lockfile. WU-03 TypeBox schemas, error handling, pagination, middleware, routes, OpenAPI output, examples, and documentation remain unimplemented.
- Direct dependencies: `@sinclair/typebox@^0.34.52` establishes the future contracts boundary required by the design; `@fastify/swagger@^9.8.1` is compatible with the existing Fastify `^5.5.0` API package. Swagger UI and all other packages were excluded.

### TDD Cycle Evidence

| Task | Test file/config | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Contract runner and sentinel | `vitest.contract.config.ts`, `apps/api/test/contract-harness.contract.test.ts` | Contract/configuration | Pre-change `pnpm test:unit -- smoke`: 1 file/6 tests; `pnpm test:integration -- integration-harness`: 1 file/1 test | `pnpm test:contract -- contract-harness` exited 1: command not found | Same command exited 0; Vitest 1 file/1 test passed | `pnpm test:contract -- api-foundation` reached Vitest and exited 1 with no files, proving no-match fails closed | No refactor needed; the dedicated include is the smallest isolated boundary. |
| Dependency manifests and lockfile | `apps/api/package.json`, `packages/contracts/package.json`, `pnpm-lock.yaml` | Structural package boundary | Existing lockfile passed its policy check before update | Required direct dependencies were absent from their package manifests | `pnpm install --lockfile-only` exited 0 and generated the package/lock entries | `pnpm install --frozen-lockfile` exited 0 after the atomic update | No refactor needed; only the two design-required direct dependencies were declared. |
| Cleanup and rollback record | WU-03T allowed paths | Structural evidence | Green contract sentinel remained 1/1 | N/A — cleanup removes rather than adds behavior | No temporary failure probe remains; focused command stayed green | Negative no-match command remained exit 1 after cleanup | No refactor needed. |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused contract test | `pnpm test:contract -- contract-harness` | Exit 0; Vitest v4.1.10: 1 file/1 test passed. |
| No-match fail closed | `pnpm test:contract -- api-foundation` | Exit 1; Vitest loaded `vitest.contract.config.ts`, reported `include: apps/api/test/**/*.contract.test.ts`, and found no matching files. |
| Typecheck | `pnpm typecheck` | Exit 0. |
| Existing unit safety net | `pnpm test:unit -- smoke` | Exit 0; Vitest v4.1.10: 1 file/6 tests passed. |
| Existing integration safety net | `pnpm test:integration -- integration-harness` | Exit 0; Vitest v4.1.10: 1 file/1 test passed. |
| Runtime harness | N/A | This unit changes command/configuration and package resolution only; it adds no HTTP route, service, container, or external runtime boundary. |
| Rollback | Allowed WU-03T paths | Revert `package.json`, `apps/api/package.json`, `packages/contracts/package.json`, `pnpm-lock.yaml`, `vitest.contract.config.ts`, and `apps/api/test/contract-harness.contract.test.ts` together; revert the WU-03T task markers and this evidence entry with the slice ledger. |

### Native accounting

- Begin tree: `e796b6d47265240e31a444fd39a1d1f151089763`.
- Product-authored delta (the five non-generated WU-03T product paths; excludes the lockfile and OpenSpec task/progress ledger): **+29/-0 = 29 changed lines**.
- Complete native delta (including generated `pnpm-lock.yaml`, task markers, and apply-progress): **+122/-9 = 131 changed lines** across 8 paths.
- Result: under the 400-line cap; atomic `pnpm-lock.yaml` delta is **+49/-0 = 49 changed lines**; no `size:exception` is authorized or requested.

## WU-03T terminal evidence correction (ordinal 17)

- Ordinal 16 completed/passed. Final candidate identity: `sha256:5e39b01e775c6628aad66977b6bf304a675483f37e2483b3a33efbf4775fbe1d`; final tree: `b1b62e35f97a9953eefe1e97f66fbbaa9e1f6a1f`; evidence revision: `sha256:6b9904afba4522def45f44ae36554f34b102371e3e56c456b94ebc6ab36bf1f5`.
- Complete WU-03T delta: **+122/-9 = 131 changed lines** across exactly 8 paths, under 400: `package.json`, `apps/api/package.json`, `apps/api/test/contract-harness.contract.test.ts`, `packages/contracts/package.json`, `pnpm-lock.yaml`, `vitest.contract.config.ts`, `openspec/changes/shelfops-mvp/tasks.md`, and this progress file.
- The retained TDD and work-unit evidence above records RED/GREEN, the no-match fail-closed selector, typecheck, unit/integration sentinels, `git diff --check`, and cleanup evidence.
- A transient Windows pnpm `EPERM` occurred when parallel pnpm commands raced package imports after lock generation; sequential `pnpm install --frozen-lockfile` and all final checks passed, resolving the incident with no file or process residue.
- No commit, push, PR, or native review was created during WU-03T.
- Ordinal 17 is an evidence-only accounting transaction; its terminal identity is authoritative in the external native ledger and intentionally not self-referenced in this file.

## WU-03TH root contract verification and typecheck hardening (ordinal 18)

- Scope is only root command/typecheck coverage. `test:all` now executes `typecheck → unit → integration → contract → build`; the prior four stages retain their order and `&&` failure propagation.
- Root `tsconfig.json` explicitly includes `apps/api/test/**/*.ts` and `vitest.contract.config.ts`; `apps/api/tsconfig.json` was not changed. WU-03 schemas, routes, middleware, OpenAPI output, examples, and documentation remain unimplemented.

### TDD Cycle Evidence

| Task | Test file/config | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Root contract stage and typecheck scope | Root `package.json`, root `tsconfig.json`, existing contract sentinel | Contract/configuration | Sentinel 1/1 and root typecheck passed before the probes | A false sentinel made `pnpm test:all` exit 1 at contract after typecheck, unit 2/9, and integration 3/3; pre-GREEN `string = 1` exited 0, then after root inclusion exited 2 with TS2322/TS6133 | Restored the sentinel byte-for-byte; sentinel 1/1, typecheck, and full suite passed | No-match `api-foundation` exited 1; `--listFiles` listed both the sentinel and contract config | None needed; minimal root-only includes preserve application ownership |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused contract sentinel | `pnpm test:contract -- contract-harness` | Exit 0; Vitest v4.1.10: 1 file/1 test passed. |
| Contract failure propagation | Temporary false sentinel with `pnpm test:all` | Exit 1 at the contract stage after typecheck, unit 2 files/9 tests, and integration 3 files/3 tests; build was not invoked. Probe restored. |
| Typecheck coverage | Temporary `const typecheckFailureProbe: string = 1` in the sentinel | Exit 2 with TS2322 and TS6133 after root inclusion. Probe restored. |
| No-match fail closed | `pnpm test:contract -- api-foundation` | Exit 1; no matching contract test files. |
| Inclusion proof | `pnpm typecheck --listFiles` | Exit 0; listed `apps/api/test/contract-harness.contract.test.ts` and `vitest.contract.config.ts`. |
| Final full suite | `pnpm test:all` | Exit 0; typecheck, unit 2 files/9 tests, integration 3 files/3 tests, contract 1 file/1 test, and all three builds passed. |
| Runtime harness | N/A | Root command/typecheck boundary only; the existing integration stage exercised Testcontainers cleanup. |
| Cleanup | Docker label/process checks | 0 Testcontainers-labelled resources and 0 Vitest/integration-runner processes. |
| Rollback | `package.json`, `tsconfig.json`, task marker, and this ledger section | Revert these four paths together; WU-03T remains runnable and WU-03 remains unimplemented. |

### Native accounting

- Begin tree: `aed008bfc59ca035f16ea931bbf9362cde503200`.
- Complete candidate delta: **+47/-11 = 58 changed lines** across exactly four paths: `package.json`, `tsconfig.json`, `openspec/changes/shelfops-mvp/tasks.md`, and `openspec/changes/shelfops-mvp/apply-progress.md`; under the 100-line cap.
- Delivery remains `auto-chain`, `stacked-to-main`; this autonomous slice created no commit, push, PR, review, dependency/lockfile change, or attempt command.

## WU-03TH evidence-only correction (ordinal 19)

- Objective: `sha256:a05fce234c52ec5485085cade61b574074497cf4afb72f022ac99c42494f3cdb`; begin revision: `sha256:f36cb69b36c1718d1fe5f21969f14f20f81f658fb3ef4eaf82f514db433082bc`.
- `git diff --check aed008bfc59ca035f16ea931bbf9362cde503200 7105cbcf50a59c987a55ff601c666c8a477eee94` exited 0 with no output.
- Ordinal 19 is evidence-only; its terminal identity is external-ledger-authoritative and intentionally not self-referenced in this artifact.

## WU-03 blocked budget evidence (ordinal 20)

- Strict-TDD safety net: `pnpm test:contract -- contract-harness` exited 0 (1 file, 1 test).
- RED: a new `api-foundation.contract.test.ts` was authored before production code; `pnpm test:contract -- api-foundation` exited 1 because `packages/contracts/src/pagination.js` did not exist. The test asserted the `/api/v1` default limit, 200 maximum, stable error envelope/correlation ID, unknown-field rejection, signed cursor binding, invalid/expired cursors, and `503 temporarily-unavailable`.
- The temporary RED test and all temporary production probes were removed before stopping; no task checkbox changed and no product path remains modified.
- Blocker: the minimal implementation measured during the stopped cycle is about 283 authored test/source lines before the generated OpenAPI snapshot, required API-conventions guide, and mandatory task/progress evidence. The generated 3.1 snapshot alone is about 150 lines, so the complete direct delta cannot satisfy the hard 400-line cap. No size exception is authorized and the task contingency says to defer route examples, which does not remove the required snapshot/docs/evidence.
- TDD table: RED ✅ (actual missing-module failure); GREEN/TRIANGULATE/REFACTOR ⛔ blocked by the hard direct-delta cap. This is intentionally not marked complete.
- Rollback/cleanup: no product behavior remains to revert; the only retained change is this blocker evidence.

## WU-03 retry blocked by API build boundary (ordinal 21)

- Maintainer approved `exception-ok` / `size:exception` for WU-03 only, with a 600-line complete direct-delta cap from tree `5ca54596c927cd17bd18e72ce33de17c85e76f82`.
- Repeated Strict-TDD RED: the recreated `api-foundation.contract.test.ts` failed because `packages/contracts/src/pagination.js` was absent. The safety sentinel was green (1 file/1 test).
- Temporary GREEN/TRIANGULATE implementation passed `pnpm test:contract -- api-foundation` (1 file/4 tests) and the JSON OpenAPI 3.1 lint/snapshot-diff probe. `pnpm typecheck` then failed with TS18046 in the new error handler; `pnpm build` also failed because the allowed API package cannot import shared contract source outside `apps/api/src` while its immutable `rootDir` is `src` (TS6059).
- The required safe fix is an API/package boundary change (`apps/api/tsconfig.json` or the API/contracts package manifests/exports), all forbidden by this WU's allowed paths. Per scope guard, all temporary product/test/docs/snapshot files were removed. Tasks remain unchecked.
- Cleanup/rollback: no WU-03 product behavior remains; only this merged evidence is retained. No commit, push, PR, review, dependency/configuration change, or native attempt command was created.

## WU-03P buildable contracts workspace boundary

- Scope: built public subpaths only; no API `rootDir` change, API source behavior, TypeBox schema, error/cursor logic, route, middleware, OpenAPI, example, or documentation landed. WU-03 remains unchecked.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-03P package boundary | `apps/api/test/contracts-package.contract.test.ts` | Contract/package resolution | N/A (new files) | `pnpm test:contract -- contracts-package`: exit 1; `Cannot find package '@shelfops/contracts/common'` | After build/export/workspace wiring: exit 0; 1 file/1 test passed | contracts build, focused test, API build, and typecheck exited 0; `api-foundation` exited 1 on no match | None needed; three independent neutral subpath markers are the final structure |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused test | `pnpm test:contract -- contracts-package` | Exit 0; Vitest v4.1.10: 1 file/1 test passed. |
| Build/typecheck triangulation | `pnpm --filter @shelfops/contracts build`; API build; `pnpm typecheck`; `pnpm test` | Each exit 0; API build and contracts build compiled successfully; root unit suite passed 2 files/9 tests. |
| No-match guard | `pnpm test:contract -- api-foundation` | Exit 1; no test files found, so future WU-03 RED cannot false-green. |
| Runtime harness | N/A | Package build/export/import resolution only; no service, port, container, or product runtime boundary. |
| Rollback boundary | WU-03P allowed paths | Revert the contracts manifest/config/placeholders, API manifest/test, and lockfile together; WU-03TH remains runnable and WU-03 behavior remains absent. |

### Accounting and cleanup

- `pnpm install --lockfile-only` and `pnpm install --frozen-lockfile` both exited 0. No failure probe remains; ignored `dist/` output is the only generated build output.
- Direct accounting from `1a9750e30cbfb60f16306a9bab1b5672f7ed7cb8` to interrupted finish tree `b9d4cad90e7a92af9671faf78ef96b227b7f5742`: product-authored **+42/-0 = 42**; generated lockfile **+3/-0 = 3**; task/evidence **+29/-4 = 33**; complete **+74/-4 = 78** across 10 allowed/evidence paths.
- Exact paths: `apps/api/package.json`, `apps/api/test/contracts-package.contract.test.ts`, `packages/contracts/package.json`, `packages/contracts/src/{common,errors,pagination}.ts`, `packages/contracts/tsconfig.json`, `pnpm-lock.yaml`, `openspec/changes/shelfops-mvp/{tasks.md,apply-progress.md}`.

## WU-03P recovery re-verification (ordinal 23)

- From ordinal-23 begin tree `b9d4cad90e7a92af9671faf78ef96b227b7f5742`, sequential recovery checks passed: frozen install, contracts build, focused contract test (1 file/1 test), API build, typecheck, and unit test (2 files/9 tests) each exited 0; `api-foundation` correctly exited 1 on no match; `git diff --check` exited 0.
- Scope recheck confirmed the API `rootDir` remains `src`, only the three neutral package markers exist, no WU-03 behavior landed, all four WU-03P tasks are checked, and all WU-03 tasks remain unchecked. No product, config, test, task, or lockfile bytes changed during recovery.

## WU-03P clean-checkout ordering correction (ordinal 24)

- Scope: only root `package.json` now builds `@shelfops/contracts` before contract Vitest; dist-only exports and API `rootDir: src` remain unchanged.
- RED with `packages/contracts/dist` absent: `pnpm test:contract -- contracts-package` exited 1 before tests because `@shelfops/contracts/common` could not resolve.
- GREEN with `dist` absent: the same command built contracts first and passed 1 file/1 test; `pnpm test:contract -- api-foundation` exited 1 solely on no matching files.
- Safety: `pnpm typecheck` and `git diff --check` exited 0. Runtime harness: N/A — command/package-resolution boundary only.
- Cleanup: generated ignored `packages/contracts/dist` was removed after proof; review state is disabled/unmanaged.

## WU-03 stopped verification attempt (ordinal 25)

- Strict-TDD RED was recreated first: `pnpm test:contract -- api-foundation` exited 1 because `../src/openapi.js` was absent. The candidate test imported only the three WU-03P public contracts subpaths.
- Temporary GREEN covered `/api/v1`, correlation-safe validation failures, 50/200 limits, signed cursor binding and expiry, `503 temporarily-unavailable`, and generated OpenAPI 3.1 snapshot lint/diff. The focused selector passed 1 file/3 tests after implementation.
- Final verification stopped at `pnpm typecheck`: TS2345 reported `request.query` as `unknown` at the API foundation pagination boundary. This was diagnosed once; no retry or scope expansion occurred. The prior `contract-harness` and `contracts-package` selectors each passed 1 file/1 test.
- Cleanup/rollback: removed every temporary WU-03 source, test, OpenAPI snapshot, and API-conventions document; restored the three WU-03P neutral contract markers; removed generated contracts/API `dist` output. WU-03 checkboxes remain unchecked.
- Rollback boundary: the shared contract placeholders, API foundation source/test, committed OpenAPI snapshot, and conventions guide would have reverted as one boundary; no product bytes remain after the stopped attempt.
- Begin tree: `dfca28c8a575149de212dfc1b74a956b1b8c0028`. Complete direct accounting after cleanup: **+10/-0 = 10 changed lines** across the persisted evidence path only. The external candidate snapshot is authoritative and this entry is intentionally not self-referential.
- No native review/RDD, `sdd-attempt`, commit, push, branch alteration, or PR action occurred.

## WU-03 Judgment Day correction (round 1)

- Scope: JD-001 and JD-002 only. `CursorPayload` now requires a finite `expiresAt` and canonical `sort`; runtime verification compares subject, filters, sort, and expiry. The API root supplies its canonical `{ filters: "all", sort: "id:asc" }` context.
- Strict-TDD evidence: safety baseline `pnpm test:contract -- api-foundation` passed 3/3. After adding the missing-expiry and filter/sort-mismatch contract cases, the selector failed with a cursor response body instead of `validation-failed`; minimal implementation then passed 3/3.
- Sequential proof: `contract-harness` 1/1, `contracts-package` 1/1, `api-foundation` 3/3, `pnpm typecheck`, contracts build, API build, unit smoke 6/6, and OpenAPI parse/determinism all passed. `git diff --check` and cleanup are recorded with this correction result.
- Tasks: all four WU-03 task markers remain checked because every correction proof passed. Suspect and informational Judgment Day findings remain untouched.

## WU-03 completed retry (ordinal 26)

### TDD Cycle Evidence

| Task | Test | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- |
| WU-03 API foundation | `apps/api/test/api-foundation.contract.test.ts` | `pnpm test:contract -- api-foundation` exit 1: missing `../src/openapi.js` | 3/3 passed | Unknown/over-limit/expired/subject-bound cursors, 503, parse/lint, and generated-document snapshot equality passed | Preserved WU-03P public boundary markers after its existing 1/1 sentinel exposed their removal |

### Evidence and containment

- Production: public TypeBox schemas, schema-derived `ApiQuery` route generic (no cast), pre-validation unknown-query rejection, correlation-safe 400/503 mapping, HMAC signed cursor with runtime payload validation, dynamic Swagger 3.1 document, committed snapshot, and conventions guide.
- Initial final safety run exposed `contracts-package` sentinel failure because replacing neutral exports removed its required compatibility markers. Diagnosis occurred once; the markers were retained alongside the shared contracts. The rerun passed.
- Final sequential results: `contract-harness` 1/1, `contracts-package` 1/1, `api-foundation` 3/3, structural OpenAPI parse/lint, `pnpm typecheck`, contracts build, API build, and unit smoke 6/6: all exit 0.
- Cleanup: generated contracts/API `dist` contains no files (only ignored empty directories remain); no listener, Testcontainers resource, or test-runner process was created by this HTTP-injection-only slice. `review-ledger.md` was not edited.
- Rollback: remove the three shared contract files, three API foundation files, API-foundation test, OpenAPI snapshot, conventions guide, these four task marks, and this ordinal record together; WU-03P remains runnable.
- Complete direct accounting from begin tree `1e8104ad4350228b63f036e8d919a029f045b831`: **+313/-8 = 321 changed lines** across 11 paths: the 9 product/document/test paths plus `tasks.md` and this ledger; below the 600-line exception cap.
- No native review/RDD, `sdd-attempt`, commit, push, branch alteration, or PR action occurred.

## WU-03 Judgment Day correction (round 2)

- Scope: JD-A-005 only; the root response schema and route now return the signed cursor string rather than decoded `{ lastId }`.
- RED: `pnpm test:contract -- api-foundation` exited 1 because the response cursor was `{ lastId: "incident-1" }`, not a reusable opaque string.
- GREEN: the focused contract now proves a string response cursor hides the decoded tie-breaker and succeeds unchanged on the next request; 3/3 passed.
- Sequential proof: API foundation 3/3, contract harness 1/1, contracts package 1/1, typecheck, contracts build, API build, unit smoke 6/6, OpenAPI parse/determinism, and `git diff --check` all exited 0.
- Cleanup: generated contracts/API `dist` output and test processes are removed; HTTP injection created no listener. Rollback boundary: revert `packages/contracts/src/common.ts`, `apps/api/src/openapi.ts`, `apps/api/test/api-foundation.contract.test.ts`, and `openapi/openapi.json` together; the ledger/progress entries are evidence only.
- Native attempt begin: identity `sha256:eba70a1770d807192b050d38728c641a255ec8ec880253216d8a324e95d23f94`; tree `20f6b90d39b92ba7d5d507ed1a35b4b114e10604`. Parent owns native finish; no self-referential candidate identity is stored here.

## WU-03Q API contract quality hardening — stopped (ordinal 26)

- Scope was restricted to the five WU-03Q tasks and allowed paths. All five task markers remain unchecked; completed WU-03 remains checked and WU-04 remains unchecked.
- Safety net: `pnpm test:contract -- api-foundation` exited 0 (1 file, 3 tests).
- RED: the focused selector exited 1 with 14 assertion failures, proving generic `query/invalid` flattened `limit`, unknown-field, and cursor metadata; shared 400/503 enums; and missing `X-Correlation-Id` response headers.
- Temporary GREEN: field-aware error mapping, status-specific response schemas, headers, and regenerated OpenAPI made `pnpm test:contract -- api-foundation` exit 0 (1 file, 3 tests). Triangulation added two distinct unknown query keys; deterministic generated-document JSON parsing, repeated-byte equality, status enums, and response headers passed.
- Verification stopped exactly once at `pnpm typecheck`: exit 2, `apps/api/test/api-foundation.contract.test.ts(55,19): TS18048: 'response' is possibly 'undefined'`. The prior API-foundation, contract-harness, and contracts-package selectors each passed; contracts build, API build, unit smoke, root `pnpm test:all`, and final diff check were not run after the failure.
- Cleanup/rollback: reverted every temporary WU-03Q production, focused-test, and OpenAPI artifact change; removed generated API/contracts `dist` files. Fastify used `app.inject()` only and created no listener. No WU-03Q behavior remains. Historical Judgment Day WARNING rows were not edited or treated as a fix loop.
- Begin identity/tree: `sha256:c2d03419044618b7dce3b3c8447a867f3594322630a416fb0aef9a55e4048b22` / `7926d58ed1afef398cd3ea3c2737d7ce841b461d`; direct temporary-index accounting is +10/-0 = 10 changed lines, one path, under 180. Parent owns finish identity, evidence revision, and native attempt finalization.

## WU-03Q authorized retry — failed (ordinal 28)

- Scope remained the five unchecked WU-03Q tasks. The temporary validation-detail, status-specific-schema, correlation-header, focused-test, and regenerated-OpenAPI bytes were fully rolled back after the required final gate failed; WU-03 remains complete and WU-04 remains untouched.

### TDD Cycle Evidence

| Task | Test file | Safety net | RED | GREEN | TRIANGULATE / REFACTOR |
| --- | --- | --- | --- | --- | --- |
| WU-03Q contract hardening | `apps/api/test/api-foundation.contract.test.ts` | `pnpm test:contract -- api-foundation`: exit 0, 1 file/3 tests | Exit 1, 1 file: field names/codes and status/header schemas failed | Exit 0, 1 file/3 tests after minimum implementation | Two unknown-query keys plus over-limit and invalid/expired/context-mismatch cursors; generated and committed status/header assertions passed. No further refactor was needed. |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Contract sentinels | `pnpm test:contract -- contract-harness`; `-- contracts-package`; `-- api-foundation` | Each exit 0; 1 file/1 test, 1/1, and 1/3 respectively. |
| Type/build/smoke | `pnpm typecheck`; contracts build; API build; `pnpm test:unit -- smoke` | Each exit 0; smoke: 1 file/6 tests. |
| Required final gate | `pnpm test:all` | Exit 1: unit stage passed 2 files/9 tests; PostgreSQL Testcontainers could not find a working container runtime and Docker npipe `dockerDesktopLinuxEngine` was unavailable. |
| Runtime harness | Fastify `app.inject()` only | Temporary contract behavior passed without a listener; external runtime is N/A. |
| Rollback boundary | WU-03Q allowed product/test/OpenAPI paths | Reverted all temporary bytes; only this failure evidence remains. |

- Not run after the failed required gate: final OpenAPI byte-determinism/no-diff proof and `gentle-ai doctor`. Cleanup removed generated API/contracts `dist` files; no listener was created and no temporary probe remains. Direct accounting against begin tree `63f92793be040590be2680ef4fee45008b6a0293` is +22/-0 = 22 changed lines, one evidence path, under 180; `git diff --check` passed.

## WU-03Q preflight stop (ordinal 30)

- Scope remained the five unchecked WU-03Q tasks and their allowed paths. No production, test, OpenAPI, task-marker, generated-output, listener, or Testcontainers bytes were created or changed.
- Docker preflight was run once before the baseline selector: `docker desktop status` reported `Status stopped`; `docker info` still reached the Linux server (`desktop-linux`, server `29.6.2`). The explicit preflight rule requires stopping when either health check is not healthy, so no further gate was run.
- No WU-03Q rollback was required because the work unit had not started writing bytes. All five WU-03Q task markers remain unchecked; WU-03 remains complete and WU-04 remains untouched.
- Begin revision/identity/tree remain `sha256:1443b907c30e292e67891acb8d10b2c7f26f929397a87136a938f8d813e5627b` / `sha256:6021ad4e64bef0faafdf33c917bb39c4abef285d56a245209749428b72a0f058` / `9012544fca1044cff8c9a27462794bdddcda4bdf`. The only ordinal-30 change is this failure evidence; parent owns native attempt completion and all review/gate commands.

## WU-03Q authorized retry stopped (ordinal 31)

- Scope was limited to the five unchecked WU-03Q tasks and their allowed paths. WU-03 remains complete, WU-04 remains untouched, and all five WU-03Q markers remain unchecked.
- Docker health preflight passed without using `docker desktop status`: `docker version --format '{{.Server.Os}} {{.Server.Version}} {{.Server.Platform.Name}}'` returned `linux 29.6.2 Docker Desktop 4.83.0 (234302)`; `docker info --format '{{.OSType}} {{.ServerVersion}} {{.Name}}'` returned `linux 29.6.2 docker-desktop`.
- Safety net: `pnpm test:contract -- api-foundation` exited 0 with 1 file and 3 tests passed.
- RED: after adding field-specific validation and status/header OpenAPI assertions, the same selector exited 1 with 2 failures: the over-limit response was `{ name: "query", code: "invalid" }` rather than `{ name: "limit", code: "maximum" }`, and generated OpenAPI had no status-specific `code.enum`.
- GREEN: minimum contract changes made the same selector exit 0 with 1 file and 5 tests passed. The tests exercised over-limit input, two distinct unknown keys, invalid/expired/context-mismatch cursors, status-specific 400/503 schemas, and 200/400/503 correlation headers.
- Sequential proof stopped at `pnpm typecheck` (exit 2): `apps/api/src/openapi.ts(2,24): error TS6133: 'InvalidCursorError' is declared but its value is never read.` No later gate was run: contracts/API builds, unit smoke, `pnpm test:all`, deterministic OpenAPI proof, diff/accounting, and `gentle-ai doctor` remain unrun.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-03Q validation and OpenAPI hardening | `apps/api/test/api-foundation.contract.test.ts` | Fastify contract | 3/3 passed | Same selector: 2 failures with generic field metadata and absent status enum | Same selector: 5/5 passed after minimum implementation | Two distinct unknown keys; invalid, expired, and context-mismatch cursor paths; generated and committed 200/400/503 schema/header assertions | None performed; the required sequential typecheck stopped before a refactor could be verified. |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Docker server check | `docker version --format '{{.Server.Os}} {{.Server.Version}} {{.Server.Platform.Name}}'` | Exit 0; Linux Docker Desktop server 29.6.2. |
| Docker daemon check | `docker info --format '{{.OSType}} {{.ServerVersion}} {{.Name}}'` | Exit 0; `linux 29.6.2 docker-desktop`. |
| Focused safety / GREEN | `pnpm test:contract -- api-foundation` | Baseline exit 0, 1 file/3 tests; RED exit 1, 1 file/2 failed tests; GREEN exit 0, 1 file/5 tests. |
| Contract sentinels | `pnpm test:contract -- contract-harness`; `pnpm test:contract -- contracts-package` | Each exit 0; 1 file/1 test passed. |
| Typecheck stop | `pnpm typecheck` | Exit 2; TS6133 unused `InvalidCursorError` import in temporary ordinal-31 `apps/api/src/openapi.ts`. |
| Runtime harness | Fastify `app.inject()` only | Focused tests created no listener; external runtime is N/A for this in-process contract boundary. |
| Cleanup | Removed temporary API/contracts `dist` files; `docker ps -aq --filter label=org.testcontainers=true` | Exit 0 with no output; no Testcontainers-labelled resource remained. |
| Rollback boundary | WU-03Q allowed contract source, API source, focused test, and OpenAPI artifact | Restored every temporary ordinal-31 behavior/test/OpenAPI byte. This ledger entry is the only retained ordinal-31 change. |

- Begin revision/identity/tree: `sha256:adf1ac7f755f86293812edaa8fa1713be1d9c554d1e8b5cc6d13ec7b22487d33` / `sha256:523cd976981208a4a7c635cab9cee8d44be14e1ccb60bd6797aeabf7596ce703` / `d767c1a19e5719b153796f1f2913650569454054`.
- Parent owns native candidate accounting, finish identity, receipt, review, and gate commands. No commit, branch, stage, push, PR, review, RDD, `gentle-ai sdd-attempt`, or `gentle-ai doctor` command was invoked.

## WU-03Q authorized retry stopped (ordinal 32)

- Scope was limited to the five unchecked WU-03Q tasks and their allowed paths. WU-03 remains complete, WU-04 remains untouched, and all five WU-03Q markers remain unchecked.
- Docker checks passed exactly once: `docker version` reached Docker Desktop 4.83.0 server Engine 29.6.2 on `linux/amd64`; `docker info` reported `OSType: linux`, `Name: docker-desktop`, and zero containers.
- Strict-TDD safety net: `pnpm test:contract -- api-foundation` exited 0 with 1 file and 3 tests passed. RED then exited 1 with 2 expected assertion failures: generic `query/invalid` validation metadata and shared 400/503 code schemas did not meet the new contract.
- The first focused GREEN execution stopped at 1 failing test before completion because the newly generated OpenAPI document no longer equalled the committed artifact. No retry was run. The temporary field-specific validation, status-specific-schema, header, test, and OpenAPI changes were restored byte-for-byte to their ordinal-32 baseline immediately after that failure.
- No later command was run: `contract-harness`, `contracts-package`, typecheck, builds, unit smoke, `test:all`, deterministic OpenAPI proof, diff/accounting, and `gentle-ai doctor` remain unexecuted. Generated contract/API `dist` output was removed; Fastify used no listener, the checked listener count was zero, and the one final `docker ps -aq --filter label=org.testcontainers=true` query returned no resource IDs.
- Rollback boundary: `packages/contracts/src/{errors,pagination}.ts`, `apps/api/src/{schemas,error-handler,openapi}.ts`, `apps/api/test/api-foundation.contract.test.ts`, and `openapi/openapi.json` are restored. This ordinal retains only truthful apply-progress evidence; parent owns candidate-tree and evidence-hash finalization.
- Begin revision/identity/tree: `sha256:f37b42d70fca574a0d3f6c4e41d51e58f410dff1b05ec0e4118b2f684bf70c92` / `sha256:8af04ec48e0b9a1db656cd13acc49fd30f5c28989765aaf5f17ad24b7b7a038b` / `cc4f6960347403c13f87328f03b0198e866f3ce1`. No ordinal-32 candidate tree was calculated after the stop; the 180-line cap was therefore not admitted or claimed.

## WU-03Q authorized retry stopped (ordinal 33)

- Scope was limited to the five unchecked WU-03Q tasks and their allowed paths. WU-03 remains complete, WU-04 remains untouched, and all five WU-03Q markers remain unchecked.
- Docker checks passed exactly once: `docker version --format '{{.Server.Os}} {{.Server.Version}}'` returned `linux 29.6.2`; `docker info --format '{{.OSType}} {{.OperatingSystem}}'` returned `linux Docker Desktop`.
- Strict-TDD safety net: `pnpm test:contract -- api-foundation` exited 0 with 1 file and 3 tests passed. RED then exited 1 with 2 expected failures: the over-limit response retained generic `query/invalid` metadata, and the committed 400 schema retained the shared error-code union with no response header declaration.
- Temporary minimal behavior/schema changes were made only after RED. The required pre-GREEN OpenAPI generator command failed before it wrote the artifact because PowerShell expanded the JavaScript `${JSON.stringify(...)}` expression before `tsx` received it, producing an esbuild parse error. Per the one-pass/no-retry rule, no focused GREEN execution was run.
- All temporary WU-03Q behavior, test, and OpenAPI bytes were restored from the ordinal-33 begin tree. Generated `packages/contracts/dist` and `apps/api/dist` outputs were removed. No task marker changed.
- No later verification command was run: `contract-harness`, `contracts-package`, typecheck, builds, unit smoke, `test:all`, second-generation proof, diff/accounting, and `gentle-ai doctor` remain unexecuted. One final cleanup label query ran after rollback.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-03Q validation and OpenAPI hardening | `apps/api/test/api-foundation.contract.test.ts` | Fastify contract | 1 file/3 tests passed | Same selector: 2 expected failures for generic validation fields and shared OpenAPI error schema/header omission | Not run: required OpenAPI generation command failed before GREEN | Not run | Not run |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Docker server check | `docker version --format '{{.Server.Os}} {{.Server.Version}}'` | Exit 0; `linux 29.6.2`. |
| Docker daemon check | `docker info --format '{{.OSType}} {{.OperatingSystem}}'` | Exit 0; `linux Docker Desktop`. |
| Focused safety / RED | `pnpm test:contract -- api-foundation` | Baseline exit 0, 1 file/3 tests; RED exit 1, 1 file/2 failed tests. |
| Pre-GREEN generator | Contracts build followed by `tsx --eval` invoking `openApiDocument()` | Contracts build passed; generator exited 1 with esbuild `Expected ")" but found "{"` after PowerShell interpolation. No OpenAPI byte was written. |
| Runtime harness | Fastify `app.inject()` only | No GREEN runtime execution occurred; no listener was created. |
| Cleanup label query | `docker ps -aq --filter label=org.testcontainers=true` | Exit 0 with no output; no Testcontainers-labelled resource remained. |
| Rollback boundary | WU-03Q allowed contract/API source, focused test, and OpenAPI artifact | Restored `packages/contracts/src/{errors,pagination}.ts`, `apps/api/src/{schemas,error-handler,openapi}.ts`, `apps/api/test/api-foundation.contract.test.ts`, and `openapi/openapi.json` from the begin tree. |

- Begin revision: `sha256:199256ce5135f1b76206451613900e7bc164cb9f21ddd60c2a820e0abf1e61fa`.
- Begin identity: `sha256:f976959aa8870a9fb1f79603a4840e45116bab8bdc9bbce722b7bfb92836a3f5`.
- Begin tree: `e3884ca16a9963a60ced926091973db52395e591`. No ordinal-33 candidate tree or evidence hash was calculated after the stop; parent owns final accounting and evidence finalization.

## WU-03Q authorized retry stopped (ordinal 34)

- Scope was limited to the five unchecked WU-03Q tasks and their allowed paths. WU-03 remains complete, WU-04 remains untouched, and all five WU-03Q markers remain unchecked.
- Docker checks ran once each against the reachable Linux daemon: server-side `docker version` reported Engine `29.6.2` on `linux/amd64`; `docker info` returned `linux 29.6.2`.
- Strict-TDD safety net: `pnpm test:contract -- api-foundation` exited 0 with 1 file and 3 tests passed.
- RED test authoring introduced a TypeScript syntax error in `apps/api/test/api-foundation.contract.test.ts`. The one focused RED command exited 1 before tests ran with Vite/OXC `Expected ',' or '}' but found ')'` at line 109. This was not a valid behavioral RED result, so no production implementation or OpenAPI generation was attempted.
- Per the one-pass stop rule, the focused test was restored to its ordinal-34 baseline immediately. Generated contracts/API `dist` output was removed. No task marker changed and no later selector, build, root suite, determinism proof, diff/accounting, or doctor command was run.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-03Q validation and OpenAPI hardening | `apps/api/test/api-foundation.contract.test.ts` | Fastify contract | 1 file/3 tests passed | Failed before execution: authored syntax error; test file restored | Not run | Not run | Not run |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Docker server check | `docker version --format '{{json .Server}}'` | Exit 0; reachable Engine `29.6.2` on `linux/amd64`. |
| Docker daemon check | `docker info --format '{{.OSType}} {{.ServerVersion}}'` | Exit 0; `linux 29.6.2`. |
| Focused safety | `pnpm test:contract -- api-foundation` | Exit 0; Vitest 1 file/3 tests passed. |
| Focused RED | `pnpm test:contract -- api-foundation` | Exit 1; 0 tests ran because Vite/OXC reported `Expected ',' or '}' but found ')'` at `api-foundation.contract.test.ts:109:6`. |
| Runtime harness | Fastify `app.inject()` only | No valid RED or GREEN runtime execution occurred; no listener was created. |
| Cleanup | Removed generated contracts/API `dist`; one Testcontainers/process/listener check | `TESTCONTAINERS_LABELLED_RESOURCE_COUNT=0`; `NODE_PROCESS_COUNT=7`; `NODE_LISTENER_COUNT=0`. |
| Rollback boundary | WU-03Q allowed contract/API source, focused test, and OpenAPI artifact | Restored the focused test; no production or OpenAPI byte changed. The ordinal-34 evidence entry is the only retained change. |

- Begin revision/identity/tree: `sha256:e5224eb331e5edc9485f10716df2c6d9d86cbb05ac475bc10751c7e7d1b87ee6` / `sha256:243262a73515475632b18ae788cf40fc5a9e2873be13b1f7deb1e74e8aec84c8` / `a71252a72af6585676ec6e9428b6509a13b77109`.
- Parent owns candidate-tree accounting, evidence hashing, review, gate, and `gentle-ai doctor` commands. No commit, branch, stage, push, PR, review, RDD, or `sdd-attempt` command was invoked.

## WU-03Q authorized retry stopped (ordinal 35)

- Scope was limited to the five unchecked WU-03Q tasks and their allowed paths. WU-03 remains complete, WU-04 remains untouched, and all five WU-03Q markers remain unchecked.
- Docker checks ran once each against the reachable Linux daemon: server-side `docker version` reported Engine `29.6.2` on `linux/amd64`; `docker info` returned `linux 29.6.2`.
- Strict-TDD safety net: `pnpm test:contract -- api-foundation` exited 0 with 1 file and 3 tests passed.
- RED tests were authored before production changes. The first authoring sanity check found only new-test TS2345 header-type errors; the authorized single correction widened the test-only header type and the one rerun exited 0. The one semantic RED selector then executed 5 tests and failed 3 intended assertions: generic `query/invalid` validation detail and missing OpenAPI correlation-header/status-specific schema declarations.
- Minimal production changes were authored, but the required pre-GREEN generator command exited 1 before writing `openapi/openapi.json`: PowerShell removed JavaScript string quotes from the exact inline `tsx --eval` argument, and esbuild reported `Expected ")" but found ":"` at `/eval.ts:1:59`. Per the bounded no-retry rule, no focused GREEN, harness, build, root suite, determinism proof, accounting, or doctor command was run.
- All temporary WU-03Q contract/API/test/OpenAPI behavior bytes were restored to tree `4abdcdde01c3aa4246e1ab3b17e1598463375e24`; per-file Git blob hashes matched. Generated `packages/contracts/dist` and `apps/api/dist` outputs were removed. No task marker changed.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-03Q validation and OpenAPI hardening | `apps/api/test/api-foundation.contract.test.ts` | Fastify contract | 1 file/3 tests passed | Authored first; one syntax/type correction authorized and applied; semantic selector executed 5 tests with 3 intended failures | Not run: required OpenAPI generator failed before GREEN | Not run | Not run |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Docker server check | `docker version --format '{{json .Server}}'` | Exit 0; reachable Engine `29.6.2` on `linux/amd64`. |
| Docker daemon check | `docker info --format '{{.OSType}} {{.ServerVersion}}'` | Exit 0; `linux 29.6.2`. |
| Focused safety | `pnpm test:contract -- api-foundation` | Exit 0; Vitest 1 file/3 tests passed. |
| RED authoring sanity | `pnpm exec tsc --noEmit --pretty false` | First exit 2: only new-test TS2345 header-type errors. Authorized correction applied; one rerun exited 0. |
| Focused RED | `pnpm test:contract -- api-foundation` | Exit 1; 1 file executed, 5 tests total, 3 intended assertion failures. |
| Pre-GREEN generator | Exact required `pnpm exec tsx --eval ...` command | Exit 1; PowerShell removed JavaScript string quotes and esbuild reported `Expected ")" but found ":"` at `/eval.ts:1:59`; no OpenAPI byte was written. |
| Runtime harness | Fastify `app.inject()` only | RED exercised the in-process route; no listener was created. No valid GREEN runtime execution occurred. |
| Cleanup and restoration | Blob-hash comparison to tree `4abdcdde01c3aa4246e1ab3b17e1598463375e24`; generated-output removal; Docker/process/listener check | All seven behavior/test/OpenAPI blobs matched; `TESTCONTAINERS_LABELLED_RESOURCE_COUNT=0`; `NODE_PROCESS_COUNT=5`; `NODE_LISTENER_COUNT=0`. |
| Rollback boundary | WU-03Q allowed contract/API source, focused test, and OpenAPI artifact | Restored `packages/contracts/src/{errors,pagination}.ts`, `apps/api/src/{schemas,error-handler,openapi}.ts`, `apps/api/test/api-foundation.contract.test.ts`, and `openapi/openapi.json`; only this truthful OpenSpec/Engram evidence remains. |

- Begin revision/identity/tree: `sha256:baf987b37f90af337b8fad79319f29c593bb3d946159938ea59a4a5084aed044` / `sha256:32bc8d3006d631c5ea44c7e18d80e7b1a1a49f096188b0057ccd791e74c129f5` / `4abdcdde01c3aa4246e1ab3b17e1598463375e24`.
- Parent owns candidate-tree accounting, evidence hashing, review, gate, and `gentle-ai doctor` commands. No commit, branch, stage, push, PR, review, RDD, or `sdd-attempt` command was invoked.

## WU-03Q authorized retry stopped (ordinal 36)

- Scope was limited to the five unchecked WU-03Q tasks and their allowed paths. WU-03 remains complete, WU-04 remains untouched, and all five WU-03Q markers remain unchecked.
- Docker checks ran once each against the reachable Linux daemon: server-side `docker version` reported Engine `29.6.2` on `linux/amd64`; `docker info` returned `linux 29.6.2`.
- Strict-TDD safety net: `pnpm test:contract -- api-foundation` exited 0 with 1 file and 3 tests passed. RED tests were authored before production changes; `pnpm exec tsc --noEmit --pretty false` exited 0 without needing the one permitted correction. The semantic RED selector then executed 3 tests and failed 2 intended assertions: generic `query/invalid` validation detail and missing status-specific OpenAPI/header declarations.
- Minimal temporary production changes preserved opaque signed cursors while adding field metadata, status-specific schemas, and declared correlation headers. The exact required pre-GREEN Base64 decode/eval generator then exited 1 before writing `openapi/openapi.json`: PowerShell removed JavaScript string quotes from the decoded value, and esbuild reported `Expected ")" but found ":"` at `/eval.ts:1:59`. Per the bounded no-retry rule, no focused GREEN, harness, build, root suite, determinism proof, accounting, or doctor command was run.
- All temporary WU-03Q contract/API/test/OpenAPI behavior bytes were restored. Git blob hashes for the seven product/test/OpenAPI paths exactly match tree `afe79be19e9b713d4d2a761b8a499f10b1cb37a5`; generated `packages/contracts/dist` and `apps/api/dist` were removed. No task marker changed.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-03Q validation and OpenAPI hardening | `apps/api/test/api-foundation.contract.test.ts` | Fastify contract | `pnpm test:contract -- api-foundation`: 1 file/3 tests passed | Authored first; syntax/type sanity exit 0; semantic selector executed 3 tests with 2 intended assertion failures | Not run: required pre-GREEN generator failed | Not run | Not run |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Docker server check | `docker version --format '{{json .Server}}'` | Exit 0; reachable Engine `29.6.2` on `linux/amd64`. |
| Docker daemon check | `docker info --format '{{.OSType}} {{.ServerVersion}}'` | Exit 0; `linux 29.6.2`. |
| Focused safety | `pnpm test:contract -- api-foundation` | Exit 0; Vitest 1 file/3 tests passed. |
| RED authoring sanity | `pnpm exec tsc --noEmit --pretty false` | Exit 0 with no output; the authorized test-only correction was not used. |
| Focused RED | `pnpm test:contract -- api-foundation` | Exit 1; 1 file executed, 3 tests total, 2 intended assertion failures. |
| Pre-GREEN generator | Exact required Base64 decode plus `pnpm exec tsx --eval $code` statements | Exit 1; PowerShell removed decoded JavaScript string quotes and esbuild reported `Expected ")" but found ":"` at `/eval.ts:1:59`; no OpenAPI byte was written. |
| Runtime harness | Fastify `app.inject()` only | RED exercised the in-process route; no listener was created. No valid GREEN runtime execution occurred. |
| Cleanup and restoration | Blob-hash comparison to tree `afe79be19e9b713d4d2a761b8a499f10b1cb37a5`; generated-output removal; Docker/listener check | All seven behavior/test/OpenAPI blobs matched; `TESTCONTAINERS_LABELLED_RESOURCE_COUNT=0`; `NODE_LISTENER_COUNT=0`. |
| Rollback boundary | WU-03Q allowed contract source, API source, focused test, and OpenAPI artifact | Restored `packages/contracts/src/{errors,pagination}.ts`, `apps/api/src/{schemas,error-handler,openapi}.ts`, `apps/api/test/api-foundation.contract.test.ts`, and `openapi/openapi.json`; only truthful apply-progress evidence remains. |

- Begin revision/identity/tree: `sha256:2594e07e2a3cc34d845119787e6fae8d4f0d4697a151ea1c10be90534af4fa13` / `sha256:3284def5570b891fc09a72ddfd7a58c52a1d7bbbb27a54e30981286cad08230e` / `afe79be19e9b713d4d2a761b8a499f10b1cb37a5`.
- Parent owns candidate-tree accounting, evidence hashing, review, gate, and doctor commands. No commit, branch, stage, push, PR, review, RDD, or `sdd-attempt` command was invoked.

## WU-03Q authorized retry stopped (ordinal 37)

- Scope was limited to the five unchecked WU-03Q tasks and allowed paths. WU-03 remains complete, WU-04 remains untouched, and all five WU-03Q markers remain unchecked.
- Docker checks ran exactly once each against the reachable Linux daemon: `docker version` reported Engine 29.6.2 on `linux/amd64`; `docker info` reported Docker Desktop Linux Engine 29.6.2.
- Strict-TDD safety net: `pnpm test:contract -- api-foundation` exited 0 with 1 file and 3 tests passed.
- RED tests were authored before production changes. The first TypeScript sanity run exited 2 only because the new `record` narrowing helper returned an unrefined object; the one authorized test-only correction added an explicit record type guard, and the one rerun exited 0. The semantic RED selector then executed 3 tests and failed 2 intended assertions: generic validation fields and absent status-specific OpenAPI/header declarations.
- Minimum temporary contract/API changes were made after RED. The required pre-GREEN command `pnpm exec tsx "C:\Users\picala\AppData\Local\Temp\opencode\shelfops-openapi-generator.ts"` exited 1 before writing `openapi/openapi.json`: the existing contracts `dist` export did not contain the new named error schemas. The bounded no-retry rule stopped the cycle; no focused GREEN, harness, build, root suite, determinism proof, or doctor command was run.
- All temporary WU-03Q behavior, test, and OpenAPI bytes were restored. Generated `packages/contracts/dist` and `apps/api/dist` outputs were removed. The one cleanup query found 0 Testcontainers-labelled resources, 5 Node processes, and 0 Node listeners.
- Post-rollback containment accounting verified all seven temporary behavior/test/OpenAPI blobs against begin tree `2822d6b0821dc8f08953627c8c75c7777b35dee3`; only this progress artifact differs, at +38/-0 = 38 changed lines, under the 180-line cap. `git diff --check` passed for that contained delta.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RED — validation | `apps/api/test/api-foundation.contract.test.ts` | Fastify contract | 1 file/3 tests passed | Authored first; semantic selector failed on stable field metadata | Not run: required generator failed | Not run | Not run |
| RED — OpenAPI | `apps/api/test/api-foundation.contract.test.ts` | Fastify contract | Same selector baseline | Authored first; semantic selector failed on status-specific schemas and correlation headers | Not run: required generator failed | Not run | Not run |
| GREEN | Allowed contract/API source paths | Fastify contract | N/A | N/A | Stopped before focused GREEN | Not run | Not run |
| TRIANGULATE | Generated OpenAPI artifact | Contract artifact | N/A | N/A | Not reached | Not run | Not run |
| VERIFY / CLEANUP | Allowed product/test/OpenAPI paths | Cleanup | N/A | N/A | Not reached | Not run | Restored temporary bytes and removed generated output |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Docker server check | `docker version` | Exit 0; reachable Linux Engine 29.6.2. |
| Docker daemon check | `docker info` | Exit 0; Linux Docker Desktop Engine 29.6.2. |
| Focused safety | `pnpm test:contract -- api-foundation` | Exit 0; Vitest: 1 file, 3 tests passed. |
| RED authoring sanity | `pnpm exec tsc --noEmit --pretty false` | First exit 2 with one new-test TS2322 narrowing error; one authorized test-only correction was applied; second exit 0. |
| Focused RED | `pnpm test:contract -- api-foundation` | Exit 1; 1 file executed, 3 tests total, 2 intended assertion failures. |
| Pre-GREEN generator | `pnpm exec tsx "C:\Users\picala\AppData\Local\Temp\opencode\shelfops-openapi-generator.ts"` | Exit 1; stale contracts `dist` export omitted `TemporaryUnavailableSchema`, so the helper did not write the OpenAPI artifact. |
| Runtime harness | Fastify `app.inject()` only | RED exercised the in-process route; no listener was created. No valid GREEN runtime execution occurred. |
| Cleanup query | Generated-output removal plus one Testcontainers/process/listener query | `TESTCONTAINERS_LABELLED_RESOURCE_COUNT=0`; `NODE_PROCESS_COUNT=5`; `NODE_LISTENER_COUNT=0`. |
| Rollback boundary | WU-03Q allowed contract/API source, focused test, and OpenAPI artifact | Restored all temporary behavior/test/OpenAPI bytes; task markers remain unchecked. |

- Begin revision: `sha256:3d6807c6e73c5384f86c124d583ddc0e12af2cd1988fedd9743ef8e65f916724`.
- Begin identity: `sha256:ca338fd299d22165761326f46f3dfc943687c6ecfbabc31c957545b385962fec`.
- Begin tree: `2822d6b0821dc8f08953627c8c75c7777b35dee3`. Parent owns the final candidate tree, evidence revision, review, gate, and receipt processing. No commit, branch, stage, push, PR, review, RDD, or `sdd-attempt` command was invoked.

## WU-03Q execution stopped (ordinal 38)

- All five WU-03Q tasks remain unchecked. Docker `version` and `info` passed against the reachable Linux daemon.
- Safety baseline: `pnpm test:contract -- api-foundation` passed 1 file/3 tests. Semantic RED ran 1 file/4 tests with 2 intended assertion failures: generic validation fields and missing OpenAPI headers/status schemas.
- Temporary GREEN passed `pnpm openapi:generate`, focused contract 1 file/4 tests, contract-harness 1/1, contracts-package 1/1, typecheck after one concrete test/generator CJS correction, API build, unit smoke 1/6, integration 3/3, and `pnpm test:all` (unit 2/9, integration 3/3, contract 3/6, all builds).
- Determinism passed: the second `pnpm openapi:generate` produced SHA-256 `C9C6763D3356A15F81AD9B4D890F4CC859352FDB1BD0AA061C563E0FD16234B8`; OpenAPI 3.1, status-specific 400/503 schemas, and 200/400/503 correlation headers were asserted.
- Stop condition: exact tree-to-worktree line accounting against `9f224f0bda8457091fe0360c6764cc9539484311` measured +359/-146 = 505 changed lines, exceeding the non-exception 220 cap. No completion is valid.
- Rollback restored all temporary WU-03Q contract/API/test/OpenAPI/package/docs bytes and removed the new generator; source/test/OpenAPI/docs comparison passed. Generated dist count, Testcontainers-labelled resources, and Node listeners were each 0. Post-cleanup `gentle-ai doctor` was healthy: 8 passed, 0 failed, 0 warnings.

### TDD Cycle Evidence

| Task | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- |
| WU-03Q | 2 intended assertion failures/4 tests | Temporary 4/4 passed | Generator byte equality and status/header assertions passed | One type-safe tuple/CJS output correction; then typecheck passed |

### Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Runtime harness | Fastify `app.inject()` exercised by the focused contract tests; no listener. |
| Rollback boundary | All WU-03Q allowed behavior/test/generator/docs/OpenAPI bytes together; prior WU-03 and planning history retained. |

## WU-03Q authoritative rerun stopped (ordinal 39)

- Scope was limited to the five unchecked WU-03Q tasks and allowed paths. WU-04 remains untouched; all five WU-03Q task markers remain unchecked.
- Docker server `29.6.2` was reachable. The safety baseline `pnpm test:contract -- api-foundation` passed: 1 file and 3 tests.
- Strict-TDD RED was authored first and executed: 1 file/4 tests with 2 intended failures for generic `limit` validation metadata and missing committed OpenAPI correlation-header/status-specific declarations.
- Temporary GREEN rebuilt `@shelfops/contracts` before `pnpm openapi:generate`; generation and focused GREEN passed 1 file/4 tests. `contract-harness` and `contracts-package` each passed 1 file/1 test.
- Mandatory sequential verification stopped at `pnpm typecheck` with exit 2: TS6133 reported unused `openApiDocument` in the revised contract test, and TS1470 rejected the generator's `import.meta` under the root CommonJS output. Per the no-functional-gate-retry rule, no correction or subsequent gate ran.
- Rollback restored every temporary WU-03Q implementation, test, generated OpenAPI, generator, package, and documentation byte to the begin behavior. Generated contracts output was removed; cleanup found `TESTCONTAINERS_LABELLED_RESOURCE_COUNT=0`, `NODE_LISTENER_COUNT=0`, and no contracts `dist` JavaScript file. No task was completed.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-03Q contract hardening | `apps/api/test/api-foundation.contract.test.ts` | Fastify contract | 1 file/3 tests passed | 1 file/4 tests; 2 intended assertion failures | Temporary generator then focused GREEN: 1 file/4 tests passed | Multiple unknown keys and invalid/expired/context-mismatch cursors exercised | Not completed: authoritative typecheck failure required rollback |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Docker server | `docker info --format '{{.ServerVersion}}'` | Exit 0; `29.6.2`. |
| Focused safety | `pnpm test:contract -- api-foundation` | Exit 0; 1 file/3 tests passed. |
| RED | `pnpm test:contract -- api-foundation` | Exit 1; 1 file/4 tests, 2 intended assertion failures. |
| Temporary GREEN | `pnpm --filter @shelfops/contracts build`; `pnpm openapi:generate`; focused selector | All exit 0; focused selector 1 file/4 tests passed. |
| Sequential gates reached | `pnpm test:contract -- contract-harness`; `pnpm test:contract -- contracts-package` | Each exit 0; 1 file/1 test passed. |
| Authoritative stop | `pnpm typecheck` | Exit 2; TS6133 and TS1470 as recorded above. |
| Runtime harness | Fastify `app.inject()` | Exercised in the focused contract test; no listener. |
| Cleanup | Docker/listener and generated-output query | `TESTCONTAINERS_LABELLED_RESOURCE_COUNT=0`; `NODE_LISTENER_COUNT=0`; contracts dist file absent. |
| Rollback boundary | WU-03Q allowed implementation/test/generated/docs paths | Revert the contract/API mappings, focused test, generator/package/docs, and OpenAPI artifact together; keep WU-03 and existing planning history. |

## WU-03Q completed — corrected ordinal 40

- Scope remained the five WU-03Q tasks and the allowed paths only; WU-04 remains unchecked. The maintainer-authorized `size:exception` cap is 600 complete changed lines.
- Safety baseline: Docker Engine `29.6.2` was reachable and `pnpm test:contract -- api-foundation` passed 1 file/3 tests.
- Strict-TDD RED ran before production changes: 1 file/4 tests with 2 intended failures for generic query metadata and the committed artifact's missing status-specific code/header declarations. GREEN rebuilt contracts before `pnpm openapi:generate`; focused GREEN then passed 1 file/4 tests.
- The durable CommonJS-compatible generator calls `openApiDocument()`, uses `resolve(process.cwd(), "openapi", "openapi.json")`, contains no `import.meta`, writes UTF-8 JSON with one trailing newline, and exits non-zero on failure. The focused test does not import `openApiDocument`.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-03Q API contract hardening | `apps/api/test/api-foundation.contract.test.ts` | Fastify contract | 1 file/3 tests passed | 1 file/4 tests; 2 intended failures | Contracts build + generation + focused selector: 1 file/4 passed | Two unknown query names; over-limit; invalid, expired, and bound-mismatch cursors; generated 400/503 code schemas and 200/400/503 headers | Corrected the documented header declaration before successful focused GREEN; no behavior change beyond the schema representation |

### Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused and sentinels | `pnpm test:contract -- api-foundation`; `-- contract-harness`; `-- contracts-package` | Exit 0: 1 file/4 tests, 1 file/1 test, and 1 file/1 test. |
| Type and builds | `pnpm typecheck`; contracts build; API build | Each exited 0. |
| Runtime harness | Fastify `app.inject()` | Focused tests exercised 200/400/503 without opening a listener. |
| Unit and integration | `pnpm test:unit -- smoke`; `pnpm test:integration`; `pnpm test:all` | Exit 0: smoke 1 file/6 tests; integration 3 files/3 tests; all unit 2/9, integration 3/3, contract 3/6, builds passed. |
| Determinism | Second `pnpm openapi:generate` | Exit 0; byte-equal SHA-256 `71DA83DEFAE4B463E6B79106A15C62698972F53E97D1326169EDD68B1CC77ED1`. |
| OpenAPI semantics | Node JSON parse proof | Exit 0: OpenAPI 3.1, 400-only `validation-failed`, 503-only `temporarily-unavailable`, and `X-Correlation-Id` headers on 200/400/503. |
| Diff and accounting | `git diff --check`; candidate comparison to `71e617adcc60ee7071013e14f0d92702d1f2ee0b` | Exit 0; complete accounting: `+416/-157 = 573`, including the generated OpenAPI, task markers, and cumulative evidence; below the 600-line `size:exception` cap. |
| Cleanup | Removed generated `dist` directories; Docker label and Node listener checks | 0 Testcontainers containers, volumes, and networks; 0 Node listeners. |
| Doctor | `gentle-ai doctor` | Healthy: 8 passed, 0 failed, 0 warnings. |
| Rollback boundary | WU-03Q behavior, test, generator, package/docs, OpenAPI, and task/evidence paths | Revert those paths together while retaining completed WU-03 and all prior ordinal history. |

## WU-04 blocked — ordinal 41

- Delivery remains `auto-chain` with `stacked-to-main`; the active complete changed-line safety cap is 1200. No commit, branch, push, PR, review, or `gentle-ai sdd-attempt` operation was performed.
- Safety baseline: `pnpm test:unit -- smoke` exited 0 with 1 file and 6 tests passed.
- Strict-TDD RED was written first at the task-mandated path `packages/domain/test/authorization-policy.test.ts`, covering role-plus-scope, grants, assigned resolution, supervisor reopen, combined roles, pure denials, and ineligible assignees. The required focused command `pnpm test:unit -- authorization-policy` exited 1 before loading it because `vitest.config.ts` discovers only `packages/**/src/**/*.test.ts`.
- The unit-config change needed to discover the mandated `packages/domain/test/` path is outside WU-04's allowed paths. No production code was written, no GREEN/TRIANGULATE/REFACTOR phase was entered, no task was checked, and the temporary RED test was removed.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-04 authorization policies | `packages/domain/test/authorization-policy.test.ts` | Unit | `pnpm test:unit -- smoke`: 1 file/6 tests passed | Focused selector exited 1: no test files found under `packages/**/src/**/*.test.ts`; temporary RED test removed | Blocked by immutable discovery scope | Not entered | Not entered |

### Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused command | `pnpm test:unit -- authorization-policy` exited 1: `No test files found`; this is a harness/path blocker, not a behavior assertion failure. |
| Runtime harness | N/A — the requested policies are pure functions with no process, database, or HTTP boundary; no GREEN implementation exists. |
| Rollback boundary | The temporary WU-04 RED test was removed. No WU-04 implementation, test, or documentation bytes remain; retain WU-03Q and all prior progress. |

## WU-04 stopped and rolled back — ordinal 42

- This corrected attempt used the authorized discoverable test path `packages/domain/src/authorization/authorization-policy.test.ts`. Ordinal-41 evidence above is preserved unchanged. Delivery remained `auto-chain` / `stacked-to-main`; the active complete changed-line cap was 1200. No commit, branch, push, PR, review, native attempt operation, or WU-05 work occurred.
- Safety baseline: `pnpm test:unit -- smoke` exited 0 with 1 file and 6 tests passed.
- Strict-TDD RED was authored first and covered collaborator, lead, supervisor, inventory, and central role-plus-scope decisions; explicit grants; assigned-only resolution; supervisor-only reopening; combined-role scope bounds; pure denials; and assignment eligibility. `pnpm test:unit -- authorization-policy` exited 1 before assertions because the deliberately absent `action-policy.js` module could not resolve (1 failed suite, 0 tests). This was the intended missing-production RED condition.
- GREEN added a single application `AuthorizedPrincipal` type and pure domain policies; the focused selector then exited 0 with 1 file and 7 tests. TRIANGULATE added the independent compatible-assignee cases; the focused selector exited 0 with 1 file and 8 tests. The policy code reads no framework, database, session, clock, or process state.
- The first direct `pnpm typecheck` could not resolve pre-existing built `@shelfops/contracts/*` outputs because prior cleanup intentionally removed `dist`; it also reported the existing API `request.query` unknown diagnostics. This was an output precondition, not a WU-04 type error. The required sequential build sentinels then passed: contracts build, API build, and root typecheck; the focused selector remained green at 1 file/8 tests.
- The one authoritative `pnpm test:all` run stopped at the existing real PostgreSQL integration suite: root typecheck passed and unit tests passed 3 files/17 tests, then `packages/infrastructure/test/reference-data.test.ts` timed out after 120018 ms. The command exited 1. No retry was made. Docker Engine was reachable at `29.6.2` and the post-stop `org.testcontainers=true` resource query was empty, so this was not a WU-04 policy assertion failure.
- Candidate product accounting against begin tree `128a082ab0fe45366a884a3a9e00d6f74633df3f` produced temporary tree `bfb0eafa03e980e61e01b27e3461ee4d56e8d258`: **+361/-0 = 361 changed lines** across the seven WU-04 implementation, test, and documentation paths. It was under the 1200-line cap, but the mandatory full-suite failure required stopping.
- Rollback removed every candidate WU-04 code, test, and documentation file, including the application principal, all four domain files, the discoverable test, and `docs/authorization.md`. Generated `packages/contracts/dist` and `apps/api/dist` outputs were removed. All four WU-04 task markers remain unchecked; WU-03Q remains preserved and WU-05 remains unchecked.

### TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-04 authorization policies | `packages/domain/src/authorization/authorization-policy.test.ts` | Unit | `pnpm test:unit -- smoke`: 1 file/6 tests passed | 1 failed suite, 0 tests: absent `action-policy.js` before any production behavior | 1 file/7 tests passed | Added independently compatible assignee cases; 1 file/8 tests passed | Shared role, scope, responsibility, grant, action, and decision vocabulary was consolidated in the temporary `types.ts`; all policy bytes were rolled back after the mandatory full-suite failure |

### Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused test | `pnpm test:unit -- authorization-policy`: RED exit 1 with an absent policy module; GREEN exit 0, 1 file/7 tests; TRIANGULATE exit 0, 1 file/8 tests. |
| Build/type sentinels | `pnpm --filter @shelfops/contracts build`; `pnpm --filter @shelfops/api build`; `pnpm typecheck` all exited 0 after rebuilding the intentionally removed contracts output. |
| Full test | One `pnpm test:all` run exited 1: typecheck passed, units passed 3 files/17 tests, then real PostgreSQL `reference-data` timed out after 120018 ms. No retry. |
| Runtime harness | N/A — WU-04 policies are pure and introduce no HTTP, database, process, or external-runtime boundary. The unrelated existing Testcontainers integration stage was reached only by `pnpm test:all`. |
| Accounting | Candidate `128a082ab0fe45366a884a3a9e00d6f74633df3f` → `bfb0eafa03e980e61e01b27e3461ee4d56e8d258`: +361/-0 = 361 across the seven WU-04 product paths, below the 1200-line cap. |
| Cleanup | Removed `packages/contracts/dist` and `apps/api/dist`; no `org.testcontainers=true` resources remained. |
| Rollback boundary | Revert/remove the seven WU-04 candidate files together; retain only this ordinal-42 evidence and all prior planning/apply-progress history. |
| Doctor | `gentle-ai doctor`: healthy, 8 passed, 0 failed, 0 warnings. |

## WU-04H stopped after post-edit gate — ordinal 43

- Docker Server `29.6.2` was reachable. Ordinal-42's `reference-data.test.ts` timeout at `120018ms` remains baseline RED evidence.
- Pre-edit diagnostic `pnpm test:integration -- --no-file-parallelism` exited 0: 3 files/3 tests in 15.84s.
- `test.fileParallelism: false` was temporarily set; three consecutive `pnpm test:integration` runs each exited 0 with 3 files/3 tests (7.17s, 6.66s, 7.17s). After each: labelled containers/volumes/networks = 0/0/0.
- The single authoritative `pnpm test:all` exited 2 at root typecheck before integration: existing `@shelfops/contracts/*` built outputs were absent and existing `apps/api/src/openapi.ts` `request.query` diagnostics appeared. No retry was run.
- Rollback restored `vitest.integration.config.ts`; all WU-04H and WU-04 task markers remain unchecked. Generated `dist` output was removed; containers/volumes/networks and Node listeners were 0/0/0/0; `git diff --check` passed; exact complete accounting was +9/-0 = 9; doctor was 8/0/0.
- Serialization is a validated mitigation for the observed integration runs, not proof that parallelism caused ordinal 42's timeout.

## WU-04TH complete — ordinal 44
- Inherited RED: ordinal 43's clean-state `pnpm test:all` exited 2 before integration because contracts `dist` declarations were absent; it was not rerun.
- Clean-state proof: `packages/contracts/dist` and `apps/api/dist` were absent before proof.
- `pnpm typecheck` ran once and exited 0: contracts built first, then root `tsc --noEmit` passed.
- `pnpm test:contract -- contracts-package` ran once: exit 0, 1 file/1 test passed.
- `pnpm test:unit -- smoke` ran once: exit 0, 1 file/6 tests passed.
- No integration command or `pnpm test:all` ran; WU-04H owns both scopes.
- `git diff --check` exited 0; complete accounting versus `d60bfd8e0a9cfe994b090d662bc2cfbd4b081527` is +18/-6 = 24 lines.
- Cleanup removed generated contracts/API `dist`; both paths are absent.
- `gentle-ai doctor` is healthy: 8 passed, 0 failed, 0 warnings.
- Rollback: restore root `typecheck`, clear contracts/API `dist`, and retain this evidence.
- Runtime harness: N/A — command/build ordering only.

## WU-04H complete — ordinal 45
- Docker Server `29.6.2` was reachable; ordinal 42's `reference-data.test.ts` timeout at `120018ms` remains baseline RED evidence.
- Diagnostic before editing: `pnpm test:integration -- --no-file-parallelism` exited 0, 3 files/3 tests, Vitest 48.41s; wrapper 60861ms.
- Persisted only `test.fileParallelism: false` in `vitest.integration.config.ts`.
- Acceptance 1: `pnpm test:integration` exited 0, 3 files/3 tests, Vitest 8.10s; wrapper 21785ms; labelled containers/volumes/networks 0/0/0.
- Acceptance 2: `pnpm test:integration` exited 0, 3 files/3 tests, Vitest 7.10s; wrapper 19359ms; labelled containers/volumes/networks 0/0/0.
- Acceptance 3: `pnpm test:integration` exited 0, 3 files/3 tests, Vitest 7.46s; wrapper 19566ms; labelled containers/volumes/networks 0/0/0.
- Full suite once: `pnpm test:all` exited 0; typecheck built contracts then `tsc --noEmit`; units 2 files/9 tests; serialized integration 3 files/3 tests; contracts 3 files/6 tests; API/web/worker/contracts builds passed; wrapper 35905ms.
- `git diff --check` exited 0; exact complete accounting versus `f3d504a616e551e09ba1cad19be240d8414c3424` is `+29/-4 = 33` lines.
- Final cleanup removed all generated `dist`; labelled resources and Node listeners were 0/0/0/0; `gentle-ai doctor` was 8/0/0. Rollback restores the config setting and markers while retaining evidence.
- Serialization is validated mitigation for these runs, not proof that parallelism caused ordinal 42's timeout; WU-04 remains unchecked.

### WU-04H TDD Cycle Evidence
| Task | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- |
| Serialization config | Real PostgreSQL integration | Pre-edit diagnostic 3 files/3 tests passed | Ordinal 42 timeout baseline | One structural setting; three authoritative 3/3 passes | Three independent sequential runtime runs | None needed; single config setting |

### WU-04H Work Unit Evidence
| Evidence | Exact result |
| --- | --- |
| Focused/runtime harness | Diagnostic plus three authoritative `pnpm test:integration` runs all exited 0 with 3 files/3 tests; each post-run resource count was 0/0/0. |
| Full harness | `pnpm test:all` once exited 0 through typecheck, units, serialized integration, contracts, and all builds. |
| Rollback boundary | Revert `vitest.integration.config.ts` `fileParallelism` and the four WU-04H markers; retain ordinal-45 evidence. |

## WU-04 complete — ordinal 46

- Delivery remains `auto-chain` / `stacked-to-main`; this bounded work unit started from the supplied candidate tree `5c2ba2c5a7e68684350b93edab547f62954eae00`. No commit, branch, push, PR, review, RDD, `gentle-ai sdd-attempt`, WU-05, persistence, SQL, API, session, dependency, lockfile, migration, or harness change occurred.
- The smallest unit safety sentinel, `pnpm test:unit -- smoke`, exited 0 before behavior edits with 1 file/6 tests.
- Strict-TDD RED was authored first at the discoverable path `packages/domain/src/authorization/authorization-policy.test.ts`. `pnpm test:unit -- authorization-policy` exited 1 with 1 failed suite/0 tests because `./action-policy.js` did not exist. No production authorization module existed before that RED.
- GREEN introduced `AuthorizedPrincipal` exactly once in the application package and pure domain visibility, action, and assignment-eligibility policies. The focused selector passed 1 file/8 tests. Further RED/GREEN cycles exposed and corrected supervisor catalog-grant and central store-policy-grant handling; the selector then passed 1 file/10 and 1 file/11 tests respectively.
- TRIANGULATE covered all five responsibilities, owned/sector visibility, role-plus-scope denials, inventory category limits, explicit-grant non-expansion, assigned-only resolution, supervisor-only reopening, mixed-role bounds, central assigned work, deterministic side-effect-free denials, inactive eligibility, and out-of-scope assignee rejection. The final focused selector ran once after refactor and exited 0 with 1 file/11 tests.
- REFACTOR centralized role, scope, responsibility, grant, action, record, and decision vocabulary in domain `types.ts`; application imports that vocabulary while domain policies do not import application. `docs/authorization.md` documents the principal boundary, policy intersections, assignment rule, decision outcomes, rollback, and deferred wiring.
- Final type gate: `pnpm typecheck` ran once and exited 0 after building `@shelfops/contracts` then root `tsc --noEmit`.
- Full regression gate: `pnpm test:all` ran once and exited 0: unit 3 files/20 tests; serialized PostgreSQL integration 3 files/3 tests; contract 3 files/6 tests; contracts/API/web/worker builds passed.

### WU-04 TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WU-04 authorization policies | `packages/domain/src/authorization/authorization-policy.test.ts` | Unit | `pnpm test:unit -- smoke`: 1 file/6 tests passed | Missing `action-policy.js`: exit 1, 1 failed suite/0 tests | 1 file/8 tests passed after minimal policies | 11 behavioral cases passed, including denied no-op and ineligible candidate paths | Shared vocabulary is in `types.ts`; final focused run remained 1 file/11 tests |

### WU-04 Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused command | Final `pnpm test:unit -- authorization-policy`: exit 0; Vitest 1 file/11 tests. |
| Runtime harness | N/A — these policies are pure functions with no HTTP, database, process, or external-runtime boundary. `pnpm test:all` integration is regression evidence only, not WU-04 runtime behavior. |
| Type and full harness | `pnpm typecheck` once: exit 0. `pnpm test:all` once: exit 0; units 3/20, serialized integration 3/3, contract 3/6, and all builds passed. |
| Rollback boundary | Revert the application principal, four domain authorization files, focused test, authorization guide, WU-04 task markers, and this ordinal-46 evidence; retain WU-04TH/WU-04H and all prior progress. |
| Accounting | Candidate tree measurement `303cd7fda816c4cbcadc6dc0e721ef048366ce46` against `5c2ba2c5a7e68684350b93edab547f62954eae00`: +422/-4 = 426 complete changed lines across 9 allowed paths, below the 1200-line cap. |
| Cleanup and doctor | Generated `dist` directories removed; Testcontainers-labelled containers/volumes/networks and Node listeners were 0/0/0/0; `git diff --check` exited 0; final doctor 8/0/0 follows. |

## WU-05 planning blocker — ordinal 47 (preserved)

- Ordinal 47 stopped before RED and before WU-05 product/test bytes because the prior scope could only create a test-local `/api/v1/me`; the real `buildApi()` composition root registered only `/health` and was out of scope.
- The safe corrective decision authorized `apps/api/src/app.ts` and requires the contract suite to exercise `buildApi()` itself. Test-local registration would have falsely claimed a production-reachable protected route.
- No session, migration, identity adapter, route, dependency, lockfile, vendor configuration, WU-06, commit, branch, push, PR, review, or native-attempt operation occurred. This evidence is retained from Engram #1198.

## WU-05 complete — corrected ordinal 48

- Begin candidate tree: `c9dc99ff02fbcdc5ab26445edbf37becb78fb8ac`. Delivery remained `auto-chain` / `stacked-to-main`; hard cap: 1200 complete changed lines. No commit, branch, push, PR, review, RDD, native-attempt operation, dependency, lockfile, tsconfig, startup, OpenAPI generator, production/pilot OIDC vendor, or WU-06 change occurred.
- Safety sentinel `pnpm test:unit -- smoke` exited 0 with 1 file/6 tests before behavior edits.
- RED was authored first in `packages/application/src/identity/session.test.ts` and `apps/api/test/auth.contract.test.ts`. `pnpm test:unit -- identity` and `pnpm test:contract -- auth` each exited 1 with one failed suite/zero tests because `session.js` was absent.
- GREEN added the application `IdentityProvider` port and development-only adapter, opaque 256-bit session IDs, live session resolution, the auth Fastify module, and `buildApi()` registration. `/health` remains reachable; no configured provider denies; development adapters are rejected in production; client actor claims are ignored; and errors omit session/token data. Focused GREEN passed identity 1 file/2 tests and auth 1 file/4 tests.
- TRIANGULATE covered malformed/unknown/expired/revoked/inactive sessions, ignored actor claims, current roles/scopes/activity between requests, CSRF for cookie-authenticated `/api/v1/me/*` mutation seams, production default denial/rejection, correlation-safe errors, and `/health`. Focused selectors passed identity 1/2 and auth 1/4. The first dev-issuer probe was diagnosed as a readiness/path error, not blindly retried: this mock needs `/isalive` and `/default/.well-known/openid-configuration`. The corrected bounded smoke returned HTTP 200 for both and left 0 compose resources.
- REFACTOR extracted a single-time current-session predicate, retained provider behavior behind `packages/application/src/ports/identity-provider.ts`, and reran identity 1/2 and auth 1/4 successfully. No production provider was selected or configured.
- Migration 002 adds hashed session/CSRF state, expiry/revocation lookup, authoritative role/scope/responsibility/grant tables, and a current-access view. Disposable PostgreSQL applied migrations 001/002 and reported six identity tables/zero current sessions; labelled resources were 0/0/0.
- Initial `pnpm typecheck` found one test-only TS2339 annotation mismatch for Fastify `.json()`. The annotation was corrected from that diagnostic; corrected final `pnpm typecheck` once exited 0. `pnpm test:all` once exited 0: unit 4 files/22 tests, integration 3 files/3 tests, contract 4 files/10 tests, and contracts/API/web/worker builds passed.

### WU-05 TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| OIDC session boundary | `packages/application/src/identity/session.test.ts`, `apps/api/test/auth.contract.test.ts` | Unit + Fastify contract | Smoke 1/6 passed | Absent `session.js`: one failed suite/zero tests per selector | Identity 1/2; auth 1/4 passed | Valid/invalid sessions, live access, actor ignoring, CSRF, production rejection/default deny, health, and issuer smoke | Extracted current-session predicate; both focused selectors still passed |

### WU-05 Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused commands | `pnpm test:unit -- identity` and `pnpm test:contract -- auth`: exit 0; 1 file/2 tests and 1 file/4 tests. |
| Runtime harness | Compose mock issuer bounded `/isalive` and default discovery: HTTP 200/200; `down --volumes --remove-orphans` left 0 resources. |
| Migration structural check | PostgreSQL 16.10 applied migrations 001/002: `IDENTITY_MIGRATION_STRUCTURAL_CHECK=6:0`; labelled resources 0/0/0. |
| Full harness | Corrected `pnpm typecheck` once and `pnpm test:all` once exited 0. |
| Rollback boundary | Revert migration 002, `apps/api/src/app.ts`, auth module, application identity/port, auth contract test, auth examples, guide, compose overlay, four WU-05 markers, and this evidence together; retain `/health`, WU-04/04TH/04H, and ordinal-47 history. |

### WU-05 Final accounting and cleanup

- Complete candidate accounting versus `c9dc99ff02fbcdc5ab26445edbf37becb78fb8ac`: `+444/-9 = 453` changed lines across 13 allowed paths, below the 1200-line cap.
- `AUTH_EXAMPLES_JSON=2`, `docker compose -f infra/compose.oidc.yml config --quiet`, and `git diff --check` exited 0. Generated `packages/contracts/dist` and `apps/{api,web,worker}/dist` were removed; Testcontainers labelled containers/volumes/networks were 0/0/0; port 18080 listeners were 0; `gentle-ai doctor` was 8/0/0.

## WU-05P complete — ordinal 49

- Begin candidate tree: `33ca65101088ff87996eab62bbcfe3d787a48651`; delivery remains `auto-chain` / `stacked-to-main`; hard cap: 420 complete changed lines. No commit, branch, push, PR, review, RDD, native-attempt operation, API auth implementation, API `rootDir`, vendor, WU-05C, or WU-06 change occurred.
- Safety sentinel: `pnpm test:unit -- identity` exited 0 with 1 file/2 tests before the authorized-principal public-import rewiring.
- RED: added `apps/api/test/application-package.contract.test.ts` first. `pnpm test:contract -- application-package` exited 1 with 1 failed suite/0 tests because `@shelfops/domain/authorization/action-policy` could not resolve.
- GREEN: added private ESM domain/application manifests and `src`-to-`dist` declaration builds with test exclusion; exports have only the seven approved public subpaths. Application declares `@shelfops/domain: workspace:*`; API declares `@shelfops/application: workspace:*`; `AuthorizedPrincipal` imports `@shelfops/domain/authorization/types`. `pnpm install --lockfile-only` and `pnpm install --frozen-lockfile` both exited 0 without external version changes. The focused sentinel then passed 1 file/2 tests.
- TRIANGULATE: after removing domain/application/contracts/API `dist`, domain → application → contracts builds, the focused sentinel, API build, root `pnpm typecheck`, and `pnpm test:contract -- contracts-package` each exited 0. Root typecheck produces domain → application → contracts before `tsc --noEmit`. Production-source scans found zero direct `packages/*/src` paths under `apps/api/src` and `packages/application/src`; existing API test source-path imports remain intentionally untouched for WU-05C.
- WU-05 remains architecture-not-accepted until WU-05C passes; WU-06 remains blocked. WU-05P marks only its four task checkboxes complete.

### WU-05P TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Package boundary | `apps/api/test/application-package.contract.test.ts` | Contract/package topology | Identity 1/2 passed | Missing public package import: exit 1, 1 failed suite/0 tests | Focused selector: exit 0, 1 file/2 tests | Clean `dist` dependency-order builds, API build, root typecheck, and contracts sentinel all passed | Narrow manifest-key assertions and source-only import scan; focused selector remained green |

### WU-05P Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused test | `pnpm test:contract -- application-package`: exit 0; Vitest 1 file/2 tests. |
| Runtime harness | N/A — package/export/build topology only; no service, port, or product runtime behavior. |
| Topological proof | With all four relevant `dist` directories absent, domain → application → contracts builds, focused sentinel, API build, root typecheck, and contracts-package sentinel exited 0. |
| Static proof | No `packages/*/src` import occurs in `apps/api/src` or `packages/application/src`; retained `apps/api/test/auth.contract.test.ts` source imports are WU-05C-owned and unchanged. |
| Rollback boundary | Revert root/API/package manifests, public-import rewiring, lockfile, package sentinel, four WU-05P task marks, and this ordinal-49 evidence together; retain ordinal-48 behavior and earlier work. |
| Accounting | Final candidate accounting: complete `+176/-6 = 182`; authored `+134/-2 = 136`; generated lockfile `+11/-0 = 11`; OpenSpec artifacts `+31/-4 = 35`. |
| Cleanup and doctor | Generated domain/application/contracts/API `dist` directories were removed after proof; final `git diff --check` and doctor evidence follows the final snapshot. |

## WU-05P gatekeeper correction — ordinal 50

- Begin tree: `7f5708626c15f6a4ef90975ea03e1ac6b1a82645`; one automatic gatekeeper retry only; hard cap remains 420 complete changed lines. The fresh validator's clean `application-package` failure is inherited RED/phase-contract evidence: root `test:contract` built only contracts, leaving domain/application `dist` unavailable.
- Safety net: `pnpm test:unit -- identity` exited 0 before the root-script edit: Vitest 1 file/2 tests.
- GREEN: root `build:producers` is the single producer command: `pnpm --filter @shelfops/domain build && pnpm --filter @shelfops/application build && pnpm --filter @shelfops/contracts build`. Both `test:contract` and `typecheck` invoke it before Vitest and `tsc --noEmit`, respectively. No other scripts or behavior changed.
- From absent domain/application/contracts/API `dist`, `pnpm test:contract -- application-package` exited 0 (1 file/2 tests), `pnpm typecheck` exited 0, and `pnpm test:contract -- contracts-package` exited 0 (1 file/1 test). Each command rebuilt domain → application → contracts before its gate.
- TRIANGULATE/REFACTOR: the application and contracts package sentinels exercise separate public subpath boundaries; the shared producer command removes duplicated ordering while preserving the prior gate behavior. No new test was authored because this is a structural command correction with inherited validator RED.

### WU-05P ordinal-50 TDD Cycle Evidence

| Task | Test/config | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Clean producer gate correction | Root `package.json`; existing package contract sentinels | Contract/build topology | `pnpm test:unit -- identity`: 1 file/2 tests passed | Inherited fresh clean-contract validator failure: `test:contract` built only contracts, so application-package could not resolve clean producers | Clean application-package selector passed 1 file/2 tests | Clean typecheck and independent contracts-package selector passed 1 file/1 test | Extracted one shared `build:producers` command; no behavior change |

### WU-05P ordinal-50 Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused clean contract gate | `pnpm test:contract -- application-package` from all relevant `dist` absent | Exit 0; producer sequence domain → application → contracts ran; Vitest 1 file/2 tests passed. |
| Typecheck gate | `pnpm typecheck` | Exit 0; the same producer sequence ran before `tsc --noEmit`. |
| Independent contract sentinel | `pnpm test:contract -- contracts-package` | Exit 0; producer sequence ran; Vitest 1 file/1 test passed. |
| Runtime harness | N/A | This correction changes package build command topology only; no runtime service boundary exists. |
| Rollback boundary | Root script plus ordinal-50 task/progress evidence | Revert `package.json` producer-script wiring and this ordinal-50 evidence together; retain ordinal-49 package ownership and ordinal-48 behavior. |
| Accounting | Temporary-index candidate snapshots | Incremental `7f5708626c15f6a4ef90975ea03e1ac6b1a82645` → terminal: `+35/-2 = 37` across 3 paths; cumulative `33ca65101088ff87996eab62bbcfe3d787a48651` → terminal: `+213/-10 = 223` across 13 paths. Both are under 420. |

### WU-05P ordinal-50 task state

- WU-05P RED, GREEN, TRIANGULATE, and VERIFY/CLEANUP remain checked after the passing correction.
- WU-05 remains architecture-not-accepted until WU-05C passes; WU-05C and WU-06 remain unchecked.

## WU-05C session adapter architecture conformance — ordinal 51

- Begin tree: `a873db09d2abb6f5ecefa9aaebededcbac2b079e`; delivery remains `auto-chain` / `stacked-to-main`; hard cap: 300 complete changed lines. No commit, branch, push, PR, review, RDD, native-attempt operation, WU-06, package/lockfile/tsconfig, migration, vendor, docs/examples/compose, or authorization-behavior change occurred.
- RED: `apps/api/test/auth-boundary-structure.contract.test.ts` was added first using the installed TypeScript AST. `pnpm test:contract -- auth-boundary-structure` exited 1: all 3 tests failed on local `AuthorizedPrincipal`/`IdentitySession`/`IdentityProvider`, absent public resolver imports, and `packages/*/src` auth-test imports. The AST assertions also reject `isCurrentSession`, direct lookup, and adapter-side expiry/revocation/activity reads without depending on formatting.
- GREEN: API `buildApi` now consumes the public `IdentityProvider`; the HTTP adapter retains only opaque-cookie parsing and delegates lookup, expiry, revocation, and activity validation to public `resolveSession`. Auth contract tests import public application subpaths. The structure selector then passed 1 file/3 tests.
- TRIANGULATE: final `pnpm test:unit -- identity` passed 1 file/2 tests; `pnpm test:contract -- auth` passed 2 files/7 tests; API build and root typecheck passed. The complete `pnpm test:all` gate passed 4 unit files/22 tests, 3 integration files/3 tests, 6 contract files/15 tests, and every workspace build.
- Runtime: disposable `docker compose -f infra/compose.oidc.yml up -d` reached `/isalive` and the default discovery document through the documented retry; `down --volumes --remove-orphans` completed. Final port-18080 listener count was 0.
- Acceptance: WU-05 is architecture-accepted after WU-05P and WU-05C. WU-06 remains unchecked.

### WU-05C TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Session adapter conformance | `apps/api/test/auth-boundary-structure.contract.test.ts` | Contract/AST structure | `pnpm test:unit -- identity`: 1 file/2 tests; `pnpm test:contract -- auth`: 1 file/4 tests | New selector exited 1: 1 file, 3 failed tests against duplicated contracts, direct validation, and source-path imports | Selector exited 0: 1 file/3 tests after public imports and `resolveSession` delegation | Identity 1/2 and auth 2/7 passed; semantic AST checks cover declarations/validation, public application imports/resolver call, and source-path-free auth imports | Removed duplicated declarations and validation instead of retaining adapters; final full suite remained green |

### WU-05C Work Unit Evidence

| Evidence | Command or scenario | Exact result |
| --- | --- | --- |
| Focused structure test | `pnpm test:contract -- auth-boundary-structure` | Exit 0; Vitest 1 file/3 tests. |
| Behavior sentinels | `pnpm test:unit -- identity`; `pnpm test:contract -- auth` | Both exit 0; 1 file/2 tests and 2 files/7 tests. |
| Build/typecheck | `pnpm --filter @shelfops/api build`; `pnpm typecheck` | Both exit 0; API compiler and domain → application → contracts producer sequence completed. |
| Runtime harness | Disposable local Compose mock issuer `/isalive` and default discovery document | Exit 0; issuer became ready, discovery returned successfully, and `down --volumes --remove-orphans` removed the stack. |
| Full gate | `pnpm test:all` | Exit 0; 4 unit files/22 tests, 3 integration files/3 tests, 6 contract files/15 tests, and workspace builds passed. |
| Rollback boundary | WU-05C API conformance paths | Revert only `apps/api/src/app.ts`, `apps/api/src/auth/session-boundary.ts`, `apps/api/test/auth.contract.test.ts`, `apps/api/test/auth-boundary-structure.contract.test.ts`, and these WU-05C task/progress entries; retain WU-05P and ordinal-48 behavior. |
| Accounting | Temporary-index candidate delta from ordinal-51 begin tree | `+93/-44 = 137` across 6 allowed paths; below the 300 complete-line cap. |

### WU-05C ordinal-51 cleanup synchronization

- The ordinal-51 candidate recorded `git diff --check` exit 0. Current cleanup confirms generated domain/application/contracts/API/web/worker `dist` directory count **0**, Testcontainers-labelled resource count **0**, and port-18080 listener count **0**.
- `gentle-ai doctor` completed with **8 passed, 0 failed, 0 warnings**. These cleanup, diff, and doctor facts align the OpenSpec ledger with the ordinal-51 hybrid evidence.

## WU-05C final automatic gatekeeper correction — ordinal 52 (blocked)

- Begin tree: `0dc0c98884014bbb2f40ebd782ca7d969bd80a9d`; hard cap: 300 complete changed lines. The fresh-validator import-coverage finding is inherited RED.
- Safety net: `pnpm test:contract -- auth-boundary-structure` exited 0 with 1 file/3 tests before the correction bytes.
- RED/correction: the TypeScript-AST sentinel was extended to inspect `apps/api/src/app.ts`, `apps/api/src/auth/session-boundary.ts`, `apps/api/test/auth.contract.test.ts`, and itself for literal `packages/*/src` and resolved relative source reach-through imports. The first correction command exited 1: 1 file failed, 3 tests passed, because the new assertion expected `{}` rather than the four inspected paths each mapped to `[]`.
- Stop/rollback: this was the final automatic attempt, so no correction command was retried. The sentinel was restored byte-for-byte; before retaining the required ledger, its temporary-index finish tree again equalled the begin tree, so correction implementation bytes were `+0/-0 = 0`. Final temporary-index accounting is `+21/-5 = 26` from ordinal-52 begin and `+105/-40 = 145` cumulatively from ordinal-51 begin across all six WU-05C paths, both below 300. `pnpm test:contract -- auth`, `pnpm typecheck`, and `pnpm test:all` were not run because the failure-stop rule prohibits a further attempt.
- Final non-test hygiene: current `git diff --check` exited 0; generated `dist` directories, Testcontainers-labelled resources, and port-18080 listeners were each 0; `gentle-ai doctor` was 8/0/0.
- Task state: WU-05C is unchecked, WU-05 is architecture-not-accepted, and WU-06 remains unchecked. Rollback scope is the sentinel and WU-05C task/progress markers only; ordinal-48 behavior and WU-05P remain retained.

## WU-05C maintainer-authorized targeted correction — ordinal 53 (blocked)

- Begin tree: `0d2effbb2f9d2861454bce10aba5c86b81ad5ed3`; hard cap: 300 complete changed lines. No commit, review, native-attempt command, RDD, WU-06, product source, manifest, lockfile, tsconfig, migration, vendor, docs/examples/compose, or behavior change was made.
- Strict-TDD inherited RED: ordinal 52 correctly established that the structural assertion must compare the complete map `{ "apps/api/src/app.ts": [], "apps/api/src/auth/session-boundary.ts": [], "apps/api/test/auth.contract.test.ts": [], "apps/api/test/auth-boundary-structure.contract.test.ts": [] }`, not `{}`.
- Safety net: `pnpm test:contract -- auth-boundary-structure` exited 0 with 1 file/3 tests before the correction bytes. The sole correction command exited 1 with 1 failed file, 3 passed tests, and 1 failed test. The failure was `TypeError: Cannot read properties of undefined (reading 'filter')` in `packageSourceReachThroughImports`: `Promise.all` received tuples containing unresolved `sourceFile()` promises, so the scanner was passed a Promise rather than a TypeScript `SourceFile`.
- Stop/rollback: the targeted sentinel bytes were restored immediately and WU-05C task markers were never changed. No correction retry occurred. The remaining selectors, API build, typecheck, local issuer smoke, `pnpm test:all`, final diff/accounting, and doctor gate were not run after the failure.
- Accounting before this self-referential note: temporary-index `0d2effbb2f9d2861454bce10aba5c86b81ad5ed3` → `64dc68d01294060a0fa138696da99461ec8c69e1` is `+24/-0 = 24` across the two evidence files; cumulative ordinal-51 begin `a873db09d2abb6f5ecefa9aaebededcbac2b079e` → that candidate is `+129/-40 = 169` across the six WU-05C paths. Both are within the 300-line cap; restored correction test bytes contributed zero retained code lines.
- Task state: WU-05C remains unchecked, WU-05 remains architecture-not-accepted, and WU-06 remains unchecked. Rollback boundary is the sentinel correction and ordinal-53 task/progress evidence only; ordinal-48 behavior and WU-05P remain retained.

### WU-05C ordinal-53 TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Targeted AST-map correction | `apps/api/test/auth-boundary-structure.contract.test.ts` | Contract/AST structure | Selector: 1 file/3 tests passed | Inherited ordinal-52 map-shape failure | Failed: 1 file failed, 3 tests passed; scanner received a Promise | Not run after failure-stop | Not run; bytes restored |

### WU-05C ordinal-53 Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused test | Safety net `pnpm test:contract -- auth-boundary-structure`: exit 0; 1 file/3 tests. Sole correction command: exit 1; 1 file failed, 3 tests passed, 1 test failed with `TypeError` at `packageSourceReachThroughImports`. |
| Runtime harness | Not run after the authoritative correction failure; no retry or weaker substitute is permitted. |
| Rollback boundary | The sentinel correction and ordinal-53 WU-05C task/progress evidence only; restored sentinel leaves ordinal-48 behavior and WU-05P intact. |

## WU-05C maintainer-authorized exact async correction — ordinal 54

- Begin tree: `0ced362630fff3b3d198e493afa76b7be70372f9`; strict TDD; hard cap: 300 complete changed lines. No commit, review, native-attempt command, RDD, WU-06, product-source, manifest, lockfile, tsconfig, migration, vendor, docs/examples/compose, or behavior change occurred.
- Inherited RED: ordinal 52 proved the expected assertion is the complete four-file map to empty arrays; ordinal 53 proved tuple-wrapped unresolved `sourceFile()` Promises cannot be inspected. The safety-net selector passed 1 file/3 tests before this correction.
- GREEN: `packageSourceReachThroughImports(source: ts.SourceFile)` scans AST import declarations, normalizes URL/path separators, detects literal and resolved-relative `packages/<name>/src` paths, and the required async map awaits each source before scanning it. The focused selector passed 1 file/4 tests.
- Triangulation gates passed once: identity 1 file/2 tests; auth 2 files/8 tests; API build; root typecheck; and one `pnpm test:all` run with units 4 files/22 tests, integration 3 files/3 tests, contract 6 files/16 tests, and all workspace builds.
- Runtime harness: the disposable local OIDC Compose issuer returned HTTP 200 for `/isalive` and `/default/.well-known/openid-configuration`; `down --volumes --remove-orphans` left 0 resources and 0 port-18080 listeners.
- Acceptance: WU-05C RED, GREEN, TRIANGULATE, and VERIFY/CLEANUP are checked; WU-05 is architecture-accepted; WU-06 remains unchecked.

### WU-05C ordinal-54 TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Exact async AST-map correction | `apps/api/test/auth-boundary-structure.contract.test.ts` | Contract/AST structure | Selector: 1 file/3 tests passed | Inherited ordinal-52 map-shape and ordinal-53 unresolved-Promise failures | Selector: 1 file/4 tests passed | Identity 1/2, auth 2/8, API build, typecheck, issuer smoke, and full suite passed | Kept the semantic scanner small; no additional refactor was needed |

### WU-05C ordinal-54 Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused test | `pnpm test:contract -- auth-boundary-structure`: exit 0; Vitest 1 file/4 tests. |
| Runtime harness | Disposable `infra/compose.oidc.yml`: health and discovery each returned HTTP 200; cleanup left 0 compose resources and 0 port-18080 listeners. |
| Full gate | `pnpm test:all`: exit 0; units 4/22, integration 3/3, contract 6/16, and all workspace builds passed. |
| Cleanup and doctor | Generated domain/application/contracts/API/web/worker `dist` directories, Testcontainers-labelled containers/volumes/networks, and port-18080 listeners are 0; `gentle-ai doctor`: 8 passed, 0 failed, 0 warnings. |
| Accounting | Temporary-index candidate from ordinal-54 begin: `+074/-005 = 079` complete changed lines; hard cap is 300. |
| Rollback boundary | Revert the semantic source-reach-through scanner/test and ordinal-54 task/progress entries only; retain WU-05P and ordinal-48 behavior. |

## WU-07P stopped apply — ordinal 56

- Begin baseline: WU-05C ordinal-54 accepted state; Strict TDD and `auto-chain` / `stacked-to-main`; WU-07P cap 450 complete changed lines. All four WU-07P task markers remain unchecked.
- RED was written first: `versioned-policy` exited 1 (missing module, 0 tests); `configure-reference-data` exited 1 (missing module, 0 tests); `configuration-events` exited 1 (missing PostgreSQL repository, 0 tests).
- Initial GREEN focused results: versioned-policy 1 file/2 tests and configure-reference-data 1 file/2 tests passed. The first configuration-events GREEN run failed because `pg` returns `timestamptz` as a `Date` rather than the test's string expectation. This was a required command failure; the temporary candidate was restored, so no WU-07P behavior remains.
- A later full gate also exposed the architectural blocker: `pnpm test:all` exited 1 at `apps/api/test/application-package.contract.test.ts` because the existing exact domain-export sentinel forbids the required `./governance/versioned-policy` public export. Updating that sentinel is outside WU-07P's allowed paths, so no retry or scope expansion is permitted.

### WU-07P Strict TDD Cycle Evidence

| Task | Test file | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Effective range and configuration use case | Domain/application unit tests | Unit | N/A (new) | Missing-module selectors each exited 1 | Unit selectors reached 1 file/2 tests each | Not accepted after the configuration integration GREEN failure | Rolled back |
| Configuration-event persistence | `configuration-events.test.ts` | PostgreSQL 16 integration | N/A (new) | Missing repository selector exited 1 | Failed: `effective_at` was `Date`, not asserted string | Not accepted | Rolled back |

### WU-07P Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused commands | RED results above; initial unit GREEN selectors exited 0 (1 file/2 tests each); first integration GREEN exited 1 (1 file/1 failed test). |
| Full/package gates | `pnpm typecheck` and `pnpm build` exited 0 before rollback; `pnpm test:all` exited 1: package-export sentinel expected four domain subpaths and received five. |
| Runtime harness | Real PostgreSQL 16 Testcontainers was used; final cleanup found 0 `org.testcontainers=true` resources. |
| Rollback boundary | Removed the temporary migration, domain/application/infrastructure exports and sources, manifests/lockfile topology, and WU-07P tests; WU-05C remains intact. |
| Accounting and hygiene | Temporary pre-rollback candidate: `+176/-0 = 176`; retained ledger: `+24/-0 = 24`; maximum complete candidate: `+200/-0 = 200`, under 450. Generated `dist` directories were removed; `git diff --check` passed; `gentle-ai doctor` was 8 passed, 0 failed, 0 warnings. |

## WU-07C-A application-owned execution (passed)

- Native token: `sha256:8fa43cbd50028e97b319a241d5a73f24a245044b861731270fd3b0488d32c403`.
- Public input is actor/target/eventId-free; the executor derives store-reference, location, and principal actor after replay lookup.
- Equal replay returns the original outcome before ID/repository access; changed fingerprints throw `IdempotencyConflictError`.
- Organization-catalog commands reject as `unsupported-target`, including explicitly granted central operators.
- The package sentinel adds only the four approved exports and retains every scanner/topology assertion.

### Strict TDD Cycle Evidence

| Task | Layer | Safety net | RED | GREEN | TRIANGULATE | REFACTOR |
| --- | --- | --- | --- | --- | --- | --- |
| WU-07C-A | Unit | Domain build; configure 2/2 | configure 2/3; granted organization command resolved | executor 3/3; configure 3/3 | absent, replay, conflict, stale | Errors imported from public port; no further refactor |

### Work Unit Evidence

| Evidence | Exact result |
| --- | --- |
| Focused tests | executor 1 file/3 tests; configure 1 file/3 tests; both exit 0. |
| Runtime harness | N/A — deterministic Application collaborators; PostgreSQL is WU-07C-B. |
| Verification | Application/Contracts builds, application-package 1 file/2 tests, typecheck, and one test:all passed. |
| Cleanup | Generated dist removed; Testcontainers resource count 0; diff check passed. |
| Complete accounting | +103/-11 = 114 changed lines, under the 350-line cap. |
| Rollback boundary | WU-07C-A ports/executor/tests/exports, sentinel export expectation, task marks, and this evidence. |
