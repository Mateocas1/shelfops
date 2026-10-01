# ShelfOps MVP Implementation Plan

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 12,809–15,269 additions plus deletions after adding three complete WU-07C prerequisite slices before the unchanged public WU-07 slice; generated lockfiles and OpenAPI remain in snapshot identity |
| 1200-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | 42 implementation work units, including autonomous WU-07C-A, WU-07C-B, and WU-07C-C slices, plus one final verification gate; each new prerequisite targets ≤300 and hard-stops at 350 complete changed lines |
| Delivery strategy | auto-chain |
| Chain strategy | stacked-to-main (user-approved before WU-01) |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
1200-line budget risk: High
400-line budget risk: High

### Planning forecast

| Field | Value |
|-------|-------|
| Estimated total changed lines | 12,809–15,269 planned changed lines; generated outputs remain reviewed in the immutable snapshot |
| 1200-line budget risk | High |
| Chained PRs recommended | Yes |
| Decision needed before apply | No |
| Proposed review slices with estimated changed lines, dependencies, verification, and rollback boundary | WU-01–WU-29 plus the named prerequisites below, including WU-07C-A → WU-07C-B → WU-07C-C stacked-to-main slices. Gate-F is verification only, not a PR slice. |

**Forecast rationale.** The 12,809–15,269-line program remains High risk and requires chained PRs. The validated WU-07C scope cannot credibly fit 350 lines as one unit: Application orchestration, PostgreSQL atomicity, and API composition/lifecycle each need independent tests and rollback. WU-07C is therefore three autonomous `stacked-to-main` slices, each targeting 300 and hard-capped at 350; `auto-chain` plus the approved strategy means no new decision is needed before apply. WU-07P stays accepted and WU-07 remains the separate public route/OpenAPI slice.

**Budget rule.** Measure `additions + deletions` before review. If a unit exceeds its total estimate or 1200 lines, use its stated contingency. A change that cannot preserve its invariant after a split requires an explicit, unapproved `size:exception`; WU-03's maintainer-approved 600-line complete-direct-delta cap remains historical evidence from the prior policy.

**Corrected local order:** WU-07P → WU-07C (A → B → C) → WU-07 → WU-08S → WU-06 → WU-08. Native status is mechanically apply-ready, but WU-07C is the required planning gate; this amendment grants no attempt/review authority.

## Traceability map

| Domain | Work units |
|---|---|
| Reference Data | WU-02, WU-07P, WU-07C, WU-07 |
| Authorization | WU-04–WU-05P–WU-05C–WU-07P–WU-07C–WU-07, WU-13, WU-26 |
| Incident Management | WU-08S, WU-08–WU-17 |
| SLA and Alerts | WU-09, WU-14–WU-16, WU-18–WU-20 |
| API/OpenAPI | WU-03T–WU-03TH–WU-03P–WU-03, WU-05–WU-05P–WU-05C, WU-07C–WU-23, WU-26 |
| Operational Views and pilot measurement | WU-21–WU-25, WU-25B |
| PWA and degraded connectivity | WU-23–WU-26, WU-25B |
| Security, recovery, deployment | WU-05–WU-05P–WU-05C, WU-13, WU-15, WU-19–WU-20, WU-26–WU-29 |

## Execution rules

- Paths are relative to the repository root.
- WU-01 is the only bootstrap exception. It must prove `pnpm test`, `pnpm test:all`, `pnpm typecheck`, and `pnpm build` before production behavior begins.
- WU-02 onward must execute the listed **RED → GREEN → TRIANGULATE → REFACTOR** sequence. Tests, OpenAPI/examples, and behavior-specific operator documentation land in the same unit as the behavior.
- Unit tests inject clock, UUID, identity, storage, and mail ports. PostgreSQL integration behavior uses Testcontainers; SQLite is prohibited.
- Record exact focused-command output, runtime scenario result (or `N/A`), changed-line total, and rollback boundary with every work-unit review.

## Delivery and pilot blockers

- [x] Parent: implementation and delivery approved for WU-01 using the `stacked-to-main` topology; later units still require their own bounded apply decision. <!-- sdd-owner: parent -->
- [ ] Parent: before pilot deployment, obtain approved OIDC provider/session policy, email provider/sender/webhook semantics, final catalogs/SLA/escalation recipients, legal retention/export custody, rate/SLO baselines, and supported device/browser matrix. Keep all unresolved values as environment configuration; never add production credentials. <!-- sdd-owner: parent -->

## Dependency-ordered work units

### WU-01 — Runnable workspace and smoke route
**Paths:** `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`, `apps/{api,web,worker}/src/*`, `packages/test-support/src/smoke.test.ts`. **Estimate:** +330/-20 = **350**. **Contingency:** move nonessential lint rules to WU-02; no exception. **Depends:** none. **Verify:** `pnpm test`, `pnpm test:all`, `pnpm typecheck`, `pnpm build`, and `pnpm --filter @shelfops/api dev` with `GET /health`. **Rollback:** remove the workspace roots and smoke path together.

- [x] Create the pnpm workspace, strict TypeScript/Vitest scripts, three minimal composition roots, and one passing `packages/test-support/src/smoke.test.ts` so `pnpm test` is runnable. <!-- sdd-owner: implementation -->
- [x] Add `apps/api/src/routes/health.ts`, full-test/typecheck/build script wiring, and `docs/development.md` bootstrap commands; record passing output for all four required commands and the health smoke. <!-- sdd-owner: implementation -->

### WU-01H — Startup hardening review follow-up
**Paths:** `apps/api/src/{server,startup}.ts`, `packages/test-support/src/smoke.test.ts`, `package.json`, `docs/development.md`. **Estimate:** +115/-15 = **130**. **Depends:** WU-01. **Verify:** focused Vitest startup test, `pnpm test`, `pnpm test:all`, and `PORT=3111` health smoke with listener cleanup. **Rollback:** revert these startup, test, engine, and development-guide changes together; the WU-01 workspace remains runnable.

- [x] Add focused tests for malformed and out-of-range `PORT` values plus startup diagnostic and cleanup behavior. <!-- sdd-owner: implementation -->
- [x] Strictly parse the TCP port and report startup errors through an enabled diagnostic sink while closing a failed app instance. <!-- sdd-owner: implementation -->
- [x] Require Node `>=22.12.0` in the project engine and development guide for locked Vite 8.1.5 compatibility. <!-- sdd-owner: implementation -->

### WU-01T — Test harness completion
**Paths:** `package.json`, `tsconfig.json`, `vitest.config.ts`, `vitest.integration.config.ts`. **Estimate:** +30/-5 = **35**. **Depends:** WU-01. **Verify:** `pnpm test:unit -- smoke`; `pnpm test:integration -- reference-data`; `pnpm test`; `pnpm test:all`. **Rollback:** revert these command and Vitest-discovery configuration changes together; WU-01's unit smoke harness remains available through its original command.

- [x] **RED → GREEN:** Record the missing `test:unit` and `test:integration` command failures, then add runnable unit and integration Vitest commands. Keep unit discovery at `packages/**/src/**/*.test.ts`, configure integration discovery at `packages/**/test/**/*.test.ts`, and make no WU-02 reference-data or product behavior change. <!-- sdd-owner: implementation -->

### WU-01TH — Integration harness hardening
**Paths:** `package.json`, `tsconfig.json`, `packages/test-support/test/integration-harness.test.ts`. **Estimate:** +30/-10 = **40**. **Depends:** WU-01T. **Verify:** focused unit/integration checks, failing no-match selector, sentinel typecheck inclusion, `pnpm test`, and `pnpm test:all`. **Rollback:** revert the command, include, and sentinel together; no WU-02 reference-data behavior is affected.

- [x] **RED → GREEN → REFACTOR:** Remove false-green empty-selector acceptance, add one domain-neutral Node-test-environment sentinel under integration discovery, and include integration tests in root TypeScript typechecking. Prove a discovered failing integration test fails, then remove its temporary probe. <!-- sdd-owner: implementation -->

