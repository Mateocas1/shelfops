# Configure a future-effective SLA policy

Use this endpoint only to publish a complete replacement matrix for future incident cycles. Existing incident snapshots and cycles remain unchanged.

## Quick path

1. Read the latest policy version and prepare every active category-by-severity cell.
2. Authenticate as a scoped `central-operations` principal with the `configure-store-policy` grant, then send its opaque session cookie and matching `x-csrf-token`.
3. POST the matrix to `/api/v1/sla-policy` with a new body `idempotencyKey` and an `effectiveAt` later than the server time.

## Request rules

| Field | Requirement |
| --- | --- |
| `expectedVersion` | Current positive policy version. |
| `effectiveAt` | A future RFC 3339 instant. |
| `rules` | Exactly one positive warning/deadline pair for every active category and severity. The deadline must follow the warning. |
| `idempotencyKey` | A nonblank body key. Retain the unchanged body until its result is known. |

The server derives the actor and organization from the active session. Client actor, organization, version-result, and correlation claims are rejected.

## Results and recovery

A fresh configuration returns `201` with its policy version and `effectiveAt`. The response body and `x-correlation-id` contain the current request correlation identifier, including an equal replay.

| Outcome | Operator action |
| --- | --- |
| `400 validation-failed` | Correct the matrix; incomplete, duplicate, nonpositive, expired, and unknown cells are rejected without writes. |
| `401 authentication-required` / `403 forbidden` | Restore the session, CSRF token, or explicit central authority. |
| `409 stale-version` | Read the latest policy version, reconcile the matrix, and submit a new key. |
| `409 idempotency-conflict` | Stop: the key belongs to a different request body. |
| `503 temporarily-unavailable` | Retry only with the same `idempotencyKey` and unchanged body. |

Equivalent retry returns the stored policy version without another policy row. A new accepted policy applies only to future cycles after its effective instant; it never rewrites existing snapshots, cycles, or segments.

## Boundaries

This surface does not schedule warnings, deliver alerts or email, transition incidents, change triage or recurrence, or alter read filters. Representative allowed, denied, validation, stale-version, and conflict responses are in `openapi/examples/sla-configuration/`.
