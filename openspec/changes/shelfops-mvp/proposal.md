# ShelfOps MVP: Complete Incident Traceability

ShelfOps will give one retail organization a consistent way to turn store exceptions into owned, measurable, and fully traceable incidents across multiple stores. The MVP prioritizes an auditable operational workflow over automation breadth: the system may suggest decisions, but authorized users remain accountable for confirming, correcting, resolving, and reopening incidents.

## Intent

### Problem

Retail exceptions such as out-of-stock shelves, inventory mismatches, misplaced merchandise, price or label inconsistencies, blocked replenishment, and equipment failures are reported through scattered and inconsistent channels. Teams cannot reliably determine who owns an issue, what happened to it, whether its deadline was met, or why it was considered resolved.

### Current-state gap

The current process lacks a shared incident record that connects the initial report to classification, ownership, work, evidence, SLA events, resolution, and any later reopening. This creates unowned incidents, repeated work, weak accountability, inconsistent escalation, and operational reporting that is difficult to explain or trust.

### MVP goal

Deliver **complete incident traceability**: an authorized user can reconstruct an incident from creation through its current state using ShelfOps alone, including responsible actors, timestamps, decisions, evidence, SLA obligations, alerts, and history.

## Target Users and Operational Contexts

| User | Primary context | MVP need |
| --- | --- | --- |
| Store collaborator | Reports or works an issue from a phone or in-store terminal while on the shop floor | Quickly create incidents with evidence and follow incidents relevant to their work and sector |
| Department or sector lead | Coordinates work within a sector | Classify, assign, prioritize, and monitor sector incidents |
| Supervisor | Oversees store operations | Monitor the whole store, resolve ownership gaps, and reopen inadequately resolved incidents |
| Inventory team | Investigates stock-related exceptions across its authorized scope | Trace evidence, ownership, recurrence, and resolution for inventory incidents |
| Technical support / central operations | Supports one or more authorized stores | Work cross-store incidents without gaining organization-wide access by default |

The primary usage moments are issue discovery, shift handoff, triage, assignment, deadline monitoring, resolution, reopening, and operational review.

## Product Outcome

After the MVP, operational teams should be able to:

1. Capture a store exception as a structured incident with category, severity, location or product context when applicable, and supporting evidence.
2. Establish accountable ownership through rule-assisted classification and assignment that a user confirms or corrects.
3. Follow a controlled lifecycle of `open`, `classified`, `in-progress`, `blocked`, and `resolved` while preserving every material transition.
4. Understand applicable deadlines and escalations from a configurable category-by-severity SLA matrix.
5. Resolve incidents with evidence, reopen them under supervisor control, and retain the full history of both actions.
6. Identify possible recurrence without allowing the system to declare recurrence autonomously.
7. Receive relevant alerts in ShelfOps and by email.
8. Use the core workflow from a responsive PWA on phones, in-store terminals, and desktop-sized screens.

## MVP Scope

### Included capabilities

- Users, roles, and authorization scoped to one organization with multiple stores, sectors, and operational locations.
- Simulated stores, sectors, locations, products, and users sufficient to exercise the MVP workflow.
- Incident creation with category, severity, context, and evidence.
- Rule-assisted classification and assignment, including explicit user confirmation or correction.
- Assignee management and the defined incident lifecycle.
- Mandatory, attributable history for lifecycle and decision events.
- Category-by-severity SLA targets and escalation thresholds.
- In-application and email alerts for defined incident and SLA events.
- Evidence-backed resolution by the assigned responsible user and supervisor-controlled reopening.
- Recurrence suggestions based on approved matching inputs, followed by human confirmation or dismissal.
- Operational views or dashboards that expose incident ownership, state, SLA condition, and relevant history within the viewer's scope.
- A documented API that supports the PWA and preserves a path for future clients.
- Tests for business rules, authorization boundaries, and lifecycle transitions once the implementation stack and test runner are selected.

