# Complete accountable incident triage

Triage records deterministic suggestions and explicit human decisions before an open incident can become classified. It never changes category, severity, ownership, or lifecycle state without an authorized human decision.

## Quick path

1. Send `POST /api/v1/incidents/{incidentId}/triage/evaluations` with the current incident version and a body `idempotencyKey`.
2. Read `GET /api/v1/incidents/{incidentId}/triage` to review the current evaluation and any recorded decisions.
3. Send `POST /api/v1/incidents/{incidentId}/triage/decisions` with the evaluation ID, current version, and every required decision.

## Endpoint rules

| Endpoint | Session and CSRF | Success | Purpose |
| --- | --- | --- | --- |
| `POST .../triage/evaluations` | Session cookie and CSRF token | `201` | Record a new deterministic evaluation for an open incident. |
| `GET .../triage` | Session cookie only | `200` | Read the visible, closed triage projection without changing it. |
| `POST .../triage/decisions` | Session cookie and CSRF token | `201` | Append accountable category, severity, and assignee decisions. |

The authenticated session determines the actor, organization, visibility, triage authority, and final assignee eligibility. Request bodies cannot provide audit fields or another actor. Hidden incidents return `404`; visible but unauthorized mutations return `403`.

## Decision rules

An evaluation suggests category, severity, and an eligible assignee, but it does not classify the incident. Confirmed values must equal non-null suggestions and omit a reason. Corrected values must differ from a non-null suggestion and include a nonblank reason. Manual values are allowed only for fields listed in `manualFields` and also require a nonblank reason.

Submit one to three distinct fields. `complete: true` classifies only when category, severity, and one eligible assignee exist across the recorded decision sets. A partial decision is retained, remains `open`, and can be completed by a later decision. The server preserves the evaluation, decision sets, items, action correlation, and current projection.

## Replay and recovery

| Outcome | Operator action |
| --- | --- |
| `400 validation-failed` | Correct the closed request body or the semantic decision. |
| `401 authentication-required` / `403 forbidden` | Restore the active session, CSRF token, role, and scope. |
| `404 not-found` | Do not infer whether the incident exists outside current visibility. |
| `409 stale-version` | Read the current version from the triage retrieval URI and intentionally submit a new action. |
| `409 invalid-transition` | The incident is no longer open; inspect the returned current state. |
| `409 idempotency-conflict` | Stop because the same key describes a different action. |
| `503 temporarily-unavailable` | Retry the unchanged request with the same `idempotencyKey`; an equal replay returns the retained outcome. |

Every HTTP response has a current `correlationId` and `X-Correlation-Id`. Stored `actionCorrelationId` values remain tied to the committed evaluation or decision, including an equal replay.

## Examples

| Scenario | File |
| --- | --- |
| Evaluate an open incident | `evaluate-request.json`, `evaluate-response.json` |
| Read a visible projection | `read-response.json` |
| Complete all three decisions | `decide-request.json`, `decide-response.json` |
| Recover from access or concurrency outcomes | `forbidden-response.json`, `stale-version-response.json`, `invalid-transition-response.json` |

All examples are under `openapi/examples/triage/` and use fixed non-production identifiers.

## Boundaries

This surface does not autonomously decide triage, change later lifecycle states, amend a classification, send alerts, or expand into WU-11+ work. It only publishes and composes the approved evaluation, read, and decision contract.
