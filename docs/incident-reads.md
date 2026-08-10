# Read authoritative incident conditions safely

Use the incident read endpoints to retrieve only incidents visible to the authenticated session. The read surface supports authoritative SLA and recurrence-decision filters alongside the incident fields.

## Quick path

1. Send `GET /api/v1/incidents` with the session cookie and any supported filters.
2. Follow `nextCursor` only with the same filters and authenticated subject.
3. Use `GET /api/v1/incidents/{incidentId}` for a known visible identifier.

## Supported filters

| Filter | Meaning |
| --- | --- |
| `storeId`, `sectorId`, `locationId` | Exact hierarchy identifiers. |
| `category`, `severity`, `state` | Exact current classification and lifecycle values. |
| `assigneeId`, `reporterId` | Exact current ownership or reporter identifiers. |
| `slaCondition` | Exact current SLA condition: `on-track`, `warning`, `breached`, or `paused`. |
| `recurrenceDecisionState` | At least one owned suggestion in `pending`, `confirmed`, or `dismissed` state. |
| `createdFrom`, `createdTo` | Inclusive creation-time range in UTC. |
| `updatedFrom`, `updatedTo` | Inclusive update-time range in UTC. |

The fixed order is newest `updatedAt` first, then incident ID ascending. Limits are 1–200 (default 50). Cursors are opaque and bound to the same subject, filters, and fixed order; changing any of them returns `400 validation-failed`.

## Scope and safe outcomes

Visibility is evaluated in SQL before filter predicates. An explicit hierarchy filter outside the caller's visibility returns an empty authorized list, never counts or matching values from another scope. Role permission and scope are both required: an otherwise allowed role cannot use an out-of-scope filter, and an in-scope filter cannot broaden a role-limited category. A hidden or absent detail identifier returns `404 not-found` with no incident metadata. An explicit visible-resource policy denial returns `403 forbidden`; read visibility itself is never broadened by client input.

Unknown filters, malformed timestamps, and reversed ranges return `400 validation-failed`. Public responses and cursors do not disclose internal authorization dimensions.

## Authoritative filter semantics

`slaCondition` is read from the incident's current SLA cycle and active segment. The server uses the persisted SLA condition and its authoritative deadline context; clients cannot calculate or supply an SLA value.

`recurrenceDecisionState` is an existential filter over normalized current suggestion states. An incident with separate pending and confirmed suggestions matches either filter independently. There is no incident-level precedence, and generic history events never establish recurrence state. Incidents with no matching suggestion do not appear.

## Four read outcomes

| Scenario | Example | Safe outcome |
| --- | --- | --- |
| Allowed combined | `allowed-combined.json` | An authorized combined filter returns matching visible rows. |
| Denied out of scope | `denied-out-of-scope.json` | A supported out-of-scope filter returns an empty authorized list. |
| Hidden detail | `hidden-detail.json` | Hidden and absent identifiers remain indistinguishable with `404 not-found`. |
| Validation failure | `validation-failed.json` | An invalid SLA or recurrence state returns the stable `400 validation-failed` envelope. |