### Explicit non-goals

- Supporting multiple independent retail organizations or providing a general multi-tenant product model.
- Delivering a separate native mobile application in the MVP.
- Autonomous or probabilistic classification, assignment, recurrence confirmation, resolution, or reopening.
- Replacing human accountability with system-generated decisions.
- Selecting a detailed application stack or deployment architecture during the proposal phase.
- Expanding into inventory planning, replenishment execution, point-of-sale, or equipment-management systems beyond incident context and traceability.

## Approved Business Rules

| Area | Rule |
| --- | --- |
| Organization boundary | The MVP serves one retail organization containing multiple stores. Every operational record belongs to an organizational scope. |
| Rule-assisted triage | Classification and assignment suggestions are deterministic and explainable. An authorized user must confirm or correct each suggestion; suggestions never become unreviewed final decisions. |
| Hierarchical visibility | Collaborators can see their own incidents and incidents in their sector; sector leads can see their sector; supervisors can see their store; central operations teams can span only their authorized stores. Role and organizational scope are both required. |
| Resolution | The assigned responsible user may resolve an incident directly only after providing mandatory resolution evidence. The action, actor, timestamp, and evidence remain traceable. |
| Reopening | A supervisor may reopen a resolved incident. Reopening must preserve the prior resolution and add a new attributable lifecycle event rather than erase history. |
| Recurrence | The system may suggest recurrence using store, location, product, category, and a configurable time window. A user must confirm or dismiss the suggestion. |
| SLA | Targets and escalation thresholds come from a configurable category-by-severity matrix. The incident must expose its applicable obligation and resulting SLA events. |
| Alerts | Relevant alerts are delivered through an in-application notification center and email. Delivery and read state must be traceable where applicable. |
| Client strategy | The first client is a responsive PWA optimized for phones and in-store terminals while remaining usable on larger screens. |
| Evolution path | Core capabilities are exposed through a documented API suitable for later native or integrated clients without making those clients part of the MVP. |

## Proposal-Level Acceptance Boundaries

The MVP is acceptable at the product-proposal level when all of the following can be demonstrated with representative simulated stores and users:

- Every incident has a single traceable record containing its current category, severity, state, ownership, applicable SLA, and complete material history.
- Every classification or assignment suggestion records whether an authorized user confirmed or corrected it.
- Every lifecycle transition records the actor and timestamp; transitions requiring evidence cannot complete without it.
- Every resolved incident has attributable resolution evidence, and a supervisor can reopen it without losing the prior resolution record.
- Every recurrence suggestion is attributable to the configured matching rule and records a human confirmation or dismissal.
- Users can access only incidents allowed by both their role and organizational scope, including cross-store restrictions for central teams.
- Configured alert events appear in the in-application notification center and trigger email delivery with traceable delivery state.
- The core create, triage, assign, work, resolve, reopen, and review journeys are usable on supported phone and in-store-terminal layouts.
- The documented API supports the same core workflow and business constraints as the PWA.
- Automated tests cover the approved business rules, authorization boundaries, and valid and invalid lifecycle transitions.

Operational adoption targets, response-time targets, notification delivery objectives, and pilot volumes require baselines and will be quantified in the specification or pilot plan; they are not silently assumed by this proposal.

## Affected Areas

| Area | Expected impact |
| --- | --- |
| Store operations | A shared workflow replaces or consolidates ad hoc reporting and handoff practices for MVP incident categories. |
| Roles and permissions | Access decisions must combine role, organization, store, and sector scope. |
| Incident data | Incidents require durable identity, ownership, evidence, SLA state, recurrence decisions, and append-oriented history. |
| User experience | Shop-floor actions must remain efficient on phones and terminals while supervisory review must scale to wider screens. |
| Notifications | In-app state and email delivery introduce traceability, delivery-failure, and alert-volume concerns. |
| Operational governance | Categories, severities, SLA rules, recurrence windows, and authorized scopes need accountable configuration. |
| API | Business rules must be enforced consistently across the PWA and future clients rather than only in a user interface. |
| Support and reporting | Support teams need enough history to explain access, assignment, escalation, resolution, reopening, and notification outcomes. |

