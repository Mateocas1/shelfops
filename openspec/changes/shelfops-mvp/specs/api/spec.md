# API Specification

## Purpose

Define a documented, client-neutral API for the approved PWA workflow with the same authorization, validation, concurrency, traceability, and duplicate-protection guarantees as every other client.

## Requirements

### Requirement: Documented MVP capability surface

The system MUST publish an API contract for authentication context; current-user scope; reference-data reads; incident creation and retrieval; triage suggestions and decisions; assignment; lifecycle transitions; evidence metadata and transfer; recurrence suggestions and decisions; SLA state; material history; notifications and read state; operational views; and authorized configuration used by the PWA. The contract MUST describe request and response fields, required and conditional fields, enums, validation, authorization, idempotency, concurrency, pagination, filters, ordering, error shapes, and representative allowed and denied examples. Undocumented behavior MUST NOT be required for the PWA's core workflow.

#### Scenario: Implement the PWA from the contract

- GIVEN an authorized client uses only the published MVP API contract
- WHEN it performs create, triage, assign, work, resolve, reopen, notification, and review journeys
- THEN every approved journey MUST be available without private business-rule bypasses

#### Scenario: Exclude external retail integration scope

- GIVEN the API supports product and incident context
- WHEN the contract is reviewed
- THEN it MUST NOT promise inventory planning, replenishment execution, point-of-sale synchronization, equipment management, or external retail-system integration

### Requirement: Versioned compatibility contract

Every API request MUST target a documented major contract version. Within a major version, additive optional fields MAY be introduced, but existing field meanings, authorization requirements, lifecycle semantics, and error codes MUST NOT change incompatibly. An incompatible contract change MUST use a new major version and MUST document migration and support policy before clients are required to adopt it.

#### Scenario: Add an optional response field

- GIVEN an existing client uses the current major version
- WHEN a new optional response field is introduced
- THEN the existing client MUST remain able to complete the same workflow

#### Scenario: Change lifecycle semantics

- GIVEN a proposed API change would allow a previously invalid transition
- WHEN compatibility is assessed
- THEN it MUST NOT be introduced silently within the current major version
- AND the underlying product specification MUST be approved before any new contract version

### Requirement: Authenticated principal and authoritative scope

Every protected API operation MUST require an authenticated active principal. The system MUST derive user identity, roles, store and sector scopes, category responsibilities, and explicit grants from authoritative records. A client MUST NOT be allowed to assert another actor, organization, role, scope, or audit timestamp. The API authentication mechanism and credential lifecycle MUST be documented before pilot use, without granting broader rights to API clients than to the PWA.

#### Scenario: Client supplies another actor

- GIVEN User A is authenticated
- WHEN the request payload attempts to record User B as the transition actor
- THEN the API MUST reject or ignore the supplied actor field
- AND any accepted event MUST identify User A

#### Scenario: Inactive principal

- GIVEN a previously authenticated user has been deactivated
- WHEN the user makes a protected request
- THEN the API MUST reject authentication or authorization
- AND MUST make no business change

### Requirement: Authorization parity across clients

The API MUST enforce the complete role-and-scope matrix on every read and mutation, regardless of client type. Collection results, dashboard aggregates, filter values, history, evidence, notification content, and exports MUST contain only authorized records. An out-of-scope record identifier MUST return a not-found outcome; a forbidden action on a visible record MUST return a forbidden outcome.

#### Scenario: Direct API call cannot bypass the PWA

- GIVEN a collaborator cannot assign an incident in the PWA
- WHEN the collaborator calls the assignment API directly
- THEN the API MUST deny the action
- AND MUST create no ownership, history, SLA, or alert side effect

#### Scenario: Scoped collection

- GIVEN a supervisor is authorized for Store A only
- WHEN the supervisor requests incidents without a store filter
- THEN the API MUST return Store A incidents only
- AND MUST not reveal that Store B records were omitted

### Requirement: Consistent input validation

The API MUST validate required fields, data types, enum values, lengths, evidence constraints, reference status, hierarchy consistency, timestamps, assignment eligibility, lifecycle preconditions, category policy, and configuration bounds before committing a business action. Validation MUST be consistent with the PWA. A rejected request MUST be atomic and MUST identify correctable fields using stable machine-readable codes plus human-readable messages.

