# ShelfOps API conventions

All product endpoints use `/api/v1`. The committed `openapi/openapi.json` is generated from the same Fastify/TypeBox schemas that validate requests.

## Request and response rules

- The server assigns `correlationId` and returns it in `X-Correlation-Id`; clients do not provide it.
- Validation failures use `400 validation-failed` with `{ code, message, correlationId, fields? }` and reject unknown query fields.
- Safe indeterminate failures use `503 temporarily-unavailable`; retry the same logical operation and idempotency key when an operation supports one.
- Collections default to 50 items and reject limits above 200. Cursors are opaque, integrity-signed, subject/filter-bound, and may expire.

## Incident reads

`GET /api/v1/incidents` and `GET /api/v1/incidents/{incidentId}` require the `shelfops_session` cookie. Authorization context is derived from the authenticated session and cannot be overridden by client input. List requests accept `limit` from 1 through 200 (default 50), an opaque `cursor`, the closed `state` values `open`, `classified`, `in-progress`, `blocked`, and `resolved`, and a non-empty `category` key.

Category keys are configurable organization reference data and use exact matching; unknown or nonmatching category keys return an empty authorized result.

`nextCursor` appears only when more rows exist. Treat it as opaque and reuse it only with the unchanged subject, filters, and sort context. Changing that context, using an invalid cursor, or sending unsupported query fields returns `400 validation-failed`. Missing authentication returns `401 authentication-required`; unavailable detail identifiers return `404 not-found`; safe temporary failures return `503 temporarily-unavailable`.

Public responses contain only documented fields, including the incident fields and correlation identifiers defined by OpenAPI.

## Contract workflow

1. Run `pnpm openapi:generate` after changing a route schema.
2. Review the resulting `openapi/openapi.json` with its compatible v1 semantics.
3. Run `pnpm test:contract -- api-foundation` to validate the committed contract.

The generator calls the API's OpenAPI document factory, writes deterministic UTF-8 JSON, and ends the file with exactly one newline. It is safe to run repeatedly; unchanged schemas produce byte-identical output.
