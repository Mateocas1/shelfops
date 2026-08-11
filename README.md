# ShelfOps: accountable retail incident triage

ShelfOps is a backend-focused CV portfolio MVP for turning store-floor incidents into traceable, authorized decisions. It demonstrates how a retail operations service can preserve who acted, what the system suggested, what a human confirmed, and how an incident changed, without presenting the project as a deployed production SaaS.

## Quick demo

Prerequisites:

- Node.js >=22.19.0
- pnpm 11.11.0
- A running Docker daemon able to pull PostgreSQL 16

From the repository root:

```sh
pnpm demo
```

The command starts an isolated PostgreSQL container, applies migrations 1-12, runs the production-composed Fastify API and PostgreSQL adapters, drives the scenario over loopback HTTP, and removes temporary resources. See the [demo guide](docs/demo.md) for expected output and failure handling.

## What the demo proves

- An authenticated session resolves a simulated reviewer; role, scope, grants, CSRF protection, and incident visibility are enforced by the API rather than accepted from request data.
- Incident creation, listing, detail, triage evaluation, decision, and final reads use real HTTP endpoints and real PostgreSQL persistence.
- The incident moves from `open@v1` to a deterministic awaiting-decision projection at `v2`, then to accountable `classified@v3` only after human confirmation of category, severity, and assignee.
- Evaluation and decision history retain action correlations while each HTTP response carries its current request correlation.
- API listener, connection pool, container, and temporary resources are cleaned up on success or failure.

## Architecture

```text
Reviewer HTTP request
        |
        v
@shelfops/api (Fastify, OIDC BFF/session boundary, route composition)
        |
        +--> @shelfops/contracts (closed HTTP schemas and errors)
        +--> @shelfops/application (use cases, ports, authority workflows)
                    |
                    +--> @shelfops/domain (policies and deterministic evaluation)
                    +--> @shelfops/infrastructure (PostgreSQL adapters)
                                      |
                                      v
                                 PostgreSQL 16
```

| Workspace | Responsibility |
| --- | --- |
| `apps/api` / `@shelfops/api` | Fastify HTTP API, authentication boundary, route composition, startup, readiness, and shutdown. |
| `packages/domain` / `@shelfops/domain` | Authorization policies, assignment eligibility, governance, and deterministic triage/recurrence evaluation. |
| `packages/application` / `@shelfops/application` | Incident, identity, SLA, recurrence, and triage use cases expressed against ports. |
| `packages/contracts` / `@shelfops/contracts` | Shared TypeBox request, response, error, pagination, configuration, and triage contracts. |
| `packages/infrastructure` / `@shelfops/infrastructure` | PostgreSQL identity, idempotency, incident, configuration, SLA, recurrence, triage, and scoped read adapters. |
| `apps/web`, `apps/worker` | Reserved build-only shells; no reviewer-facing UI or background runtime is claimed by this MVP. |

## Engineering evidence

- **Separation of concerns:** domain policy is independent from application orchestration, HTTP contracts, and PostgreSQL implementation.
- **PostgreSQL integration:** migrations, transactions, scoped repositories, idempotency records, version checks, and retained audit projections are exercised against PostgreSQL rather than an in-memory substitute.
- **OIDC BFF security:** the browser-facing design keeps provider access tokens out of the browser, uses opaque server-side sessions, hash-only credentials, secure cookie policy, CSRF checks, and fail-closed identity resolution.
- **Accountable concurrency:** mutation bodies carry idempotency keys; triage mutations use expected versions; equal replays retain committed outcomes while stale or conflicting actions fail explicitly.
- **Contract control:** closed TypeBox schemas feed OpenAPI generation, and CI rejects drift in the committed OpenAPI document.
- **Behavioral testing:** focused unit tests cover policy, PostgreSQL integration tests cover persistence behavior, and API contract tests cover composed HTTP boundaries.
- **CI/CD evidence:** GitHub Actions uses frozen dependencies and explicit producer build, typecheck, unit, PostgreSQL integration, contract, OpenAPI drift, and workspace build gates. It does not publish or deploy artifacts.

## Portfolio scope

ShelfOps is intentionally a technically credible MVP, not a claim of production deployment or product completeness. The demonstrated scope is the backend incident lifecycle, authorization, persistence, API contracts, operational boundaries, and professional verification pipeline.

The project does not currently claim a delivered web UI, active worker runtime, production identity-provider onboarding, hosted environment, production data, browser E2E suite, rate limiting, or a complete retail operations platform. Backend architecture and hardening are frozen so portfolio work remains focused on demonstrated behavior rather than additional infrastructure or ceremony.

## Reviewer links

- [Run the portfolio demo](docs/demo.md)
- [Development and CI parity](docs/development.md)
- [OIDC session boundary](docs/authentication.md)
- [Authorization model](docs/authorization.md)
- [Create an incident](docs/incident-creation.md)
- [Complete accountable triage](docs/triage.md)
- [API conventions](docs/api-conventions.md)
