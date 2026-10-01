# ShelfOps development checks

Run the same ordered gates locally before requesting review. CI uses an Ubuntu runner and a frozen dependency graph; it does not change product data or publish artifacts.

## Prerequisites

- Node.js >=22.19.0 (required by locked Undici/Testcontainers runtime)
- pnpm 11.11.0
- Docker Desktop or a compatible Linux Docker engine

Docker is required for serial PostgreSQL 16 Testcontainers integration tests. Confirm that the daemon is healthy before starting:

```sh
docker info
```

The command must exit successfully; start Docker Desktop or your compatible engine if it does not.

## CI parity

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm build:producers
pnpm typecheck
pnpm test:unit
docker info
pnpm test:integration
pnpm test:contract
pnpm openapi:generate
git diff --exit-code -- openapi/openapi.json
pnpm build
```

Run commands in this order. Producer builds establish package exports before typechecking consumers. The shell-free integration runner executes files serially and waits for Testcontainers resources, including Ryuk, to stop.

`pnpm test:all` remains the local aggregate check. CI keeps the gates explicit so a failure identifies its owning boundary.

## Diagnose failures

| Failure | Check |
| --- | --- |
| Frozen install | Confirm `pnpm-lock.yaml` matches package manifests and pnpm is 11.11.0. |
| Docker or integration | Run `docker info`, then confirm no resource remains from `docker ps -aq --filter label=org.testcontainers=true`. |
| OpenAPI drift | Inspect the generated output in `openapi/openapi.json`; update it only in a slice that owns that file. |
| Typecheck or build | Start with the first failing producer package instead of rebuilding consumers repeatedly. |

After a failed build, remove only generated output such as package `dist/` directories and TypeScript build-info files. Never delete source files to make a check pass.

## CI boundaries

CI has read-only repository permission. It does not publish, deploy, seed production data, use deployment secrets, or continue after a failed gate.

Playwright is a future extension point and is not run by the current workflow. Add its browser installation and E2E command only when a later slice owns the PWA harness and browser policy.

## API lifecycle smoke

For a five-minute reviewer walkthrough of the real API, PostgreSQL adapters, and incident triage lifecycle, run the [portfolio demo](demo.md).

`GET /health` proves only that the API process can answer. `GET /ready` proves that the process is not draining and its shared PostgreSQL pool can execute a probe. Readiness returns `503 {"status":"unavailable"}` without dependency details when PostgreSQL is unavailable or shutdown has begun.

Production startup probes PostgreSQL before opening the listener. `SIGTERM` and `SIGINT` stop readiness first, then allow Fastify up to 10 seconds to close; exceeding that deadline marks the process exit as failed.
Externally composed production adapters must inject their PostgreSQL probe; the API never assumes ownership of that dependency.

## Production cursor configuration

Set `CURSOR_SECRET` to secret material containing at least 32 UTF-8 bytes before starting the production API. Production startup rejects missing or shorter values and rejects the development-only fallback. Keep the value outside source control and logs.

Rotating `CURSOR_SECRET` invalidates outstanding cursors. Deploy rotation as an intentional pagination reset; clients must restart affected list traversal without the old cursor.

Production database changes use the fail-closed commands documented in [Run PostgreSQL migrations](operations/migrations.md).
Create the organization, store, user, and OIDC mapping for a deployment with [Bootstrap a tenant](operations/tenant-bootstrap.md).
Build, inspect, run, and roll back the production artifact with [Run the production API container](operations/container.md).
Verify the complete local image, migration, restart, and persistence path with [Verify the local production topology](operations/production-smoke.md).
Configure and collect secret-safe production output with [Collect production API logs](operations/logging.md).
Configure scraping, bounded labels, and diagnostic alerts with [Scrape production API metrics](operations/metrics.md).

Start the API in one terminal:

```sh
pnpm --filter @shelfops/api dev
```

Then request the bootstrap health route from another terminal:

```sh
curl http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/ready
```

The expected responses are `{"status":"ok"}` and `{"status":"ready"}`. This smoke check does not replace the frozen matrix above.
