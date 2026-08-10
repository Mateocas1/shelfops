# Operational Views Specification

## Purpose

Define authorization-safe dashboards, explainable metrics, and responsive PWA journeys that remain understandable under slow, interrupted, or offline connectivity.

## Requirements

### Requirement: Scope-safe operational views

The system MUST provide operational views for incidents visible to the current user and MUST apply the same authorization rules to rows, totals, groupings, filters, search suggestions, exports, and drill-downs. A view MUST NOT reveal counts or dimensions from unauthorized stores, sectors, categories, or incidents. The active scope and filter state MUST be visible to the user.

#### Scenario: Supervisor store view

- GIVEN a supervisor is assigned Store A only
- WHEN the supervisor opens the operational dashboard
- THEN all metrics and incident rows MUST be calculated from visible Store A incidents only
- AND no Store B counts or filter suggestions MUST be exposed

#### Scenario: Central multi-store view

- GIVEN a central user is authorized for Stores A and B for equipment incidents
- WHEN the user groups incidents by store
- THEN only authorized equipment incidents from Stores A and B MUST contribute to the view

### Requirement: Incident work queues

Users MUST be able to view and filter authorized incidents by store, sector, location, category, severity, lifecycle state, current assignee, reporter, SLA condition, recurrence-decision state, and created or updated time range. The default work queue MUST prioritize breached, warning, critical, unassigned, and blocked incidents before other incidents while preserving a deterministic tie-breaker. Users MUST be able to distinguish incidents requiring their action from incidents visible for awareness.

#### Scenario: Find ownership gaps

- GIVEN visible open incidents lack completed assignment
- WHEN an authorized lead filters for unassigned incidents
- THEN the view MUST show only matching incidents within scope
- AND each row MUST expose state, severity, location, age, and current SLA condition

#### Scenario: Stable ordering

- GIVEN multiple incidents have the same priority and update time
- WHEN the queue is loaded repeatedly without data changes
- THEN their order MUST remain deterministic by stable incident identifier

### Requirement: Dashboard measures have explicit definitions

The MVP dashboard MUST provide, within authorization scope:

- current incident count by lifecycle state, category, severity, store, sector, and assignee;
- unassigned open incident count;
- on-track, warning, breached, and paused current SLA counts;
- incident age from initial creation to the current time or final resolution;
- resolution duration per SLA cycle from cycle start to resolution, excluding paused time only when the applied rule paused it;
- percentage of resolved SLA cycles met versus breached for the selected period;
- blocked incident count and accumulated blocked duration;
- reopened incident count and reopen rate, defined as incidents reopened in the period divided by incidents first resolved in the period;
- recurrence suggestions pending, confirmed, and dismissed.

Every metric MUST expose its time range, scope, filters, definition, last-refreshed time, and whether reopened cycles are counted per incident or per cycle. Empty sets MUST display as no data rather than a misleading zero rate.

#### Scenario: Calculate SLA attainment

- GIVEN ten resolved SLA cycles are in the authorized scope and selected period
- AND eight met their deadlines while two breached
- WHEN the metric is displayed
- THEN SLA attainment MUST be 80 percent
- AND the denominator of ten cycles MUST be disclosed

#### Scenario: Empty rate

- GIVEN no incidents were first resolved in the selected period
- WHEN reopen rate is requested
- THEN the system MUST display no data
- AND MUST NOT display zero percent as if it were measured

### Requirement: Metrics preserve historical truth

Dashboard measures MUST derive from retained incident and SLA events. Later category amendments, reassignments, correction events, or reopening MUST NOT erase historical counts that were valid for their event time. The view MUST disclose whether it groups by current values or event-time values; the safe MVP default MUST use current values for current-work queues and event-time snapshots for historical performance.

#### Scenario: Severity amendment after breach

- GIVEN an incident breached while classified as high and was later amended to medium
- WHEN historical breaches are grouped by event-time severity
- THEN the breach MUST remain counted under high

### Requirement: Traceability-first incident detail

An authorized incident detail view MUST show current category, severity, state, owner, context, applicable SLA condition and deadline, pending user actions, evidence, recurrence relationships, alerts, and material history. It MUST visually distinguish system suggestions from human confirmations or corrections and prior SLA or resolution cycles from the current cycle. History MUST support filtering by event type without changing the underlying record.

#### Scenario: Review a reopened incident

- GIVEN an incident was resolved and reopened
- WHEN an authorized supervisor views its detail
- THEN the prior resolution evidence and SLA outcome MUST be distinguishable from the current open cycle
- AND the supervisor MUST be able to identify the reopen reason and actor

### Requirement: Responsive PWA journeys

The PWA MUST support create, triage, assign, start, block, resume, resolve, reopen, notification review, dashboard review, and incident-history review on supported phone, in-store-terminal, and desktop-sized layouts. Core actions MUST not require horizontal page scrolling at supported widths. Primary action labels, state, validation errors, pending submission state, and destructive or irreversible consequences MUST remain visible and understandable without relying on pointer hover.

The safe MVP supported viewport baseline MUST be widths from 360 CSS pixels through desktop widths. In-store-terminal operation MUST support touch interaction and keyboard operation. Wider layouts MAY expose additional columns but MUST preserve the same business actions and authorization.

#### Scenario: Create on a phone layout

- GIVEN a 360 CSS-pixel-wide supported viewport
- WHEN a collaborator creates an incident with evidence
- THEN all required fields and errors MUST be usable without horizontal page scrolling
- AND the user MUST be able to review scope and submission state

#### Scenario: Triage on an in-store terminal