#### Scenario: Multiple invalid fields

- GIVEN an incident request has a blank title, inactive product, and location outside the sector
- WHEN validation runs
- THEN the API SHOULD report all safely detectable field errors in one response
- AND MUST create no partial incident or evidence association

#### Scenario: Invalid enum

- GIVEN a request contains an undocumented lifecycle state
- WHEN submitted
- THEN the API MUST return a validation error
- AND MUST NOT coerce it to a valid state

### Requirement: Atomic business actions

Each API mutation representing one business action MUST either complete all required state, history, SLA, recurrence, and notification-record effects or complete none of them. External email delivery MAY occur asynchronously after the business action, but creation of its eligible delivery record MUST be attributable to the committed event. Failure to deliver email MUST NOT roll back a committed incident action.

#### Scenario: Resolution history cannot be saved

- GIVEN an otherwise valid resolution request
- WHEN the required material history cannot be recorded
- THEN the API MUST fail the resolution atomically
- AND the incident MUST remain in progress

### Requirement: Idempotent mutation contract

Incident creation and every action that can append evidence, a decision, assignment, lifecycle event, recurrence outcome, configuration change, or notification-state change MUST accept a client-generated idempotency key. The key's scope MUST include authenticated principal, major API version, operation, and target when applicable. The safe MVP retention MUST be at least 24 hours.

A repeat with the same key and semantically equivalent payload MUST return the original committed outcome without duplicating business effects. Reusing the same key with a materially different payload MUST return a conflict. A request whose outcome is still unknown MUST return a pending or recoverable outcome rather than execute a second logical action.

#### Scenario: Retry incident creation

- GIVEN an incident was created but the client did not receive the response
- WHEN it repeats the equivalent request with the same idempotency key
- THEN the API MUST return the original incident outcome
- AND exactly one incident and creation event MUST exist

#### Scenario: Reuse key with changed payload

- GIVEN an idempotency key was used to block an incident for one reason
- WHEN the same key is reused with a different reason
- THEN the API MUST return a conflict
- AND MUST NOT append a second block action

### Requirement: Optimistic concurrency contract

Every mutable incident and configuration representation MUST expose a version token. Mutations MUST require the version on which the decision was based. If it is not current, the API MUST return a conflict with a stable `stale-version` code and the current version or retrieval reference. A stale request MUST produce no partial side effects. Idempotent replay of an already committed identical action MUST return the original outcome before being mistaken for a new stale mutation.

#### Scenario: Stale transition

- GIVEN an assignee read version 7 and another action created version 8
- WHEN the assignee submits a transition based on version 7
- THEN the API MUST return `stale-version`
- AND MUST not append the attempted transition

### Requirement: Pagination and deterministic ordering

Every potentially unbounded collection MUST be paginated. The safe MVP default page size MUST be 50 and maximum MUST be 200, both documented and configurable within safe service limits. Pagination MUST use an opaque continuation value or equivalent stable mechanism and a deterministic ordering with a unique tie-breaker. The response MUST identify whether more results are available. Invalid or expired continuation values MUST return a stable client error rather than silently restarting at the first page.

#### Scenario: Traverse incident pages

- GIVEN more incidents match than the selected page size
- WHEN a client follows continuation values without changing filters or ordering
- THEN it MUST be able to traverse the matching authorized result set without duplicates caused by tied sort values

#### Scenario: Page size exceeds maximum

- GIVEN the documented maximum is 200
- WHEN a client requests 500 records
- THEN the API MUST reject or clamp the request exactly as documented
- AND MUST disclose the applied limit

### Requirement: Filtering and sorting

Incident collections MUST support authorized filtering by store, sector, location, category, severity, state, assignee, reporter, SLA condition, recurrence-decision state, and created or updated time range. Supported sort fields and default order MUST be documented. Invalid filters MUST return validation errors. Filters MUST not be used to infer unauthorized values; unauthorized explicit scope filters MUST produce an empty or not-found-safe outcome as documented, never restricted counts.

#### Scenario: Combine filters

- GIVEN a lead can view Sector A
- WHEN the lead filters for high-severity blocked incidents with breached SLAs
- THEN every returned incident MUST satisfy all filters and authorization

### Requirement: Stable error envelope

