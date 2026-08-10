# Record a human recurrence decision

Use this endpoint to confirm, dismiss, or correct one visible recurrence suggestion. It never merges incidents, changes ownership or SLA state, or makes an autonomous decision.

## Quick path

1. Authenticate with the active session cookie and matching `x-csrf-token`.
2. Read the owning incident version and POST a state, `expectedVersion`, and body `idempotencyKey` to `/api/v1/recurrence-suggestions/{sourceSuggestionId}/decision`.
3. Retain the same key and body until the outcome is known.

## Request rules

| Field | Requirement |
| --- | --- |
| `state` | `confirmed` or `dismissed`; a suggestion is never decided automatically. |
| `expectedVersion` | Current owning-incident version. |
| `idempotencyKey` | Nonblank client key scoped to the authenticated principal and decision operation. |
| `note` | Optional nonblank decision rationale. |
| `correctionReason` | Required when appending a correction after an earlier decision; the immediate predecessor remains retained. |

The server derives the actor, organization, time, source suggestion, matching provenance, and correlation from the request session and database. The actor must be authorized on the owning incident and able to view both incidents. Hidden incidents return `404`; visible incidents without decision authority return `403`.

## Results and recovery

Fresh decisions return `201` with the source suggestion, decision sequence, new incident version, authoritative time, and current request correlation. Confirmations create a traceable relationship only; dismissals create no link. A correction appends the next sequence and predecessor without overwriting history.

| Outcome | Operator action |
| --- | --- |
| `400 validation-failed` | Correct the body or provide the required correction reason. |
| `401 authentication-required` / `403 forbidden` | Restore the active session, CSRF token, or authorized role and scope. |
| `404 not-found` | Do not retry a suggestion outside current visibility. |
| `409 stale-version` | Read current state and intentionally submit a new decision key. |
| `409 idempotency-conflict` | Stop: the same key has a different payload. |
| `503 temporarily-unavailable` | Retry only with the same key and unchanged body. |

An equal replay returns the retained decision before stale-version evaluation. If a COMMIT acknowledgement is indeterminate, retry with the same key; no second decision is appended. Examples are in `openapi/examples/recurrence-decisions/`.

## Boundaries

This surface does not evaluate new candidates, link or merge records autonomously, expand recurrence analysis, change incident lifecycle, alerts, SLA behavior, filters, or PWA workflows. Rollback disables this writer and route while retaining migration 010 and immutable suggestion, decision, link, and event history.