- GIVEN a sector lead uses a touch-enabled terminal
- WHEN triage suggestions are presented
- THEN the lead MUST be able to inspect the explanation, confirm or correct each decision, and submit without a hover-only control

### Requirement: Efficient shop-floor data entry

Incident creation SHOULD minimize repeated entry by defaulting the reporter's assigned store and sector when unambiguous, while requiring the user to review them before submission. Recently used valid locations and products MAY be suggested within the current scope. Defaults and suggestions MUST NOT bypass validation or silently choose a category, severity, or final assignee.

#### Scenario: Ambiguous reporter scope

- GIVEN a reporter has access to more than one store or sector
- WHEN the creation journey begins
- THEN the system MUST require an explicit store and sector selection
- AND MUST NOT infer scope from a previous unrelated incident without showing it

### Requirement: Degraded connectivity states

The PWA MUST distinguish `online`, `slow or submitting`, and `offline` states. While offline, users MUST be able to review a locally available unsent draft but MUST NOT be shown a server incident identifier or success state. The safe MVP behavior MUST not promise access to previously viewed incidents while offline. A submission interrupted before acknowledgment MUST remain `pending` and MUST be retried only with the same idempotency identity. Users MUST receive a clear result when connectivity returns: accepted once, still pending, validation failed, authorization failed, or conflicted.

#### Scenario: Submit while offline

- GIVEN a user completed an incident form and connectivity is unavailable
- WHEN the user attempts submission
- THEN the PWA MUST retain the unsent draft on that device
- AND MUST show it as not yet reported
- AND MUST NOT fabricate an incident identifier or success confirmation

#### Scenario: Connection drops after send

- GIVEN a submission was sent but acknowledgment was not received
- WHEN the client retries after connectivity returns
- THEN it MUST use the same idempotency identity
- AND the user MUST end with either the original single accepted incident or an explicit unresolved status

### Requirement: Draft behavior and privacy

The safe MVP default MUST preserve an unsent incident draft on the current device for up to 24 hours or until the user submits or discards it. Evidence that cannot be safely retained under client or device policy MUST be clearly marked for reattachment rather than falsely shown as preserved. Drafts MUST not synchronize across devices in the MVP. Users MUST be able to discard a draft. Shared-terminal sign-out MUST remove or make inaccessible the prior user's drafts.

#### Scenario: Shared terminal sign-out

- GIVEN a collaborator has an unsent draft on a shared terminal
- WHEN that user signs out
- THEN a later user MUST NOT be able to view or submit the prior user's draft

#### Scenario: Draft expires

- GIVEN an unsent draft exceeds the configured 24-hour safe default
- WHEN the user returns
- THEN the system MUST not submit it automatically
- AND MUST explain that the draft expired if the client can identify the expiration

### Requirement: Duplicate-submission protection

The create, triage, assignment, transition, evidence, recurrence-decision, and notification-read journeys MUST prevent accidental duplicate action from repeated taps, refreshes, retries, or delayed responses. Controls SHOULD be temporarily disabled while an action is pending, but client behavior MUST not be the only protection. A repeated acknowledged action MUST display the original outcome rather than append duplicate history or alerts.

#### Scenario: Repeated resolve tap

- GIVEN the assignee taps resolve twice while the first action is pending
- WHEN both requests reach the system
- THEN at most one resolution transition and one material resolution event MUST exist
- AND the user MUST see the authoritative resolved outcome

### Requirement: Conflict and validation recovery

When a mutation fails validation, the PWA MUST preserve non-sensitive user input and identify correctable fields. When it fails because the incident changed concurrently, the PWA MUST show the current state, identify that the attempted action was not applied, and require intentional review before retry. Authorization failures MUST not be presented as successful or indefinitely pending.

#### Scenario: Stale blocked action

- GIVEN an assignee opened an in-progress incident that another user has since reassigned
- WHEN the former assignee submits a block action
- THEN the PWA MUST state that the action was not applied because the incident changed
- AND MUST present the current authorized state or a not-found outcome if access was lost

### Requirement: Notification center

The PWA MUST provide an in-app notification center showing the current user's authorized notifications, unread count, event type, incident reference, creation time, and read state. It MUST support marking one or multiple owned notifications read without marking the underlying incident action complete. If incident access has been removed, the notification MUST not continue to expose restricted incident content.

#### Scenario: Read does not acknowledge work

- GIVEN an assignee marks an assignment notification read
- WHEN the notification state changes
- THEN the incident MUST remain `classified`
- AND work MUST not become `in-progress` until the assignee explicitly starts it

### Requirement: Pilot measurement without invented targets

The system MUST collect enough attributable event data to establish pilot volumes, workflow completion, SLA attainment, reopening, alert delivery, and degraded-connectivity outcomes. It MUST NOT label an operational adoption, response-time, email-delivery, or volume target as successful until an authorized pilot plan defines the target and measurement period.

#### Scenario: Display a measured baseline

- GIVEN the pilot has recorded one week of events but no approved target
- WHEN metrics are reviewed
- THEN the system MAY show observed values
- AND MUST NOT display pass or fail against an invented target

## Open Product Questions

- Pilot owners must approve target device/browser combinations beyond the 360 CSS-pixel responsive baseline before acceptance testing.
- Expected incident volume, dashboard refresh expectations, and quantitative adoption or response-time targets require pilot baselines and remain unresolved.
- Device policy must confirm whether attachment content may be retained in local drafts; the safe behavior is to require reattachment when retention cannot be guaranteed.
- Fully offline access to previously synchronized incidents and autonomous background synchronization are outside the safe MVP default and require a future product decision.
