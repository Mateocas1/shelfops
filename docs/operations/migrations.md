# Run PostgreSQL migrations

Apply repository migrations before starting application instances. The command validates migration files and the database ledger before it applies pending SQL.

## Quick path

1. Set `DATABASE_URL` to the target PostgreSQL connection string.
2. Run `pnpm migrate` once for the deployment.
3. Run `pnpm migrate:status` and require a zero exit with `"status":"current"`.
4. Start or roll out application instances only after migration success.

Do not print the environment variable or include credentials in command history, logs, tickets, or screenshots.

Set `DATABASE_SSL_MODE` (`disable`, `require`, or `verify-full`) exactly as for the API; the migration connection uses the same SSL and statement-timeout rules. `verify-full` defaults to the bundled `certs/global-bundle.pem` and can be pointed at another CA with `DATABASE_SSL_CA_PATH`.

On a deployment host without the repository, build and run the `migrate` image target instead of `pnpm migrate`; it runs the same commands with production dependencies only. See [Run the production API container](container.md#migrations-image).

## Output

Both commands write one machine-readable JSON object. A current database resembles:

```json
{"status":"current","current":12,"pending":[],"applied":[],"drift":[]}
```

`pnpm migrate` lists newly applied filenames in `applied`. `pnpm migrate:status` reports unapplied filenames in `pending` with `"status":"pending"` and does not execute migration SQL. Status exits nonzero if PostgreSQL is unavailable, another runner owns the migration lock, or drift is detected.

## Failure behavior

| Condition | Behavior |
| --- | --- |
| Concurrent runner | Fails immediately with `migration-lock-unavailable`; retry after the active runner exits. |
| Checksum, order, missing-file, or ledger drift | Fails closed with `migration-drift`; investigate before any pending migration runs. |
| Migration SQL failure | Rolls back that migration's schema changes and ledger insert, then exits nonzero. Earlier successful migrations remain applied. |
| Lost database connection | Exits nonzero. Confirm database state with `pnpm migrate:status` before retrying. |

The runner holds one session advisory lock and one database connection for the full operation. Each migration and its ledger row commit atomically. Output never includes SQL text or `DATABASE_URL`.

## Recovery

NEVER edit, rename, reorder, or remove an applied migration file. Its exact bytes are its immutable SHA-256 identity.

Migrations are forward-only; the command does not provide rollback SQL. Recover from a deployed schema defect with a new numbered migration. Database restoration or destructive rollback requires a separately reviewed operational plan and must account for application and data compatibility.
