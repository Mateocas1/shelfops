# Run the production API container

Build the API image locally as a linux/amd64 artifact. The image contains the compiled API and its production dependency closure; migrations remain an explicit host operation.

## Build

```sh
docker build --platform linux/amd64 \
  --file Dockerfile.api \
  --build-arg SOURCE_REVISION="$(git rev-parse HEAD)" \
  --build-arg SOURCE_REPOSITORY="$(git remote get-url origin)" \
  --tag shelfops-api:local .
```

The build uses pinned Node.js 22.19.0 Debian slim stages and pnpm 11.11.0. It does not publish the image or include credentials. Inspect the immutable local identity with `docker image inspect shelfops-api:local --format '{{index .RepoDigests 0}} {{.Size}}'`; a local-only tag may have no repository digest, so record `.Id` instead.

## Run

Apply migrations before starting the API, following [Run PostgreSQL migrations](migrations.md). Then inject configuration at runtime:

```sh
docker run --rm --name shelfops-api \
  --env DATABASE_URL \
  --env CURSOR_SECRET \
  --publish 3000:3000 \
  shelfops-api:local
```

`DATABASE_URL` must address PostgreSQL from inside the container, not container-local `localhost`. `CURSOR_SECRET` must contain at least 32 UTF-8 bytes. Keep both values out of the image, shell history, logs, and tickets.

## Database SSL and pool settings

Both the API and the migration task read the same connection settings:

| Variable | Default | Meaning |
| --- | --- | --- |
| `DATABASE_SSL_MODE` | `disable` | `disable`, `require` (encrypt without verifying the certificate), or `verify-full` (verify the CA and hostname). Any other value aborts startup. |
| `DATABASE_SSL_CA_PATH` | `certs/global-bundle.pem` | CA bundle used by `verify-full`. The image ships the Amazon RDS `global-bundle.pem`; override it for another CA. |
| `DATABASE_POOL_MAX` | `10` | Maximum pooled API connections. |
| `DATABASE_STATEMENT_TIMEOUT_MS` | `30000` | Statement timeout applied to each connection. |
| `DATABASE_IDLE_TIMEOUT_MS` | `10000` | Idle connection timeout for the API pool. |

Each pool value must be a positive integer; invalid values abort startup. Use `DATABASE_SSL_MODE=verify-full` against RDS.

## Entrypoint hardening

| Variable | Default | Meaning |
| --- | --- | --- |
| `TRUST_PROXY` | `true` when `NODE_ENV=production`, otherwise `false` | Trust `X-Forwarded-For` so `request.ip` reflects the load balancer client. |
| `RATE_LIMIT_MAX` | `100` | Maximum requests per client and window. `/health`, `/ready`, `/metrics`, and CORS preflight are exempt. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds. |
| `CORS_ALLOWED_ORIGINS` | empty | Comma-separated exact `scheme://host` origins. Empty denies every cross-origin request. |

The rate limit and CORS values must be valid positive integers or exact origins; invalid values abort startup. Rate-limited responses use the standard error envelope with `code: rate-limit-exceeded` and status `429`.

## Migrations image

Build the one-off migration image, which contains the compiled migration script, `migrations/`, the RDS CA bundle, and production dependencies only (no `tsx`):

```sh
# Plain docker build still yields the API image; the migration task is a target.
docker build --platform linux/amd64 --file Dockerfile.api --target migrate --tag shelfops-migrate:local .
```

Run it as a one-off task before starting application instances:

```sh
docker run --rm \
  --env DATABASE_URL \
  --env DATABASE_SSL_MODE=verify-full \
  shelfops-migrate:local

docker run --rm \
  --env DATABASE_URL \
  --env DATABASE_SSL_MODE=verify-full \
  shelfops-migrate:local status
```

Both commands write one machine-readable JSON object and exit nonzero on drift, an unavailable database, or invalid configuration.

## Verify

Require both probes before serving traffic:

```sh
curl --fail http://127.0.0.1:3000/health
curl --fail http://127.0.0.1:3000/ready
docker stop --time 15 shelfops-api
```

Expected responses are `{"status":"ok"}` and `{"status":"ready"}`. A normal stop sends `SIGTERM`; the process first fails readiness, drains requests, closes PostgreSQL, and exits within its shutdown deadline.

## Roll back

Stop the current container and start the previously recorded image ID with the same runtime configuration. Database migrations are forward-only: never reverse schema files as part of an image rollback. Confirm the previous application version remains compatible with the current schema before rollback.
