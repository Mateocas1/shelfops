# Create an incident

`POST /api/v1/incidents` creates one open incident, its sequence-1 text evidence, and its creation event. It returns `201 Created`.

## Request

Authenticate with the session cookie (`shelfops_session`) and send the matching CSRF token in `x-csrf-token`. The active session supplies the reporter and all authorization context; request fields cannot override either.

The JSON body requires `storeId`, `sectorId`, `locationId`, `category`, `severity`, `title`, `description`, RFC3339 `occurredAt`, nonblank `textEvidence` up to 4,000 characters, and `idempotencyKey`. `productId` is optional. Category and severity are nonblank catalog keys, not fixed enums.

No Idempotency-Key header is defined. Keep idempotency in the body.

## Replay and recovery

An equal replay returns the original creation IDs, time, state, and version. Its `X-Correlation-Id` header and body `correlationId` always identify the current HTTP request correlation, not the original request.

After an indeterminate `503`, retry the unchanged body with the same `idempotencyKey`. A changed body with that key returns `409 idempotency-conflict`.

## Errors

| Status | Meaning |
|---|---|
| `400 validation-failed` | Invalid body or reference; reference diagnostics are only `reference` / `invalid`. |
| `401 authentication-required` | Session is missing, invalid, inactive, or expired. |
| `403 forbidden` | CSRF validation or creation authorization failed. |
| `409 idempotency-conflict` | The key belongs to a different request. |
| `503 temporarily-unavailable` | Safe temporary or indeterminate outcome; use same-key recovery. |

## Exclusions

Creation has no `expectedVersion` or stale-version response. This endpoint does not add attachments, SLA, triage, recurrence, transitions, rate limiting, offline behavior, or a full incident projection.