API errors MUST use a documented envelope containing a stable machine-readable code, safe human-readable message, correlation identifier, and field details when applicable. The MVP MUST distinguish at least:

| Outcome | Required meaning |
| --- | --- |
| `400 validation-failed` | Malformed or semantically invalid input |
| `401 authentication-required` | Missing, invalid, or inactive authentication |
| `403 forbidden` | Record is visible but action is not allowed |
| `404 not-found` | Record absent or hidden by visibility scope |
| `409 stale-version` | Mutation based on an outdated version |
| `409 idempotency-conflict` | Key reused for a different logical request |
| `409 invalid-transition` | Requested state change is not allowed from current state |
| `413 evidence-too-large` | Evidence exceeds a documented limit |
| `415 evidence-type-unsupported` | Evidence type is not permitted |
| `429 rate-limited` | Client must wait before retrying, with retry guidance where available |
| `503 temporarily-unavailable` | Service cannot currently decide or commit safely |

Errors MUST not expose secrets, internal stack details, unauthorized record content, or email-delivery credentials. Retryable outcomes MUST be distinguished from permanent validation or authorization failures.

#### Scenario: Invalid lifecycle transition

- GIVEN an incident is blocked
- WHEN the API receives a direct resolve request
- THEN it MUST return `409 invalid-transition`
- AND MUST identify the current state without applying the resolution

#### Scenario: Hidden incident

- GIVEN an incident exists outside the caller's scope
- WHEN requested by identifier
- THEN the API MUST return `404 not-found`
- AND MUST not reveal the target store or incident state

### Requirement: History and evidence API integrity

History MUST be exposed as read-only material events in deterministic order. The API MUST NOT expose update or delete operations for material history events. Evidence operations MUST preserve uploader and authoritative timestamps, enforce incident visibility, and use append-and-supersede correction semantics. Download or transfer references MUST be scoped and MUST not outlive the caller's authorization without revalidation.

#### Scenario: Attempt history mutation

- GIVEN a client has an event identifier
- WHEN it attempts to update or delete that event
- THEN the API MUST reject the operation as unsupported or forbidden

### Requirement: Notification API behavior

The API MUST expose only the authenticated user's notifications and unread count. It MUST support idempotent read and unread changes by the recipient. Notification read state MUST not acknowledge, transition, assign, or otherwise modify the incident. If the recipient no longer has incident visibility, notification content MUST be redacted or made unavailable consistently with authorization policy.

#### Scenario: Mark notification read twice

- GIVEN a notification is already read
- WHEN its recipient repeats the same read action with the same or a new idempotency key
- THEN the notification MUST remain read
- AND no duplicate incident or notification history effect MUST occur

### Requirement: Configuration and observability contract

Authorized configuration operations MUST validate completeness, effective time, version, and scope before activation. API responses for committed mutations MUST include a correlation identifier that can be connected to material history and delivery records by authorized support users. Correlation identifiers MUST not reveal secrets or broaden record access.

#### Scenario: Trace an assignment action

- GIVEN an assignment API action succeeds
- WHEN authorized support investigates its correlation identifier
- THEN the assignment event and eligible notification delivery records MUST be traceable to that action

### Requirement: Safe temporary failure behavior

When the system cannot determine whether a mutation is safe to commit, it MUST fail closed rather than accept an unvalidated or unauthorized action. A temporary failure response MUST preserve idempotent retry semantics and MUST not tell the client to generate a new key for the same logical action. Read failures MUST not be represented as empty authorized results unless the system positively evaluated the query.

#### Scenario: Authorization dependency is unavailable

- GIVEN authoritative scope cannot be evaluated
- WHEN a protected mutation is requested
- THEN the API MUST return a temporary unavailable outcome
- AND MUST not execute the mutation under assumed permissions

## Open Product Questions

- The concrete authentication protocol, credential duration, and credential-revocation mechanism require design and security review before pilot use; the behavioral requirement remains an authenticated active principal with authoritative scope.
- The support lifetime and deprecation window for an API major version require a client-ownership decision before a second client exists.
- Rate limits and service-level response targets require pilot volume baselines; clients MUST receive documented retry semantics even before numeric objectives are approved.
- External client registration, public developer access, webhooks, and retail-system integrations are outside the MVP.
