# Verify the local production topology

Use this smoke only to verify the repository's production API image against an isolated local PostgreSQL instance. It does not deploy, select a cloud, or validate production credentials.

## Quick path

1. Copy `.env.production.example` to `.env.production` and replace every placeholder with local-only values.
2. Choose unused loopback ports from 1024 through 65535.
3. Run `pnpm smoke:production` from the repository root.

The command creates the fixed `shelfops-production-smoke` Compose project. It starts PostgreSQL, applies every repository migration from the host, builds and starts the production API image, verifies `/health` and `/ready`, restarts only the API, proves the database marker persisted, confirms migrations are a no-op, and removes the containers, network, and named volume.

## Safety contract

- Ports bind only to `127.0.0.1`. PostgreSQL and API use separate host bridges, while their only shared network is internal.
- The script rejects an inherited `DATABASE_URL`; it derives the only accepted target from the smoke database and validated loopback port.
- Credentials are runtime environment values. The script does not print them or URLs containing them.
- Polling and subprocesses have bounded deadlines. Any failure exits nonzero and runs the same volume-removing teardown.
- The named volume survives the API restart. It is deleted only by initial/final controlled cleanup.
- Running this command destroys only resources in the fixed local smoke project. Never reuse its project name or environment file for production data.

## Configuration

| Variable | Purpose |
| --- | --- |
| `SMOKE_DB_PASSWORD` | Local PostgreSQL password; must not retain the example placeholder. |
| `SMOKE_CURSOR_SECRET` | Local API cursor secret of at least 32 bytes. |
| `SMOKE_DB_PORT` | Unused localhost PostgreSQL port. |
| `SMOKE_API_PORT` | Unused localhost API port. |
| `SMOKE_ENV_FILE` | Optional path replacing the default `.env.production`. |

## Failure recovery

The script tears down its resources on ordinary failures. If the process or Docker daemon is terminated abruptly, run:

```sh
docker compose --project-name shelfops-production-smoke \
  --file infra/compose.production-smoke.yml down --volumes --remove-orphans
docker image rm shelfops-api:production-smoke
```

This rollback removes only the local smoke topology and image. It does not reverse migrations on any external database because external database targets are rejected.
