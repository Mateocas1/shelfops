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
