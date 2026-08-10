# ShelfOps project context

ShelfOps is a greenfield retail operational exception-management system. It converts scattered operational reports into assignable, traceable incidents.

## Product baseline

Initial report types include out-of-stock shelves, theoretical-versus-physical stock mismatches, misplaced merchandise, price or label inconsistencies, blocked replenishment, equipment or terminal issues, and repeated unowned incidents.

## Intended roles

- Store collaborator
- Department lead
- Supervisor
- Inventory team
- Technical support / operations

## MVP scope

- Users and roles
- Simulated stores, sectors, locations, and products
- Incident creation with category, severity, and evidence
- Assignee management
- Statuses: open, classified, in-progress, blocked, resolved
- Change history, SLA and deadlines, alerts, and operational dashboard
- Documented API and tests for rules and transitions

## Live delivery context

| Topic | Current state |
| --- | --- |
| Repository | Git is initialized; native candidate-tree accounting is in use. |
| Stack | TypeScript modular monolith: React/Vite PWA, Fastify API, and PostgreSQL worker, domain, and infrastructure packages. |
| Artifact workflow | Hybrid OpenSpec + Engram. |
| Execution | Automatic. Phases advance only after gatekeeper PASS; one bounded corrective rerun is allowed. Genuine product, external, or native-consent decisions still stop. |
| Delivery | Canonical `auto-chain`; task chain strategy is `stacked-to-main`. Review budget: 1200 changed lines. |
| Strict TDD | Active and runnable. Apply work uses red-green-refactor. |
| Test harness | pnpm 11 with Vitest unit, contract, and PostgreSQL integration configurations. Testcontainers supports integration tests; integration files run serialized. |
| Runnable commands | `pnpm test`, `pnpm test:all`, `pnpm typecheck`, `pnpm test:integration`, `pnpm test:contract`, and builds. Clean root typecheck builds `@shelfops/contracts` before `tsc --noEmit`. |
| E2E | Playwright is planned for later work and is not current runnable evidence. |
| Review receipts | RDD/receipt-driven review is maintainer-disabled and outside apply/test execution. |

## Next step

WU-05 package-boundary conformance is active before WU-06.