### WU-01P — PostgreSQL Testcontainers harness
**Paths:** `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `packages/infrastructure/test/postgres-harness.test.ts`. **Estimate:** +50/-0 = **50** authored lines; the generated lockfile is tracked in complete-candidate accounting only. **Depends:** WU-01TH. **Verify:** `pnpm test:integration -- postgres-harness`, `pnpm test:unit -- smoke`, failing `pnpm test:integration -- reference-data`, typecheck inclusion, `pnpm test`, `pnpm test:all`, and Docker cleanup. **Rollback:** revert the three dev dependencies, explicit build-script denials, generated lockfile entries, and PostgreSQL harness test together; WU-02 remains untouched.

- [x] **RED → GREEN → REFACTOR:** Record the missing Testcontainers import failure, then add a reusable, domain-neutral PostgreSQL 16 Testcontainers smoke that uses `pg` to run `SELECT 1` and assert its configured current database, closes the client, and stops the container in `finally`. <!-- sdd-owner: implementation -->

### WU-01PH — Testcontainers hardening
**Paths:** `package.json`, `tsconfig.json`, `scripts/run-integration-tests.ts`, `docs/development.md`, `packages/infrastructure/test/postgres-harness.test.ts`. **Estimate:** +130/-10 = **140**. **Depends:** WU-01P. **Verify:** focused PostgreSQL harness, no-match failure, intentional integration failure, full integration suite, unit smoke, typecheck, `pnpm test`, `pnpm test:all`, and exact Docker label cleanup. **Rollback:** revert the integration runner, command/engine configuration, development prerequisite guidance, and immutable image reference together; the WU-01P PostgreSQL smoke remains available through direct Vitest invocation.

- [x] **RED → GREEN → REFACTOR:** Align the Node engine and development guide with locked Undici, document Docker daemon health, pin the PostgreSQL image digest, and make the integration command wait boundedly for all `org.testcontainers=true` resources (including Ryuk) while preserving forwarded Vitest filters and primary test failures. <!-- sdd-owner: implementation -->

### WU-02 — Single-organization references and deterministic fixtures
**Paths:** `migrations/001_reference-data.sql`, `packages/domain/src/reference-data/*`, `packages/test-support/src/fixtures/*`, `packages/infrastructure/test/reference-data.test.ts`, `docs/reference-data.md`. **Estimate:** +355/-20 = **375**. **Contingency:** split fixture incident-state builders into WU-08; no exception. **Depends:** WU-01. **Verify:** `pnpm test:unit -- reference-data`; `pnpm test:integration -- reference-data`. **Rollback:** revert this migration, reference module, fixtures, and reference guide together.

- [x] **RED:** Add failing reference-data tests for singleton organization, cross-store hierarchy rejection, active/deactivated references, category context defaults, severity ordering, and trimmed names. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Implement hierarchy/catalog migration, domain validation, fixed-ID simulated organization/store/sector/location/product/user builders, and `docs/reference-data.md` catalog/fixture semantics. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Add fixture tests for two stores, two sectors/locations per store, ten products, all roles, inactive references, deterministic reset, and simulated-data labels; run both focused commands. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** Centralize fixed IDs and clock values in `packages/test-support/src/fixtures/vocabulary.ts`; rerun reference tests. <!-- sdd-owner: implementation -->
- [x] **Correction:** Complete the validated WU-02 phase-contract gaps without expanding into WU-03. <!-- sdd-owner: implementation -->

### WU-03T — Contract-test and package foundation
**Allowed paths only:** `package.json`, `apps/api/package.json`, `packages/contracts/package.json`, `pnpm-lock.yaml`, `vitest.contract.config.ts`, `apps/api/test/contract-harness.contract.test.ts`. **Estimate:** +75/-5 = **80** authored lines; generated lockfile estimate +220–560, complete native delta 300–640. **Depends:** WU-01PH. **Verify:** `pnpm test:contract -- contract-harness`; fail-closed `pnpm test:contract -- api-foundation` before WU-03. **Runtime harness:** N/A — command/configuration and package-resolution boundary only. **Rollback:** revert all six allowed paths together; WU-01PH remains runnable.

- [x] **RED → GREEN:** Record the absent-command failure, then add `test:contract` and a dedicated Node Vitest config that includes only `apps/api/test/**/*.contract.test.ts`, has no `passWithNoTests`, and retains one domain-neutral contract-harness sentinel. Prove `pnpm test:contract -- contract-harness` reaches Vitest and passes; prove `pnpm test:contract -- api-foundation` reaches Vitest but exits 1 on no match, so it cannot false-green before WU-03 adds that test. <!-- sdd-owner: implementation -->
- [x] Add only direct design-required dependencies: `@sinclair/typebox` in `packages/contracts/package.json` and `@fastify/swagger` in `apps/api/package.json`; regenerate `pnpm-lock.yaml`. Do not add Swagger UI, schemas, middleware, routes, OpenAPI output, or API documentation. <!-- sdd-owner: implementation -->
- [x] **CLEANUP / rollback:** Under the prior 400-line policy, remove any temporary failure probe, retain only the neutral sentinel, and record focused/no-match results plus exact authored and complete-native line counts. If atomic manifest-plus-lockfile churn alone exceeds that prior limit, keep this autonomous stacked slice intact, declare generated churn separately, and seek a narrow generated-lockfile `size:exception`; if not approved, revert all allowed paths and defer WU-03. <!-- sdd-owner: implementation -->

### WU-03TH — Root contract verification and typecheck hardening
**Allowed final product paths only:** `package.json`, `tsconfig.json`; apply evidence also updates this task marker and `openspec/changes/shelfops-mvp/apply-progress.md`. **Estimate:** +20/-4 = **24** authored changed lines. **Contingency:** none; no `size:exception`. **Depends:** WU-03T. **Verify:** contract sentinel, no-match, typecheck, full `test:all`, diff, and cleanup below. **Runtime harness:** N/A — root command/typecheck coverage only. **Rollback:** revert `package.json` and `tsconfig.json` together; WU-03T remains runnable and WU-03 remains unimplemented.

- [x] **RED:** Temporarily make the existing contract sentinel fail, run `pnpm test:contract -- contract-harness` and record its nonzero exit; temporarily introduce a TypeScript error in that same sentinel, run `pnpm typecheck`, and record its nonzero exit. Remove both probes before GREEN.
- [x] **GREEN:** Add `pnpm test:contract` to root `test:all` with `&&`, preserving the existing typecheck → unit → integration → build order and failure propagation; include `apps/api/test/**/*.ts` and `vitest.contract.config.ts` in root `tsconfig.json` only, without adding test ownership to `apps/api/tsconfig.json`.
- [x] **TRIANGULATE:** Run `pnpm test:contract -- contract-harness`; `pnpm test:contract -- api-foundation` (must exit 1 on no match); `pnpm typecheck --listFiles` proving the sentinel and contract config are included; then `pnpm typecheck` and `pnpm test:all`.
- [x] **CLEANUP / scope guard:** Confirm both temporary probes are removed, `git diff --check` passes, final product paths are only `package.json` and `tsconfig.json`, and no WU-03 schemas, routes, middleware, OpenAPI output, examples, or documentation exist. Record exact results, line count, rollback, and cleanup in apply progress.

### WU-03P — Buildable contracts workspace boundary
**Allowed paths only:** `packages/contracts/{package.json,tsconfig.json,src/{common,errors,pagination}.ts}`, `apps/api/package.json`, `apps/api/test/contracts-package.contract.test.ts`, `pnpm-lock.yaml`. **Estimate:** +60/-5 = **65** authored lines; target ≤120 complete lines, with generated lockfile churn measured and reported separately. **Contingency:** none; do not widen `apps/api/tsconfig.json` `rootDir` or add API source behavior. **Depends:** WU-03TH. **Verify:** focused structural RED/GREEN/triangulation below. **Runtime harness:** N/A — this unit establishes package build/export/import resolution only; it introduces no service, port, container, or product runtime behavior. **Rollback:** revert all seven allowed paths together; WU-03TH remains runnable and WU-03 behavior remains unimplemented.

- [x] **RED:** Add `apps/api/test/contracts-package.contract.test.ts` first, importing `@shelfops/contracts/{common,errors,pagination}` and asserting three neutral boundary markers; record its nonzero `pnpm test:contract -- contracts-package` failure while the package lacks a build/export/import path. The failure must prove absent package resolution, not add WU-03 behavior.
- [x] **GREEN:** Add `packages/contracts/tsconfig.json` compiling `src` to `dist` JavaScript and declarations; add its `build` script and explicit `./common`, `./errors`, and `./pagination` exports; add `@shelfops/contracts: workspace:*` to `apps/api/package.json`; regenerate `pnpm-lock.yaml`; add only the three neutral source placeholders needed for the marker imports. Do not add TypeBox schemas, error mapping, cursor behavior, routes, middleware, OpenAPI, examples, or documentation.
- [x] **TRIANGULATE:** Run `pnpm --filter @shelfops/contracts build`, `pnpm test:contract -- contracts-package`, `pnpm --filter @shelfops/api build`, and `pnpm typecheck`; prove `pnpm test:contract -- api-foundation` still exits 1 on no match. WU-03 RED must then import built public subpaths and fail assertions for absent behavior, never package/export/import resolution.
- [x] **CLEANUP / scope guard:** Remove no-longer-needed failure probes, retain only neutral placeholders and the structural contract test, run `git diff --check`, record exact authored, generated-lockfile, and complete-line counts, and confirm no API `rootDir` change or WU-03 behavior landed.

### WU-03 — Shared HTTP contract and OpenAPI foundation
**Paths:** `packages/contracts/src/{errors,pagination,common}.ts`, `apps/api/src/{schemas,error-handler,openapi}.ts`, `openapi/openapi.json`, `docs/api-conventions.md`, `apps/api/test/api-foundation.contract.test.ts`. **Estimate:** +320/-35 = **355**. **Contingency:** defer route examples to their owning units; maintainer-approved `size:exception`, capped at **600 complete direct changed lines**. **Depends:** WU-03P (and transitively WU-03TH and WU-03T). **Verify:** `pnpm test:contract -- api-foundation`; OpenAPI lint/diff. **Rollback:** revert shared schema/error/cursor/OpenAPI foundation as one API boundary.

- [x] **RED:** Add failing contract tests for `/api/v1`, stable error envelope, correlation ID, unknown-field rejection, 50/200 pagination bounds, signed cursor binding, and `503 temporarily-unavailable`; import only WU-03P's built public subpaths so failure is missing behavior, never package/export/import resolution. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Implement shared TypeBox vocabulary, error mapper, correlation middleware, cursor utility, Swagger generation, committed `openapi/openapi.json`, and `docs/api-conventions.md`, replacing WU-03P placeholders through public contracts-package exports rather than direct source imports. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Add lint/diff and invalid/expired cursor cases; run the contract and OpenAPI commands. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** Remove adapter-local duplicate error/schema definitions in favor of `packages/contracts/src/*`; rerun focused checks. <!-- sdd-owner: implementation -->

### WU-03Q — API contract quality hardening
**Purpose:** Close WU-03 with no active API-contract warning conditions before WU-04 while preserving opaque, integrity-signed, reusable cursor behavior. WU-04 work is prohibited. **Delivery strategy:** `exception-ok`; the maintainer approved `size:exception` for this atomic closure, so no chained PR action is required.
**Allowed paths only:** `packages/contracts/src/{errors,pagination}.ts`, `apps/api/src/{schemas,error-handler,openapi}.ts`, `apps/api/test/api-foundation.contract.test.ts`, `openapi/openapi.json`, `scripts/generate-openapi.ts`, root `package.json`, `docs/api-conventions.md`, `openspec/changes/shelfops-mvp/{tasks,apply-progress}.md`. No dependency or lockfile changes. **Empirical expected complete delta:** approximately **505 changed lines** (`+359/-146`), with a maintainer-approved **`size:exception`, hard cap 600 complete changed lines**. Complete native accounting includes generated `openapi/openapi.json` and cumulative evidence; the bounded authored behavior remains one cohesive API-contract work unit. Its 600-line exception was approved under the prior 400-line policy and remains historical evidence; the current global policy is 1200 changed lines. This does not alter unrelated WU-03 precedent. **Depends:** completed WU-03; required before WU-04. **Focused command:** `pnpm test:contract -- api-foundation`. **Runtime harness:** Fastify `app.inject()` only, with no listener. **Rollback:** revert the generator command/script/docs and all WU-03Q behavior, tests, OpenAPI, and evidence together while retaining completed WU-03.

- [x] **RED:** Using the existing `api-foundation` selector, first prove over-limit input, each unknown query key, and invalid/expired/bound-mismatch cursors require field-specific names and stable codes; require 400-only `validation-failed`, 503-only `temporarily-unavailable`, and `X-Correlation-Id` on relevant 200/400/503 responses. Before production changes, prove the committed OpenAPI artifact mismatches these expectations. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Preserve runtime validation details through cursor, unknown-query, and Fastify mappings; add status-specific schemas and response headers while retaining opaque signed reusable cursors. Add root `openapi:generate`, backed by `scripts/generate-openapi.ts`, which calls `openApiDocument()`, writes deterministic UTF-8 JSON with one trailing newline, and exits non-zero on error; document it in `docs/api-conventions.md`. Rebuild contracts after contract source edits and before generation. <!-- sdd-owner: implementation -->
- [x] **GENERATE / GREEN:** Run `pnpm openapi:generate` to create the committed `openapi/openapi.json` before running focused GREEN; make no dependency, lockfile, tsconfig, composition-root, or WU-04 change. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Run the generator twice and require byte equality with no diff; parse the artifact as OpenAPI 3.1 and prove 400/503 status-specific codes plus correlation headers on relevant 200/400/503 responses. <!-- sdd-owner: implementation -->
- [x] **VERIFY / CLEANUP:** Sequentially run `pnpm test:contract -- api-foundation`, `pnpm test:contract -- contract-harness`, `pnpm test:contract -- contracts-package`, `pnpm typecheck`, `pnpm --filter @shelfops/contracts build`, `pnpm --filter @shelfops/api build`, `pnpm test:unit -- smoke`, the full Testcontainers suite through `pnpm test:integration`, and `pnpm test:all`; then run `git diff --check`, account for complete changed lines, remove generated build output, and record rollback plus `gentle-ai doctor` **8/0/0** evidence. Allow one bounded test-authoring correction only if RED cannot execute assertions; allow no functional gate retry loops, and stop/replan above 600 lines. <!-- sdd-owner: implementation -->

### WU-04TH — Clean-state contracts typecheck prerequisite
**Allowed paths only:** root `package.json`, `openspec/changes/shelfops-mvp/tasks.md`, `openspec/changes/shelfops-mvp/apply-progress.md`. **Estimate:** +30/-5 = **35 complete changed lines**; **hard cap: 60 complete changed lines**, including task-marker and apply-progress evidence. **Contingency:** none; stop and replan on any failed authoritative check or cap breach. **Depends:** WU-03Q; required before WU-04H. **Focused command:** `pnpm typecheck`. **Runtime harness:** N/A — command/build ordering only. **Rollback:** restore the root `typecheck` script and remove generated contracts/API `dist` outputs while retaining evidence. RDD remains disabled.

- [x] **RED / BASELINE:** Treat ordinal 43's clean-state `pnpm test:all` typecheck failure, caused by unresolved `@shelfops/contracts/*` declarations before contracts `dist` exists, as existing RED/baseline evidence; do not rerun `pnpm test:all`. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Change only the root `typecheck` script from raw `tsc --noEmit` to the semantic equivalent of `pnpm --filter @shelfops/contracts build && tsc --noEmit`. Do not alter package exports, tsconfigs, source imports, tests, dependencies, lockfile, test ordering, or RDD. <!-- sdd-owner: implementation -->
- [x] **ACCEPTANCE:** Ensure contracts/API generated `dist` outputs are absent before proof; run `pnpm typecheck` exactly once and require both the contracts producer build and root typecheck to pass, then run `pnpm test:contract -- contracts-package` exactly once and `pnpm test:unit -- smoke` exactly once. Stop on any failure with no retry loop; WU-04H, not this unit, owns integration scheduling and the next full `pnpm test:all`. <!-- sdd-owner: implementation -->
- [x] **VERIFY / CLEANUP:** Run `git diff --check`, record exact complete additions plus deletions, remove generated contracts/API `dist` outputs, and require `gentle-ai doctor` **8/0/0**; stop/replan above the 60-line cap. <!-- sdd-owner: implementation -->

### WU-04H — PostgreSQL integration harness serialization
**Allowed paths only:** `vitest.integration.config.ts`, `openspec/changes/shelfops-mvp/tasks.md`, `openspec/changes/shelfops-mvp/apply-progress.md`. **Estimate:** +55/-5 = **60 complete changed lines**; **hard cap: 100 complete changed lines**, including config, task-marker, and apply-progress evidence. **Contingency:** stop with the current config preserved and require a separate maintainer diagnosis; no exception. **Depends:** WU-04TH and WU-03Q; required before WU-04. **First diagnostic:** `pnpm test:integration -- --no-file-parallelism`. **Runtime harness:** real Docker/PostgreSQL Testcontainers. **Rollback:** restore the single Vitest config setting while retaining diagnostic evidence; WU-04 remains untouched. RDD remains disabled. No test logic, Docker image, timeout, runner script, dependency, or RDD change is allowed without separate maintainer replanning.

- [x] **BASELINE / DIAGNOSTIC:** Treat ordinal 42's `reference-data.test.ts` timeout at 120018ms during its sole `pnpm test:all` run as the existing RED/baseline evidence; before any config edit, run `pnpm test:integration -- --no-file-parallelism` as the first runtime diagnostic. <!-- sdd-owner: implementation -->
- [x] **STOP / GREEN:** If the diagnostic fails, stop, preserve the current config, record evidence, and require new diagnosis; do not set `fileParallelism: false`. If it passes, set only `test.fileParallelism: false` in `vitest.integration.config.ts`. <!-- sdd-owner: implementation -->
- [x] **ACCEPTANCE:** After the config change, run `pnpm test:integration` three separate consecutive times; each authoritative run must pass all 3 integration files/3 tests and leave zero Testcontainers-labelled containers/resources. Then run `pnpm test:all` once and require green; after any authoritative failure, stop without a retry loop. <!-- sdd-owner: implementation -->
- [x] **VERIFY / CLEANUP:** Run `git diff --check`, record exact complete additions plus deletions, clean generated output/resources, and require `gentle-ai doctor` **8/0/0**; stop/replan above the 100-line cap and keep WU-04 untouched. <!-- sdd-owner: implementation -->

### WU-04 — Authoritative principal and authorization policies
**Paths:** `packages/application/src/authorization/authorized-principal.ts`, `packages/domain/src/authorization/{visibility-policy,action-policy,assignment-eligibility}.ts`, `packages/domain/src/authorization/authorization-policy.test.ts`, `docs/authorization.md`. **Unit discovery:** the test path follows root `packages/**/src/**/*.test.ts` unit discovery. **Estimate:** +350/-25 = **375**. **Contingency:** move SQL predicate translation to WU-06; no exception. **Depends:** WU-02 and WU-04H. **Verify:** `pnpm test:unit -- authorization-policy`. **Rollback:** revert the single principal contract and pure policies together.

- [x] **RED:** Add failing tests for role-plus-scope, collaborator/lead/supervisor/inventory/central rules, explicit grants, assigned-only resolution, supervisor-only reopen, and combined-role scope bounds. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Introduce `AuthorizedPrincipal` exactly once in `packages/application/src/authorization/authorized-principal.ts`; implement pure visibility/action/eligibility policies and `docs/authorization.md`. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Add denied side-effect-free and out-of-scope-assignee cases; run `pnpm test:unit -- authorization-policy`. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** Consolidate role, scope, responsibility, and grant types under `packages/domain/src/authorization/types.ts`; rerun policy tests. <!-- sdd-owner: implementation -->

### WU-05 — OIDC session boundary and protected current-user API
**Paths:** `migrations/002_identity-sessions.sql`, `apps/api/src/app.ts`, `apps/api/src/auth/*`, `packages/application/src/identity/*`, `apps/api/test/auth.contract.test.ts`, `openapi/examples/auth/*`, `docs/authentication.md`, `infra/compose.oidc.yml`. **Estimate:** +360/-25 = **385**. **Contingency:** keep provider implementation a test/development adapter; selected pilot vendor remains blocked. **Depends:** WU-03–WU-04. **Verify:** `pnpm test:unit -- identity`; `pnpm test:contract -- auth`; local dev-issuer session smoke. **Rollback:** remove the `buildApi()` auth-module registration, session route/adapter, and dev OIDC compose overlay while preserving `/health`; no client claim is trusted.

**Acceptance state:** Functionally complete at ordinal 48; all behavioral tasks and evidence remain valid. Architecture acceptance was restored by the passing WU-05C ordinal-54 correction; WU-06 remains unchecked.

- [x] **RED:** Add failing identity and contract tests through the real `buildApi()` composition seam, proving `/api/v1/me` is production-registered rather than available only in test-local Fastify instances, plus missing/invalid/inactive session, ignored client actor, cookie-CSRF mutation protection, and production rejection of test adapters. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Register an auth-owned module from `buildApi()` while preserving `/health`; consume WU-04 `AuthorizedPrincipal` through session lookup, implement opaque secure-session/CSRF seams and `/api/v1/me`, and document the BFF boundary/examples and local development issuer. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Add current-access re-evaluation and correlation-safe auth-error cases; run focused commands and the local session smoke. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** Keep vendor-specific code behind `packages/application/src/ports/identity-provider.ts`; rerun identity/contract tests. <!-- sdd-owner: implementation -->

### WU-05P — Domain/application package boundary
**Allowed paths only:** root `package.json`, `pnpm-lock.yaml`, `apps/api/package.json`, `packages/domain/{package.json,tsconfig.json}`, `packages/application/{package.json,tsconfig.json}`, `packages/application/src/authorization/authorized-principal.ts`, `apps/api/test/application-package.contract.test.ts`, and `openspec/changes/shelfops-mvp/{tasks,apply-progress}.md` for evidence. **Estimate:** +190/-10 = **200 authored lines**; **hard cap: 420 complete changed lines**, including generated lockfile churn and evidence. **Depends:** WU-05 functional completion at ordinal 48. **Focused command:** `pnpm test:contract -- application-package`. **Runtime harness:** N/A — package/export/build topology only. **Rollback:** remove both package definitions, dependencies, lockfile/test/import rewiring, and restore the root command while preserving ordinal-48 behavior. RDD remains disabled.

- [x] **RED:** Add the package sentinel first and prove `pnpm test:contract -- application-package` fails on absent packages, narrow exports, or import resolution; make no API auth, API `rootDir`, behavior, vendor, or RDD change. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Create private ESM `@shelfops/domain` and `@shelfops/application` packages compiling `src` to `dist` with declarations and tests excluded; expose only the design-approved subpaths, declare application → domain and API → application workspace dependencies, update `pnpm-lock.yaml` atomically, and import domain vocabulary from `@shelfops/domain/authorization/types`. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** From absent `dist`, build domain → application → contracts before root `tsc --noEmit` (or prove equivalent topology); run package sentinel, API build, root typecheck, existing contracts-package sentinel, and reject direct `packages/*/src` imports from API/application. <!-- sdd-owner: implementation -->
- [x] **VERIFY / CLEANUP:** Record focused and topological results, complete/authored/generated accounting, `git diff --check`, cleanup, and `gentle-ai doctor`; remove generated `dist` and stop/replan above 420 complete lines. <!-- sdd-owner: implementation -->

**Ordinal-50 gatekeeper correction:** The inherited clean-contract RED showed that `test:contract` built only contracts. The shared root producer command now builds domain → application → contracts before both clean contract and typecheck gates. The four WU-05P tasks remain checked because all ordinal-50 authoritative gates passed; WU-05 remains architecture-not-accepted until WU-05C, and WU-05C/WU-06 remain unchecked.

### WU-05C — Session adapter architecture conformance
**Allowed paths only:** `apps/api/src/app.ts`, `apps/api/src/auth/session-boundary.ts`, `apps/api/test/auth.contract.test.ts`, `apps/api/test/auth-boundary-structure.contract.test.ts`, and `openspec/changes/shelfops-mvp/{tasks,apply-progress}.md` for evidence; permit only `packages/application/src/identity/session.ts` if a failing proof shows the existing `resolveSession` must be minimally exposed or consumed. **Estimate:** +130/-55 = **185 authored lines**; **hard cap: 300 complete changed lines**, including evidence. **Depends:** WU-05P. **Focused command:** `pnpm test:contract -- auth-boundary-structure`. **Runtime harness:** existing local development issuer smoke. **Rollback:** restore only API conformance changes and the sentinel, retaining WU-05P and ordinal-48 behavior. RDD remains disabled.

- [x] **RED:** Add a formatting-independent structural sentinel that fails on API-local `AuthorizedPrincipal`, `IdentitySession`, `IdentityProvider`, `isCurrentSession`, direct provider validation, or `packages/*/src` imports. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Remove local declarations, import canonical public application subpaths, and delegate lookup, expiry, revocation, and activity validation to application `resolveSession`; make no package, lockfile, tsconfig, migration, behavior, vendor, WU-06, docs/examples/compose, or RDD change. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Re-run structure, identity, and auth checks plus API/root build and typecheck; preserve ordinal-48 `buildApi()` registration, health, CSRF, safe errors, live access, production-adapter rejection, migration/examples/compose, and local issuer smoke. <!-- sdd-owner: implementation -->
- [x] **VERIFY / CLEANUP:** Run `pnpm test:all`, diff/accounting/cleanup, and `gentle-ai doctor`; stop/replan above 300 complete lines and record the autonomous rollback boundary. <!-- sdd-owner: implementation -->

**Ordinal-52 final automatic gatekeeper:** Blocked. The inherited validator RED required a broader AST import scan. Its first correction run failed because the new assertion incorrectly expected an empty result object instead of the four inspected files mapped to empty violation arrays. Per the one-attempt rule, the test bytes were restored and no command was retried. Therefore WU-05C is unchecked, WU-05 is not architecture-accepted, and WU-06 remains unchecked.

**Ordinal-53 maintainer-authorized targeted correction:** Blocked. Begin tree `0d2effbb2f9d2861454bce10aba5c86b81ad5ed3`; hard cap remains 300 complete changed lines. Ordinal-52's four-key empty-violations map failure was inherited RED. The safety-net selector passed 1 file/3 tests. The sole correction command failed with 1 file failed, 3 tests passed: `packageSourceReachThroughImports` received an unresolved `sourceFile()` Promise because `Promise.all` awaited the outer tuples rather than their source promises. The sentinel bytes were immediately restored and WU-05C task markers remain unchecked. No selector, build, typecheck, issuer smoke, full suite, or correction retry ran after that failure; WU-05 remains architecture-not-accepted and WU-06 remains unchecked.

**Ordinal-54 maintainer-authorized exact async correction:** Accepted from begin tree `0ced362630fff3b3d198e493afa76b7be70372f9`. Ordinal-52's map-shape failure and ordinal-53's unresolved-Promise failure were inherited RED; the AST import-declaration scanner now awaits every `sourceFile()` inside `Promise.all`, maps all four inspected files to empty violation arrays, normalizes URL/path separators, and detects literal or resolved `packages/<name>/src` reach-through imports. The focused selector passed 1 file/4 tests; identity, auth, API build, typecheck, disposable issuer health/discovery smoke with cleanup, and one full suite passed. WU-05C is checked, WU-05 is architecture-accepted, and WU-06 remains unchecked; exact accounting, cleanup, doctor, and rollback evidence are in apply progress.

### WU-07P — Accountable reference configuration persistence and use case
**Allowed paths only:** `migrations/003_configuration-events.sql`, `packages/domain/package.json`, `packages/domain/src/governance/{versioned-policy,versioned-policy.test}.ts`, `packages/application/package.json`, `packages/application/src/ports/configuration-repository.ts`, `packages/application/src/reference-data/{configure-reference-data,configure-reference-data.test}.ts`, `packages/infrastructure/{package.json,tsconfig.json}`, `packages/infrastructure/src/reference-data/postgres-configuration-repository.ts` with its narrow public subpath export, `packages/infrastructure/test/configuration-events.test.ts`, `apps/api/test/application-package.contract.test.ts` solely for the topology-safe structural sentinel below, and root `package.json`/`pnpm-lock.yaml` only when producer/dependency topology requires them. No API behavior, API-to-domain dependency, Domain import at API test runtime, or other app path is authorized. **Estimate:** 350–400 authored lines; **hard cap remains exactly 450 complete changed lines**. **Depends:** WU-02, WU-04, and accepted WU-05C (including WU-05P transitively). **Runtime harness:** real PostgreSQL 16 Testcontainers; SQLite is prohibited. **Rollback:** remove only WU-07P migration, persistence/use-case/package/export additions, tests, sentinel update, and required topology changes. Native state remains `blocked: maintainer_decision` after ordinal 60; this planning amendment grants no runtime authority.

**Topology-safe sentinel contract:** Assert exact manifest exports: Domain's existing four entries plus `./governance/versioned-policy` → `{ types: "./dist/governance/versioned-policy.d.ts", default: "./dist/governance/versioned-policy.js" }`; Application's existing three entries plus `./ports/configuration-repository` and `./reference-data/configure-reference-data` with matching exact `./dist/<subpath>.d.ts`/`.js` targets. Assert API has no `@shelfops/domain` dependency, Application has `@shelfops/domain: workspace:*`, and lockfile importers preserve API → Application → Domain, never API → Domain.

Using the TypeScript AST, parse `packages/application/src/reference-data/configure-reference-data.ts` and require its exact `@shelfops/domain/governance/versioned-policy` import. Reject literal or resolved `packages/*/src` reach-through; recursively inspect API source/tests and reject static import/export, dynamic-import, and `require` specifiers targeting `@shelfops/domain`. After producer builds only, dynamically import `@shelfops/application/reference-data/configure-reference-data` and prove its public use-case export is callable; never statically or dynamically import a Domain subpath from API test runtime. Another suite-load API → Domain import is a planning/implementation defect, not a valid RED.

**Ordinal-59 topology scanner correction (inherited requirement):** Discover only real `.ts` files recursively beneath the two owned roots `apps/api/src/` and `apps/api/test/`; never enumerate or walk the `apps/api/` package root. Within each owned root, skip symbolic links and every path containing a segment named `node_modules`, `dist`, `generated`, or `vendor`, and reject traversal or resolved candidates outside that root. Transitive dependency files are outside the API ownership boundary and must neither be scanned nor treated as API violations. This correction narrows discovery only: preserve every existing exact manifest/export/lockfile assertion, Application AST assertion, public dynamic-import assertion, reach-through rejection, and API-no-Domain assertion. Another package-root or dependency-tree scan is an implementation defect, not valid RED.

**Ordinal-60 AST type-proof correction (inherited requirement):** For dynamic-import and `require` call classification, bind `const [argument] = node.arguments` and require `argument !== undefined` before `ts.isStringLiteral(argument)`; do not pass `node.arguments[0]` directly. Preserve the exact expression-kind checks and every owned-root, exclusion, traversal, resolved-candidate, manifest/export/lockfile, Application AST, reach-through, public dynamic-import, and API-no-Domain assertion. This proves the existing scanner semantics under strict indexed-access checking and changes no behavior. Another unchecked indexed access is an implementation defect, not valid RED.

**Infrastructure and timestamp requirements:** The infrastructure manifest declares direct `pg` and `@shelfops/application: workspace:*` dependencies and regenerates `pnpm-lock.yaml`. Do not add infrastructure to root `build:producers` in WU-07P because no WU-07P contract gate consumes its built export; defer that producer addition until WU-07C-C API composition requires it. Normalize PostgreSQL driver `Date` values to canonical ISO strings; tests remain type-stable and never accept mixed `Date`/string timestamps.

**Exact gate order:** (1) topology-safe sentinel RED first, proving the missing governance export without suite-load topology failure; (2) domain, application, then PostgreSQL integration REDs; (3) focused GREEN selectors `pnpm test:unit -- versioned-policy`, `pnpm test:unit -- configure-reference-data`, and `pnpm test:integration -- configuration-events`; (4) critical topology gate `pnpm test:contract -- application-package`; (5) root package/build/typecheck requirements, including `pnpm test:contract -- contracts-package`, `pnpm build`, and `pnpm typecheck`; (6) exactly one final `pnpm test:all`; (7) cleanup, `gentle-ai doctor`, and native complete-line measurement ≤450. Stop on any required-gate failure.

**Ordinal-59 inherited proof and continuation:** Ordinal 59 already proved PostgreSQL integration 1/1 and both unit selectors 2/2 before `application-package` failed on dependency-tree scanning and the candidate was rolled back. After restoring that candidate, the first inherited-failure proof must be `pnpm test:contract -- application-package`, expected exit 0 with 1 file/2 tests, before proceeding to the remaining gates. Preserve the exact repository parser correction `Promise<ReadonlyArray<Readonly<{ effectiveAt: string; before: Record<string, unknown>; after: Record<string, unknown> }>>>` and the proven PostgreSQL driver `Date` → canonical ISO-string behavior as inherited requirements; product semantics do not change. This continuation proof does not erase or reorder the preserved historical RED → GREEN evidence.

**Ordinal-60 inherited proof and continuation:** The bounded owned-root scanner fixed ordinal 59's false positive. `application-package` passed 1 file/2 tests, PostgreSQL passed 1 file/1 test, both unit selectors passed 1 file/2 tests, `contracts-package` passed 1 file/1 test, and build passed before root typecheck failed TS2345 because `node.arguments.length === 1` did not narrow the separate `node.arguments[0]` access under strict indexed-access checking; the candidate was rolled back and semantics require no change. After restoring the candidate with the type-proof correction above, first run `pnpm test:contract -- application-package`, expected exit 0 with 1 file/2 tests. Then preserve the existing PostgreSQL integration → both unit selectors → `contracts-package` → build → typecheck → exactly one final `pnpm test:all` → cleanup/doctor/native ≤450 measurement order, stopping on any required-gate failure.

- [x] **RED:** Implement the topology-safe sentinel first, then add unit and PostgreSQL tests for effective ranges, store-supervisor mutation, organization-grant denial, attributable before/after/effective-time snapshots, historical labels, and non-deletion in the exact RED order above. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Add the narrow Domain/Application exports, repository port, transactional use case, migration, infrastructure package/export, and PostgreSQL repository; pass only the focused GREEN selectors without API/OpenAPI work. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Prove denied mutation is side-effect free, stale/non-forward versions fail, deactivation remains historically readable, and persisted timestamps are canonical ISO strings through PostgreSQL 16 Testcontainers. <!-- sdd-owner: implementation -->
- [x] **REFACTOR / VERIFY:** Centralize effective-range validation, then execute gates 4–7 exactly once where specified; preserve package topology, exact exports, clean disposable resources, and the 450-line complete-delta cap. <!-- sdd-owner: implementation -->

### WU-07C — Reference-configuration execution, idempotency, and composition prerequisite
The validated scope is split now because one complete slice cannot credibly fit 350 lines. **Global exclusions:** no public route/schema/OpenAPI/example/docs; no public actor, target, or eventId; no organization-catalog reachability; no retry with a new key after indeterminate COMMIT. WU-07P remains accepted.

#### WU-07C-A — Application-owned configuration execution
**Status:** Final bounded correction passed apply proof; WU-07C-A markers are complete and the candidate is ready for fresh independent phase-contract validation without claiming independent acceptance.

**Allowed paths only:** `packages/application/src/ports/{configuration-repository,configuration-executor,idempotency-store}.ts`, `packages/application/src/reference-data/{configuration-executor,configuration-executor.test,configure-reference-data.test}.ts`, `packages/application/package.json`, `apps/api/test/application-package.contract.test.ts` solely to update the expected exact Application export list while preserving every topology assertion, and `packages/infrastructure/test/configuration-events.test.ts` solely to add deterministic eventId values to its existing direct repository command literals while preserving all current assertions/behavior. **Exports:** exact `./ports/{configuration-repository,configuration-executor,idempotency-store}` and `./reference-data/configuration-executor` `types`/`default` subpaths. `ConfigurationCommand.eventId: string` is mandatory and never optional. `ConfigurationInput` is exactly storeId/locationId/version/effective range/active/optional label/idempotencyKey/correlationId; `ConfigurationExecutor.execute(principal,input)` is the only entry. No API behavior, API-to-Domain import, Domain runtime import from the sentinel, route/OpenAPI change, scanner widening, PostgreSQL repository implementation/migration edit, or supplied-event persistence assertion is allowed; persistence remains WU-07C-B. **Estimate:** 220–300; **hard cap:** 350. **Depends:** WU-07P. **Rollback:** remove executor/idempotency additions, restore the repository command and sentinel export expectation, and remove only the deterministic eventId literal additions from the existing Infrastructure test, retaining WU-07P.

- [x] **RED:** Preserve the proven sequence: build Domain; run existing `pnpm test:unit -- configure-reference-data` baseline at 2/2; then add the semantic failing assertion against the existing seam before any executor import/module. Continue RED coverage for eventId/actor/target-free `execute(principal,input)`, replay-before-stale, hash conflict, absent-only single ID generation, derived location target/reference/principal actor, and preserved status/version/snapshots/correlation.
- [x] **GREEN / REFACTOR:** Make `ConfigurationCommand.eventId: string` required; transaction-bound `executeConfiguration` generates one eventId only after absent lookup, derives `store-reference`, `locationId`, and actor internally, exposes typed stale/idempotency errors, and cannot reach organization-catalog. Update the sentinel export list atomically with the four required Application exports, and add deterministic eventIds only to the existing Infrastructure test command literals; do not edit or test PostgreSQL persistence here.
- [x] **VERIFY:** After Domain → Application → Contracts producer builds, run `pnpm test:contract -- application-package` and existing `pnpm test:integration -- configuration-events`; also run both focused unit selectors, root typecheck, `pnpm test:all`, diff/cleanup/process evidence, and complete-line accounting. Stop and roll back above 350.

#### WU-07C-B — PostgreSQL atomic idempotency executor
**Allowed paths only:** `migrations/004_reference-configuration-idempotency.sql`, `packages/infrastructure/src/idempotency/postgres-idempotency-store.ts`, `packages/infrastructure/src/reference-data/{postgres-configuration-executor,postgres-configuration-repository}.ts`, `packages/infrastructure/test/reference-configuration-idempotency.test.ts`, `packages/infrastructure/{package.json,tsconfig.json}`. **Exports:** exact `./idempotency/postgres-idempotency-store`, `./reference-data/postgres-configuration-executor`, and existing repository subpaths. **Estimate:** 280–330; **hard cap:** 350. **Depends:** WU-07C-A. **Runtime:** PostgreSQL 16 Testcontainers. **Rollback:** remove migration/store/executor/export changes and restore WU-07P repository transaction behavior.

- [x] **RED:** `pnpm test:integration -- reference-configuration-idempotency` fails first for ≥24-hour durable pending/completed claim scoped by principal + v1 + configure-location + `${storeId}/${locationId}` + key; SHA-256 of path IDs and normalized version/effective range/active/label excludes actor/correlation/eventId. Prove equal replay before stale/ID generation, changed conflict, concurrency, and original eventId/status/version/snapshots/correlation.
- [x] **GREEN / TRIANGULATE:** One executor-owned `pg.PoolClient` performs connect/BEGIN/advisory lock/find/apply/complete/COMMIT; repository persists `command.eventId` with no nested transaction or `randomUUID`. Pre-COMMIT failures best-effort ROLLBACK; post-COMMIT uncertainty destroys the client and throws `IndeterminateCommitError` without claiming rollback.
- [x] **VERIFY:** Prove same-key retry reads first (completed replay/conflict; absent may execute), never blindly re-executes after indeterminate COMMIT, then run package builds, typecheck, `pnpm test:all`, Testcontainers/process cleanup, diff and line accounting; stop and roll back above 350.

#### WU-07C-C — Shared mutation guard, composition, and Pool lifecycle
**Allowed paths only:** `apps/api/src/{app,startup}.ts`, `apps/api/src/auth/{session-boundary,mutation-guard}.ts`, `apps/api/src/composition/reference-configuration.ts`, `apps/api/test/{mutation-guard,reference-configuration-composition}.contract.test.ts`, `apps/api/test/application-package.contract.test.ts`, `apps/api/package.json`, root `package.json`, `pnpm-lock.yaml`. **Topology:** API imports public Application principal/executor ports and the public Infrastructure executor only; producers build Domain → Application → Infrastructure → Contracts; API never imports Domain/source paths. **Estimate:** 250–330; **hard cap:** 350. **Depends:** WU-07C-B. **Rollback:** remove guard/composition/Pool ownership/topology changes while retaining A/B; WU-07 stays blocked.

- [ ] **RED:** Contract tests fail first for reusable active-session+CSRF `createMutationGuard`, typed principal attachment, nonblank `DATABASE_URL`, injected/non-owned dependencies, registration/listen/app-close failures, and exactly-once Pool close; assert no configuration POST route or OpenAPI path exists.
- [ ] **GREEN / REFACTOR:** Add `MutationPrincipalProvider`/guard and non-route composition; production startup alone creates Pool, `buildApi()` installs one idempotent `onClose`, registration failure closes resources, and listen failure closes the app. Injected tests/OpenAPI own no Pool.
- [ ] **VERIFY:** Run both focused contracts, application-package topology, package builds, root build/typecheck, exactly one full suite, startup/lifecycle process cleanup, diff and line accounting; stop and roll back above 350.

### WU-07 — Reference configuration API and OpenAPI publication
**Allowed paths only:** `apps/api/src/routes/{register,reference-configuration}.ts`, `apps/api/src/{app,openapi,error-handler}.ts`, `apps/api/test/reference-configuration.contract.test.ts`, `scripts/generate-openapi.ts`, `openapi/openapi.json`, `openapi/examples/reference-configuration/*`, `docs/reference-configuration.md`. **Estimate/cap:** **300–350 complete changed lines**. **Depends:** completed WU-07C. **Focused command:** `pnpm test:contract -- reference-configuration`; generate twice byte-identically. **Runtime:** shared `buildApi()` registration with `app.inject()`. **Rollback:** retain WU-07P/WU-07C; remove only route/registration mappings, error mappings, generated OpenAPI/examples/docs.

- [x] **RED:** Through shared production/OpenAPI registration, prove only `POST /api/v1/stores/{storeId}/locations/{locationId}/configuration`; reject body actor/target/eventId/path IDs, deny organization-catalog reachability, and cover 200/400/401/403/404/stale 409/idempotency 409/indeterminate 503 with stable envelopes. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Map path/body/header/correlation to the eventId/actor/target-free executor input, register public schemas/error mappings, and publish deterministic OpenAPI/examples/docs; 503 guidance retains the same key and never recommends blind retry/new identity. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Run the focused contract through `app.inject()` without a listener; generate OpenAPI twice, require byte equality and no committed drift, and verify representative allowed/denied examples. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** Keep transport mapping in the route and composition in startup while consuming only public package exports; rerun contract and deterministic-generation checks. <!-- sdd-owner: implementation -->

### WU-08S — Incident core schema prerequisite
**Allowed paths only:** `migrations/005_incidents-core.sql`, `packages/infrastructure/test/incidents-core-schema.test.ts`. **Estimate/cap:** **220 complete changed lines**, inside the 1200-line session budget. **Depends:** WU-05C and WU-07. **Focused command:** `pnpm test:integration -- incidents-core-schema`. **Runtime harness:** real PostgreSQL 16 Testcontainers; SQLite is prohibited. **Rollback:** remove only this migration and schema test; retain WU-07 and all earlier accepted work.

- [x] **RED:** Add the failing `incidents-core-schema` integration test for incident identity/scope/current-state/version columns, restrictive hierarchy references, and required visibility-query indexes before creating migration 005. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Add `migrations/005_incidents-core.sql` with the minimum incident read/create foundation required by dependent work units; run the focused Testcontainers selector. <!-- sdd-owner: implementation -->
- [x] **REFACTOR / VERIFY:** Keep creation, idempotency, and event behavior out of this schema prerequisite; rerun the selector and remove all disposable PostgreSQL resources. <!-- sdd-owner: implementation -->

### WU-06 — Scoped incident reads and hidden-record safety
**Allowed paths only:** `packages/infrastructure/{package.json,tsconfig.json}`, `packages/infrastructure/src/repositories/authorized-incident-repository.ts` (public export `@shelfops/infrastructure/repositories/authorized-incident-repository`), `packages/infrastructure/test/scoped-repository.test.ts`, `apps/api/package.json`, `apps/api/src/{app,openapi}.ts`, `apps/api/src/routes/incidents-read.ts`, `apps/api/test/incidents-read.contract.test.ts`, root `package.json`, `pnpm-lock.yaml`, `scripts/generate-openapi.ts`, `openapi/openapi.json`, `openapi/examples/incidents-read/*`, `docs/incident-reads.md`. **Estimate/cap:** **850 complete changed lines**, including generated lockfile/OpenAPI changes, inside the 1200-line session budget. **Contingency:** aggregate/read-model predicates remain WU-21; no exception. **Depends:** WU-05C, WU-07, and WU-08S. **Focused gates:** `pnpm test:integration -- scoped-repository`; `pnpm test:contract -- incidents-read`; `pnpm typecheck`; run `pnpm openapi:generate` twice and require byte-identical `openapi/openapi.json` plus no ungenerated drift. **Runtime boundaries:** real PostgreSQL 16 Testcontainers for repository integration; Fastify `app.inject()` without a listener for route contracts. **Delivery:** `auto-chain`, `stacked-to-main`. **Rollback:** retain WU-07P/WU-07C infrastructure and WU-08S schema; remove only the incident-repository export/dependencies, API composition/read route, generated OpenAPI changes, examples/docs, and both WU-06 tests.

- [x] **RED — repository:** Add `scoped-repository.test.ts` first and prove SQL predicates consume canonical `AuthorizedPrincipal`, role and scope both constrain list/detail reads, central users see only authorized stores, and hidden identifiers remain undisclosed. <!-- sdd-owner: implementation -->
- [x] **RED — route contract:** Add `incidents-read.contract.test.ts` through production `buildApi()` registration and `app.inject()`, proving authorized list/detail responses, deterministic cursor order, hidden-record `404 not-found`, visible-but-forbidden `403`, and OpenAPI publication before GREEN. <!-- sdd-owner: implementation -->
- [x] **GREEN — package/repository:** Extend WU-07C's private ESM `@shelfops/infrastructure` manifest/tsconfig with the narrow incident-repository subpath export and any additional dependencies, preserve API/root producer topology, update `pnpm-lock.yaml` only as required, then implement scoped SQL list/detail queries against WU-08S. <!-- sdd-owner: implementation -->
- [x] **GREEN — wiring/OpenAPI:** Register the injected repository and read route in `apps/api/src/app.ts` and `apps/api/src/openapi.ts`; update `scripts/generate-openapi.ts`, deterministic `openapi/openapi.json`, allowed/hidden examples, and `docs/incident-reads.md`. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE / REFACTOR:** Add role-allows/scope-denies and scope-allows/role-denies database/contract cases, share predicate construction only between list/detail, then run every focused gate and clean generated build/container output. <!-- sdd-owner: implementation -->

### WU-08 — Create an auditable open incident with text evidence
**Paths:** `packages/application/src/incidents/create-incident.ts`, `packages/application/src/idempotency/*`, `apps/api/src/routes/incidents-create.ts`, `apps/api/test/incidents-create.contract.test.ts`, `openapi/examples/incidents-create/*`, `docs/incident-creation.md`. **Estimate:** +330/-30 = **360**. **Contingency:** attachment evidence moves to WU-13; no exception. **Depends:** WU-02, WU-08S, and WU-06. **Verify:** `pnpm test:unit -- create-incident`; `pnpm test:integration -- create-incident`; contract test. **Rollback:** retain WU-08S schema and WU-06 reads; revert create-event/idempotency behavior, use case, route, examples, tests, and guide atomically.

- [x] **RED:** Add failing creation tests for required context/text evidence, future-time skew, inactive/inconsistent references, idempotent replay, changed-payload conflict, and no-side-effect validation failure. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Implement transactional create/open/current-version/creation-event/idempotency record with authoritative actor/time and documented create route/examples. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Add PostgreSQL lock and contract tests for field errors, replay-before-stale handling, and correlation ID; run all focused commands. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** Extract canonical payload hashing and immutable event construction without changing create behavior; rerun tests. <!-- sdd-owner: implementation -->

### WU-09 — Initial SLA obligation and policy configuration
**Paths:** `migrations/006_sla-policy.sql`, `packages/domain/src/sla/{calculator,business-calendar}.ts`, `packages/application/src/sla/start-cycle.ts`, `apps/api/src/routes/sla-configuration.ts`, `openapi/examples/sla/*`, `docs/sla-policy.md`, SLA tests. **Estimate:** +350/-25 = **375**. **Contingency:** worker scheduling is WU-15; no exception. **Depends:** WU-07–WU-08. **Verify:** `pnpm test:unit -- sla-calculator`; `pnpm test:integration -- sla-cycle`; contract test. **Rollback:** revert SLA policy/cycle migration and configuration/create hook together.

- [x] **RED:** Add fixed-clock tests for 72/24/8/2 seed cells, continuous UTC timing, display-timezone separation, incomplete matrix rejection, and explicit on-track condition. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Implement versioned SLA seed/configuration, `BusinessCalendar` future port, initial cycle/segment persistence, configuration route/examples, and SLA policy documentation. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Add active-rule snapshot and resolved-terminal-condition integration cases; run focused commands. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** Isolate clock-mode/policy snapshots from persistence; rerun SLA tests. <!-- sdd-owner: implementation -->

### WU-10 — Deterministic triage and classified ownership
**Paths:** `migrations/007_triage.sql`, `packages/domain/src/triage/*`, `packages/application/src/incidents/complete-triage.ts`, `apps/api/src/routes/incidents-triage.ts`, `openapi/examples/triage/*`, `docs/triage.md`, triage tests. **Estimate:** +365/-25 = **390**. **Contingency:** amendments are WU-17; no exception. **Depends:** WU-04, WU-08–WU-09. **Verify:** unit, integration, and contract `-- triage`. **Rollback:** revert evaluator/decision records/classified action/docs together; incident remains open.

- [x] **RED:** Add failing tests for stable normalization/order, no-match/manual fallback, complete confirmation/correction, correction reason, partial triage rejection, and ineligible assignee. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Implement immutable evaluator, suggestion/decision records, `CompleteTriage`, classified transition, route schemas/examples, and triage guide. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Add repeated-evaluation, concurrent stale-version, and singular classified-assignee database/API cases; run focused commands. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** Separate structured explanation facts from rendered text; rerun triage tests. <!-- sdd-owner: implementation -->

### WU-11 — Start, block, resume, and reassignment
**Paths:** `packages/domain/src/incidents/state-machine.ts`, `packages/application/src/incidents/{start,block,resume,reassign}.ts`, `apps/api/src/routes/incident-work.ts`, `openapi/examples/incident-work/*`, `docs/incident-work.md`, lifecycle tests. **Estimate:** +355/-30 = **385**. **Contingency:** resolution is WU-14; no exception. **Depends:** WU-04, WU-10. **Verify:** unit/integration/contract `-- incident-work`. **Rollback:** revert named work actions/routes/docs; no generic state setter is introduced.

- [ ] **RED:** Add failing tests for exact transitions, required block/resume reasons, reassignment reason/eligibility, ownership retention, and stale concurrent work action. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement named start/block/resume/reassign use cases, material events, version locks, routes/examples, and incident-work guide. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add PostgreSQL barrier and API cases for invalid transitions, supervisor constraints, and reassignment preserving state; run focused commands. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Consolidate guards in the explicit state machine; rerun lifecycle tests. <!-- sdd-owner: implementation -->

### WU-12 — Append-only material history and corrections
**Paths:** `migrations/008_incident-events.sql`, `packages/application/src/history/*`, `apps/api/src/routes/incident-history.ts`, `apps/api/test/history.contract.test.ts`, `openapi/examples/history/*`, `docs/incident-history.md`. **Estimate:** +320/-30 = **350**. **Contingency:** evidence-label correction joins WU-13; no exception. **Depends:** WU-06, WU-08–WU-11. **Verify:** `pnpm test:integration -- audit-append-only`; `pnpm test:contract -- history`. **Rollback:** revert append-only guards/history route/correction projection together.

- [ ] **RED:** Add failing integration tests for event sequence/order, rejected update/delete, correction supersession, and deterministic read-only history. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement append-only DB role/trigger guard, history query and correction projection, read-only API examples, and history guide. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add reconstruction tests covering create, triage, assignment, block/resume, and hidden-history safety; run focused commands. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Extract payload redaction/order mapping from adapters; rerun history tests. <!-- sdd-owner: implementation -->

### WU-13 — Staged attachment evidence and secure access
**Paths:** `migrations/009_evidence.sql`, `packages/application/src/evidence/*`, `packages/infrastructure/src/storage/*`, `apps/{api,worker}/src/evidence/*`, `infra/compose.storage.yml`, `openapi/examples/evidence/*`, `docs/evidence-operations.md`. **Estimate:** +365/-25 = **390**. **Contingency:** resolution attachment link stays WU-14; no exception. **Depends:** WU-04, WU-06, WU-08, WU-12. **Verify:** unit/integration/contract `-- evidence`; MinIO smoke. **Rollback:** disable staged-upload routes/worker and remove unattached dev objects; never delete retained attached metadata.

- [ ] **RED:** Add failing tests for file count/size/type, opaque quarantine key, checksum/magic-byte/scan ready gate, reauthorized download, restriction marker, and 24-hour expiry. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement object-store port/staged upload/scan/attach/restrict flows, private MinIO local overlay, evidence routes/examples, and evidence operations guide. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add object-store integration cases for hidden evidence `404`, supersession, and scan backlog-safe failure; run focused commands and storage smoke. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Keep provider calls in infrastructure and evidence policy in domain/application; rerun tests. <!-- sdd-owner: implementation -->

### WU-14 — Evidence-backed resolution and terminal SLA outcome
**Paths:** `packages/application/src/incidents/resolve-incident.ts`, `apps/api/src/routes/incident-resolve.ts`, `openapi/examples/resolve/*`, `docs/resolution.md`, resolution tests. **Estimate:** +335/-30 = **365**. **Contingency:** no split; resolution evidence, event, and cycle closure are one invariant. **Depends:** WU-09, WU-11, WU-13. **Verify:** unit/integration/contract `-- resolve`. **Rollback:** revert resolve action/route/docs as an atomic transaction boundary.

- [ ] **RED:** Add failing tests for assigned-only resolution, new summary/evidence requirement, blocked-state rejection, atomic missing-history failure, and met/breached terminal cycle. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement `ResolveIncident`, new evidence linking, terminal cycle closure, material event, route examples, and resolution documentation. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add concurrent reassignment-versus-resolution and repeated-resolve idempotency cases; run focused commands. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Extract resolution-evidence policy from route mapping; rerun tests. <!-- sdd-owner: implementation -->

### WU-15 — SLA scheduler, blocked pause, warnings, and breaches
**Paths:** `migrations/010_sla-jobs.sql`, `packages/application/src/sla/{schedule-thresholds,process-job}.ts`, `apps/worker/src/jobs/process-sla.ts`, `docs/sla-operations.md`, scheduler tests. **Estimate:** +360/-30 = **390**. **Contingency:** alert recipient records are WU-18; no exception. **Depends:** WU-09, WU-11–WU-14. **Verify:** unit/integration `-- sla-worker`; worker job smoke. **Rollback:** cancel/no-op pending jobs and revert job handler/tables; preserve emitted SLA events.

- [ ] **RED:** Add failing tests for default non-pause, explicit pause intervals, post-breach block, delayed effective time, and exactly-once warning/breach keys. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement durable threshold jobs, `SKIP LOCKED` claims, SLA event deduplication, worker handler, and SLA operations/runbook documentation. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add concurrent claim, replay, expired segment, and no-repeat-default integration cases; run worker command/smoke. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Isolate recomputation/cancellation rules from worker adapter; rerun SLA tests. <!-- sdd-owner: implementation -->

### WU-16 — Supervisor reopen and a distinct SLA cycle
**Paths:** `packages/application/src/incidents/reopen-incident.ts`, `apps/api/src/routes/incident-reopen.ts`, `openapi/examples/reopen/*`, `docs/reopening.md`, reopen tests. **Estimate:** +315/-25 = **340**. **Contingency:** classification amendment is WU-17; no exception. **Depends:** WU-04, WU-10, WU-14–WU-15. **Verify:** unit/integration/contract `-- reopen`. **Rollback:** remove reopen action; prior resolved cycles/evidence are not changed.

- [ ] **RED:** Add failing tests for in-scope supervisor/reason, former-assignee denial, retained resolution, cleared assignment, reopen count, and fresh provisional cycle. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement `ReopenIncident`, retained-provisional triage request, distinct cycle creation, route examples, and reopening guide. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add prior met-cycle immutability and reopen-time recalculation tests; run focused commands. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Reuse WU-09 cycle-start contract without duplicating policy logic; rerun tests. <!-- sdd-owner: implementation -->

### WU-17 — Classification amendments and prospective obligations
**Paths:** `packages/application/src/incidents/amend-classification.ts`, `packages/domain/src/sla/amend-obligation.ts`, `apps/api/src/routes/incident-amendment.ts`, `openapi/examples/amendment/*`, `docs/classification-amendment.md`, amendment tests. **Estimate:** +330/-25 = **355**. **Contingency:** no split; amendment and replacement-eligibility validation are one atomic action. **Depends:** WU-04, WU-10, WU-15–WU-16. **Verify:** unit/integration/contract `-- amendment`. **Rollback:** revert amendment action/new segment only; immutable prior segments/events remain.

- [ ] **RED:** Add failing tests for reason, ineligible owner without replacement, immediate breach on increase, retained breach on decrease, and reopen-time cycle origin. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement amendment/replacement validation, prospective segment closure/recalculation, route examples, and amendment guide. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add historical event-time metric fixture and authorization cases; run focused commands. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Centralize prospective-obligation calculations in the SLA domain; rerun tests. <!-- sdd-owner: implementation -->

### WU-18 — Advisory recurrence and human decision
**Paths:** `migrations/011_recurrence.sql`, `packages/domain/src/recurrence/*`, `packages/application/src/recurrence/*`, `apps/api/src/routes/recurrence.ts`, `openapi/examples/recurrence/*`, `docs/recurrence.md`. **Estimate:** +345/-25 = **370**. **Contingency:** recurrence notification integration is handled by WU-19; no exception. **Depends:** WU-04, WU-06, WU-08, WU-12. **Verify:** unit/integration/contract `-- recurrence`. **Rollback:** revert recurrence records/evaluator/routes; no aggregate state, ownership, or SLA is changed.

- [x] **RED:** Add failing tests for same store/category/30-day window, shared location-or-product, five-result order, no broad match, and dismissal pair/rule suppression. <!-- sdd-owner: implementation -->
- [x] **GREEN:** Implement versioned evaluator/query, suggestions, confirm/dismiss decisions/links, route examples, and recurrence documentation. <!-- sdd-owner: implementation -->
- [x] **TRIANGULATE:** Add both-incident visibility and confirmation-independence tests; run focused commands. <!-- sdd-owner: implementation -->
- [x] **REFACTOR:** Separate matching facts from human decision projection; rerun recurrence tests. <!-- sdd-owner: implementation -->

### WU-19 — In-app alert intents and notification API
**Paths:** `migrations/012_notifications.sql`, `packages/{domain,application}/src/notifications/*`, `apps/api/src/routes/notifications.ts`, `openapi/examples/notifications/*`, `docs/notifications-api.md`. **Estimate:** +320/-25 = **345**. **Contingency:** notification-center UX is WU-25B; email delivery is WU-20; no exception. **Depends:** WU-04, WU-08–WU-18. **Verify:** unit/integration/contract `-- notifications`. **Rollback:** revert in-app intent/read API behavior together; incident events remain authoritative.

- [ ] **RED:** Add failing tests for policy eligibility, recipient scope, mandatory/optional in-app behavior, deduplication, read ownership/idempotency, and redaction after access loss. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement `AlertPolicyEvaluator`, transactional in-app intents/suppression records through the WU-12 shared event-append path, notification list/read API/examples, and notification API documentation. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add duplicate processing, unauthorized central recipient, and recipient scope-loss integration/contract cases; run focused commands. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Isolate recipient resolution and policy snapshots from route mapping; rerun tests. <!-- sdd-owner: implementation -->

### WU-20 — Email outbox, webhook confirmation, and containment
**Paths:** `migrations/013_email-delivery.sql`, `packages/{application,infrastructure}/src/mail/*`, `apps/{api,worker}/src/mail/*`, `infra/compose.mail.yml`, `openapi/examples/email-webhook/*`, `docs/email-operations.md`. **Estimate:** +370/-20 = **390**. **Contingency:** split provider adapter from webhook test fixtures if needed; no exception. **Depends:** WU-07, WU-15, WU-19. **Verify:** unit/integration `-- email-worker`; signed-webhook and Mailpit smoke. **Rollback:** enable containment/stop worker; preserve in-app and logical delivery history.

- [ ] **RED:** Add failing tests for one logical delivery, immediate/5m/20m retry, permanent failure, pre-send reauthorization, positive-only delivered state, signed webhook replay, and email containment. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement mail port/outbox/attempt records/worker, Mailpit local overlay, signed webhook handler, attributable policy containment, examples, and email operations guide. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add duplicate claim/webhook, optional preference, required-email containment, and no-incident-rollback cases; run focused commands/smokes. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Separate provider mapping from delivery state/retry transitions; rerun tests. <!-- sdd-owner: implementation -->

### WU-21 — Scope-safe queues and dashboard metrics
**Paths:** `migrations/014_operational-views.sql`, `packages/application/src/operational-views/*`, `apps/api/src/routes/operational-views.ts`, `openapi/examples/operational-views/*`, `docs/operational-views.md`, view tests. **Estimate:** +365/-25 = **390**. **Contingency:** pilot baseline/export is WU-22; no exception. **Depends:** WU-06, WU-09, WU-15–WU-18. **Verify:** integration/contract `-- operational-views`; `EXPLAIN (ANALYZE, BUFFERS)` fixture evidence. **Rollback:** revert read-only queries/indexes/routes; source data is unchanged.

- [ ] **RED:** Add failing tests for visibility-before-aggregation, queue priority/tie-breaker, required filters, no-data rate, denominator/definition/scope/lastRefreshedAt, and event-time historical truth. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement scope-safe indexed queue/metric query objects, documented API/examples, and operational-view metric definitions. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add supervisor/central scope, severity-after-breach, and query-plan fixture cases; run focused commands and capture plan evidence. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Centralize metric definition/version labels and authorization filter application; rerun tests. <!-- sdd-owner: implementation -->

### WU-22 — Attributable pilot baseline and authorized export
**Paths:** `packages/application/src/pilot/{measurement,export,degraded-outcome-port}.ts`, `apps/api/src/routes/pilot-reports.ts`, `apps/api/test/pilot-reports.contract.test.ts`, `openapi/examples/pilot-reports/*`, `docs/pilot-measurement.md`, pilot tests. **Estimate:** +335/-25 = **360**. **Contingency:** storage-content streaming may be extracted only behind an explicit `size:exception`; metadata/unavailable markers are mandatory here. **Depends:** WU-06, WU-12–WU-21. **Verify:** `pnpm test:integration -- pilot-measurement`; contract/export fixture smoke. **Rollback:** remove report/export routes without altering retained records.

- [ ] **RED:** Add failing tests for attributable observed volume, workflow completion, SLA attainment, reopening, alert delivery, and degraded-connectivity outcome aggregates with no invented pass/fail target. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement scoped measurement report, authorized export, and a typed degraded-outcome input port for incident state/events/policy snapshots/evidence metadata-or-unavailable/SLA cycles/delivery/draft outcome records; add route examples and pilot-baseline guide. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add one-week fixture baseline, unauthorized export, empty-baseline, and export completeness tests; run focused commands and export smoke. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Share event-time measurement definitions with WU-21 without exposing cross-scope aggregates; rerun tests. <!-- sdd-owner: implementation -->

### WU-23 — Responsive create and traceability detail PWA
**Paths:** `apps/web/src/features/incidents/{create,detail}/*`, `apps/web/e2e/create-detail.spec.ts`, `docs/pwa-create-detail.md`. **Estimate:** +360/-25 = **385**. **Contingency:** lifecycle action UI is WU-24; no exception. **Depends:** WU-05–WU-13, WU-21. **Verify:** `pnpm test:e2e -- create-detail` at 360px, terminal, desktop. **Rollback:** remove create/detail UI/tests; public API remains available.

- [ ] **RED:** Add Playwright tests for 360px creation, explicit ambiguous scope, field recovery, text evidence, current SLA/history/evidence, and accessible no-horizontal-scroll controls. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement public-contract-only create/detail routes, scope defaults requiring review, touch/keyboard controls, and PWA create/detail guide. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add terminal/desktop and accessibility journeys; run E2E command. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Extract shared form/status components under `apps/web/src/ui/*`; rerun E2E tests. <!-- sdd-owner: implementation -->

### WU-24 — Responsive triage, work, resolution, and reopen PWA
**Paths:** `apps/web/src/features/incidents/actions/*`, `apps/web/e2e/incident-actions.spec.ts`, `docs/pwa-actions.md`. **Estimate:** +370/-20 = **390**. **Contingency:** dashboard/history is WU-25; no exception. **Depends:** WU-10–WU-20, WU-23. **Verify:** `pnpm test:e2e -- incident-actions`; lifecycle contract test. **Rollback:** remove action UI/query hooks/tests; server action contracts remain intact.

- [ ] **RED:** Add browser tests for triage confirmation/correction/fallback, start/block/resume/reassign/resolve/reopen, pending controls, stale/forbidden recovery, and repeated resolve tap. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement action panels/TanStack mutations with preserved input, intentional stale review, API-result mapping, and action journey documentation. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add phone/terminal touch-keyboard/desktop scenarios for required reasons/evidence and supervisor reopen; run focused commands. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Centralize action-result state mapping; rerun E2E tests. <!-- sdd-owner: implementation -->

### WU-25 — Responsive queues, dashboards, and history review PWA
**Paths:** `apps/web/src/features/operational-views/*`, `apps/web/e2e/dashboards.spec.ts`, `docs/pwa-operations.md`. **Estimate:** +350/-25 = **375**. **Contingency:** notification surface remains WU-19; no exception. **Depends:** WU-12, WU-18–WU-23. **Verify:** `pnpm test:e2e -- dashboards`; operational-views contract test. **Rollback:** remove dashboard/history presentation only; read APIs remain intact.

- [ ] **RED:** Add browser tests for scope/filter labels, queues, ownership gaps, no-data metrics, event-time disclosure, reopened-cycle history, and authorized notification drill-in. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement responsive operational queues/dashboard/history filters using WU-21 API and document review journeys. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add supervisor Store-A and central multi-store browser journeys at all supported layouts; run focused commands. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Share visible scope/filter state between list and metric views; rerun tests. <!-- sdd-owner: implementation -->

### WU-25B — Responsive notification center
**Paths:** `apps/web/src/features/notifications/*`, `apps/web/e2e/notification-center.spec.ts`, `docs/pwa-notifications.md`. **Estimate:** +295/-20 = **315**. **Contingency:** bulk-read controls are limited to owned notifications; no exception. **Depends:** WU-19, WU-23. **Verify:** `pnpm test:e2e -- notification-center`. **Rollback:** remove notification UI/tests only; API notification records remain unchanged.

- [ ] **RED:** Add browser tests for own-notification visibility, unread count, idempotent read/unread, access-loss redaction, and read not acknowledging work. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement responsive notification center/list/bulk-owned-read controls using WU-19 public contract and document the user journey. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add phone, terminal, and desktop recipient/non-recipient scenarios; run `pnpm test:e2e -- notification-center`. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Share notification query status with the UI shell without duplicating authorization rules; rerun E2E tests. <!-- sdd-owner: implementation -->

### WU-26 — Offline drafts and attributable degraded-connectivity outcomes
**Paths:** `apps/web/src/features/drafts/*`, `apps/web/src/pwa/*`, `apps/web/e2e/offline-draft.spec.ts`, `packages/contracts/src/degraded-connectivity.ts`, `docs/degraded-connectivity.md`. **Estimate:** +365/-25 = **390**. **Contingency:** attachment blob retention stays explicitly unsupported; no exception. **Depends:** WU-03, WU-05, WU-08, WU-22–WU-24. **Verify:** `pnpm test:unit -- drafts`; `pnpm test:e2e -- offline-draft`. **Rollback:** unregister shell cache and remove local drafts; server idempotency and pilot records remain.

- [ ] **RED:** Add unit/E2E tests for per-user/device 24-hour draft, online/slow/offline states, not-reported display, same-key lost-ack retry, outcome recording, reattachment-required, expiry, discard, and sign-out isolation. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement shell-only Workbox cache, IndexedDB draft repository, explicit retry/status flow, WU-22 degraded-outcome port producer, and degraded-connectivity guide. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add offline/interrupted/reconnect accepted-pending-validation-authorization-conflict and shared-terminal cases; run focused commands. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Isolate browser persistence behind the draft repository and shared status mapping; rerun tests. <!-- sdd-owner: implementation -->

### WU-27 — Secure API entrypoint hardening
**Paths:** `apps/api/src/{security,rate-limit,config}/*`, `packages/infrastructure/src/config/*`, `apps/api/test/security.contract.test.ts`, `docs/security-operations.md`. **Estimate:** +325/-30 = **355**. **Contingency:** endpoint-specific upload/login/export rates reuse shared classes; no exception. **Depends:** WU-03, WU-05–WU-07, WU-13, WU-22. **Verify:** contract/integration `-- security`. **Rollback:** revert middleware/config as one entrypoint boundary; do not weaken authorization logic.

- [ ] **RED:** Add failing tests for CSP/CORS/frame/cookie defaults, CSRF, endpoint-class limits, secret/evidence URL redaction, and fail-closed `503` for unavailable authorization/commit decisions. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement hardened middleware/environment validation, rate-limit classes, safe temporary-failure mapping, and security operations documentation. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add upload/export/login and unavailable dependency cases; run focused commands. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Centralize secure configuration parsing without moving business policy; rerun tests. <!-- sdd-owner: implementation -->

### WU-28 — Pilot deployment, containment, recovery, and export runbook
**Paths:** `infra/{compose.local.yml,Dockerfile.api,Dockerfile.worker,Dockerfile.web}*`, `.env.example`, `scripts/{smoke-local,verify-migration}.ts`, `docs/{deployment,recovery,pilot-containment}.md`, deployment tests. **Estimate:** +360/-25 = **385**. **Contingency:** cloud-provider manifests remain a blocked pilot decision; no exception. **Depends:** WU-01, WU-05, WU-13, WU-20, WU-22, WU-27. **Verify:** local Compose smoke; migration verification; maintenance/containment/export walkthrough. **Rollback:** stop new creation and outbound email, retain authorized review/export, remove deployment artifacts only in non-pilot environments.

- [ ] **RED:** Add failing configuration tests for separated development/test/demo/pilot settings, no production auto-seed, missing secrets, maintenance read-only mutation rejection, and export/containment availability. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement OCI/local Compose deployment, environment guards, migration verification, maintenance mode, pilot shutdown/containment commands, and deployment/recovery documentation. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Run PostgreSQL/MinIO/Mailpit/dev-issuer local smoke plus uncertain-authority/read-only and contained-email/export scenarios; record exact results. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Keep deployment/provider configuration outside domain/application packages; rerun deployment checks. <!-- sdd-owner: implementation -->

### WU-29 — Operator health signals and safe job recovery
**Paths:** `apps/{api,worker}/src/observability/*`, `packages/application/src/observability/*`, `apps/{api,worker}/test/observability.test.ts`, `docs/observability.md`. **Estimate:** +310/-25 = **335**. **Contingency:** external telemetry exporter remains an adapter; no exception. **Depends:** WU-13, WU-15, WU-20, WU-27–WU-28. **Verify:** `pnpm test:integration -- observability`; health/readiness and replay scenario. **Rollback:** disable optional exporter only; preserve safe logs and job uniqueness behavior.

- [ ] **RED:** Add failing tests for safe correlation logs/metrics/traces, API/database/job-lag/email-failure/evidence-backlog signals, replay-safe jobs, and product-SLA versus platform-SLO separation. <!-- sdd-owner: implementation -->
- [ ] **GREEN:** Implement health/readiness and operator signal adapters, safe structured fields, job replay checks, alert thresholds as configuration, and observability runbook. <!-- sdd-owner: implementation -->
- [ ] **TRIANGULATE:** Add delayed SLA/outbox, permanent-mail, scan-backlog, and database-health integration scenarios; run focused commands and readiness smoke. <!-- sdd-owner: implementation -->
- [ ] **REFACTOR:** Keep telemetry exporter code behind ports and remove restricted data from signal mapping; rerun tests. <!-- sdd-owner: implementation -->

## Gate-F — Final acceptance verification (not an implementation slice)
**Depends:** WU-01–WU-29, WU-03TH, WU-03P, WU-05P, WU-05C, WU-07P, WU-07C-A, WU-07C-B, WU-07C-C, WU-08S, and WU-25B. **Verify:** `pnpm test:all`, OpenAPI lint/diff, migration verification, local recovery/containment/export walkthrough, and per-unit changed-line measurement. **Evidence:** `docs/acceptance/shelfops-mvp.md`. **Containment:** stop creation, contain email, preserve/export authorized records, correct and revalidate before resuming.

- [ ] Execute the requirement traceability matrix against the six specifications and record exact commands/results, outstanding pilot blockers, and no invented pilot targets in `docs/acceptance/shelfops-mvp.md`. <!-- sdd-owner: implementation -->
- [ ] Confirm every reviewed work unit is ≤1200 changed lines or has an explicitly approved `size:exception`; run the final verification set without adding behavior. <!-- sdd-owner: implementation -->

## Parent review and lifecycle gates

- [ ] Parent: after each applied work unit, execute only the native bounded-review lifecycle for that immutable slice; repeated gates validate the existing receipt and do not open a new budget. <!-- sdd-owner: parent -->
- [ ] Parent: before implementation acceptance, verify Gate-F covers all Traceability map domains and that OIDC/email/catalog/SLA/retention/baseline decisions are still explicit pilot blockers rather than unapproved defaults. <!-- sdd-owner: parent -->
