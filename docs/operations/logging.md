# Collect production API logs

ShelfOps writes one JSON object per line to standard output. Collect stdout as an application log stream; keep stderr for runtime failures outside the API logger.

## Quick path

1. Set `NODE_ENV=production`, `RELEASE` to the deployed artifact identifier, and `LOG_LEVEL` to `debug`, `info`, `warn`, or `error`.
2. Start the API and send a valid `x-correlation-id` header when tracing work across services.
3. Parse each stdout line as JSON and index `event`, `requestId`, and `correlationId`.

Invalid log levels fail before the listener opens. Development and tests can inject a logger or pass `logger: false`; this does not mutate global logging state.

## Fields and events

Every record contains `event`, `level`, `timestamp`, `service`, `release`, and `environment`. Request completion records also contain `requestId`, validated `correlationId`, `method`, query-free `path`, `statusCode`, and `elapsedMs`.

Lifecycle events are `startup.ready`, `startup.failed`, `shutdown.begin`, `shutdown.completed`, `shutdown.timeout`, and `shutdown.failed`. Signal handling emits one shutdown terminal event even when signals repeat.

## Secret safety

Request and response bodies, query values, headers, cookies, session IDs, SQL, and arbitrary error objects are not logged. Unexpected failures expose only safe error type, code, and generic message fields.

NEVER add authorization, cookie, CSRF, `DATABASE_URL`, `CURSOR_SECRET`, password, token, session, raw SQL, or nested sensitive values to log fields. Correlation IDs accept only 1-128 ASCII letters, digits, `.`, `_`, `:`, or `-`; invalid values are replaced by the generated request ID.

## Collection and rollback

Configure the process supervisor to collect newline-delimited stdout without multiline joining. Roll back this logging unit by reverting the API logger, its bounded lifecycle wiring, contract test, and this guide; API response contracts and domain behavior are independent.