## Risks and Mitigations

| Risk | Product impact | Proposal direction |
| --- | --- | --- |
| Traceability becomes an activity log that is too noisy to use | Users cannot reconstruct decisions despite retaining events | Define material audit events and reviewer-friendly history views in specification and design |
| Hierarchical permissions are underspecified | Users may see restricted incidents or be unable to do their jobs | Specify an explicit role-and-scope authorization matrix and test denied as well as allowed paths |
| Mandatory evidence slows urgent work | Users may avoid or delay resolution | Keep evidence requirements configurable by policy where appropriate, while never allowing evidence-free resolution in the approved MVP rule |
| Rule suggestions are mistaken for automated decisions | Accountability becomes ambiguous | Make confirmation or correction explicit and preserve both the suggestion and the human outcome |
| SLA or alert configuration creates excessive noise | Teams ignore escalations and email | Define event eligibility, recipients, deduplication, and escalation behavior before implementation |
| Recurrence matching produces false associations | Users lose trust or merge unrelated operational issues | Keep recurrence advisory, explain its matching basis, and require human confirmation |
| Weak in-store connectivity disrupts shop-floor workflows | Reports or evidence may be lost or duplicated | Decide degraded-connectivity behavior and user feedback before finalizing client design |
| API-oriented scope expands into premature platform work | MVP delivery slows without improving traceability | Limit the first API to capabilities required by the PWA and approved business workflow |

## Rollback and Containment

This is a greenfield MVP with no production migration to reverse. During pilot rollout, ShelfOps must not become the only operational record until the organization accepts its traceability and reliability. If the pilot must be stopped:

1. Stop creating new incidents in ShelfOps and return teams to the prior reporting process.
2. Preserve and export existing incident history, evidence references, ownership, SLA events, and notification records for operational continuity and audit needs.
3. Disable outbound alerts to prevent stale email while keeping stored records available to authorized reviewers.
4. Resume only after correcting the failed product rule or workflow and validating affected records.

Detailed retention, export, and recovery mechanisms belong in specification and design.

## Decisions Deferred to Specification or Design

The following decisions remain open because resolving them requires detailed product rules or technical analysis, not proposal-level assumptions:

- The initial incident category and severity catalog, required fields per category, and who may configure them.
- The SLA matrix values, business calendar behavior, pause rules for `blocked` incidents, escalation recipients, and treatment after reopening.
- The complete permission matrix for creating, viewing, assigning, transitioning, resolving, reopening, and configuring records.
- Resolution evidence types, size and format constraints, retention, correction, and access policies.
- Exact recurrence matching behavior, default and allowed time windows, explainability, and consequences of confirmation or dismissal.
- Alert event matrix, recipient rules, deduplication, retries, failure visibility, read state, and acknowledgment expectations.
- History immutability and correction semantics, including which events are material enough to retain and display.
- Expected behavior under slow, interrupted, or offline connectivity and protection against duplicate submissions.
- Dashboard measures, operational baselines, pilot volumes, and numeric success targets beyond complete record coverage.
- API authentication, versioning, consistency, error, and idempotency contracts.
- Detailed application stack, deployment topology, test runner, and implementation architecture.

## Success Criteria

The proposal succeeds when the subsequent specification and design can define a buildable MVP without weakening these boundaries:

- Complete incident traceability is the primary product outcome.
- Human accountability remains explicit for triage, recurrence, resolution, and reopening.
- Authorization always combines role and organizational scope.
- SLA and alert behavior is configurable, measurable, and attributable.
- The responsive PWA is the first client, and API contracts preserve later client evolution.
- Multi-organization tenancy, native applications, and autonomous decision-making remain outside the MVP.
