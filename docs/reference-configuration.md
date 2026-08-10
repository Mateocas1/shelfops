# Configure a location reference

Use the sole configuration mutation to change a location label, active state, or effective period without bypassing authorization, optimistic concurrency, or idempotency.

## Quick path

1. Resolve the current location version and confirm the store and location identifiers.
2. Authenticate with the opaque session cookie and provide its matching `x-csrf-token` header.
3. Send POST `/api/v1/stores/{storeId}/locations/{locationId}/configuration` with a new body `idempotencyKey`.
4. Retain the complete request body until the outcome is known.

The path supplies store and location authority. Do not place actor, target, event, or correlation claims in the body. ShelfOps derives those values from the session, path, and server request context.

## Request body

| Field | Requirement |
| --- | --- |
| `expectedVersion` | Required non-negative current location version. |
| `effectiveAt` | Required nonblank effective timestamp. |
| `effectiveUntil` | Optional nonblank end timestamp. |
| `active` | Required desired active state. |
| `label` | Optional nonblank replacement label. |
| `idempotencyKey` | Required nonblank body value for API v1. Header-only idempotency is unsupported. |

The session must be active and authorized for the path scope. Missing authentication returns `401 authentication-required`; missing or invalid CSRF returns `403 forbidden` before execution.

## Success and replay

A fresh success returns `200` with `eventId`, `version`, `before`, `after`, `effectiveAt`, and `correlationId`. The `x-correlation-id` response header identifies the same operation for support.

After a lost acknowledgement, retry with the same key and unchanged body. Equivalent replay is evaluated before stale-version checks and returns the original `200` outcome, including its original event and correlation identifiers. Do not create a new key for the same logical action.

## Recovery decisions

| Outcome | Action |
| --- | --- |
| `409 idempotency-conflict` | The key was used for a different body. Stop and reconcile which operation was intended. |
| `409 stale-version` | This is a fresh request based on old state. Retrieve the current location, review it, then submit an intentional new action with a new key. |
| `503 temporarily-unavailable` | The action may be pending or its commit acknowledgement may be indeterminate. Retry the same key and unchanged body; do not blindly re-execute with another key. |
| `400 validation-failed` | Correct the reported fields. Unknown authority claims are rejected. |
| `403 forbidden` | Restore valid scope or CSRF authorization; do not retry unchanged credentials. |
| `404 not-found` | Treat the location as absent or hidden by scope. Do not infer its existence. |

Error bodies contain stable `code`, safe `message`, and `correlationId`; validation errors also include `fields`. The `x-correlation-id` header carries the same current-request identifier for failed operations.

## Unsupported surfaces

Only the exact store/location route is supported. These alternatives are intentionally unreachable:

- `/api/v1/configuration`
- `/api/v1/organizations/{organizationId}/configuration`
- `/api/v1/targets/{targetId}/configuration`

The canonical request and outcome files are in `openapi/examples/reference-configuration/` and are validated against runtime behavior and the committed OpenAPI operation.
