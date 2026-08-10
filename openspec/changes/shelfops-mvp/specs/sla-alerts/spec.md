# SLA and Alerts Specification

## Purpose

Define measurable category-by-severity obligations, blocked and reopen semantics, escalation, and traceable in-application and email alerts without creating unaccountable noise.

## Requirements

### Requirement: Versioned category-by-severity SLA matrix

Every active category and severity combination MUST map to exactly one active SLA rule. Each rule MUST define a response target, one or more warning thresholds or an explicit no-warning policy, breach behavior, blocked-time policy, clock mode, effective time, and escalation recipient policy. Incidents MUST snapshot the applied rule version for every SLA cycle. Configuration changes MUST apply prospectively and MUST NOT silently rewrite obligations or events already applied to incidents.

The safe MVP seed matrix MUST use continuous elapsed time, MUST not pause while blocked, MUST issue one warning and one breach escalation, and MUST use these targets for every initial category unless an authorized configurator replaces a matrix cell:

| Severity | Warning after cycle start | Deadline after cycle start |
| --- | ---: | ---: |
| `low` | 48 hours | 72 hours |
| `medium` | 16 hours | 24 hours |
| `high` | 4 hours | 8 hours |
| `critical` | 1 hour | 2 hours |

These values are safe pilot defaults, not universal operational commitments.

#### Scenario: Resolve a matrix cell

- GIVEN an incident is confirmed as `equipment-failure` and `high`
- WHEN its SLA obligation is calculated
- THEN the system MUST use the active `equipment-failure` by `high` matrix cell
- AND MUST expose its rule version, warning time, deadline, and blocked policy

#### Scenario: Reject an incomplete active matrix

- GIVEN an active category has four active severities
- WHEN a configurator attempts to activate policy without all four category-by-severity cells
- THEN the system MUST reject activation
- AND existing active policy MUST remain in effect

### Requirement: Authoritative SLA cycle timing

The first SLA cycle MUST start at authoritative incident creation time. A reopened incident MUST start a new attributable cycle at authoritative reopen time, using the active matrix rule for the retained provisional category and severity. The MVP clock mode MUST be continuous elapsed time in UTC for calculation and MUST display times in the viewer's configured store timezone where available. Optional business-hours calendars are not required for the MVP and MUST NOT be implied by display timezone. Clock or timezone changes MUST NOT alter elapsed deadlines.

#### Scenario: Calculate a medium deadline

- GIVEN a new incident applies the safe default `medium` rule
- WHEN it is created at 10:00 UTC
- THEN its warning MUST be due at 02:00 UTC on the following day
- AND its deadline MUST be due at 10:00 UTC on the following day

#### Scenario: Display local time without changing obligation

- GIVEN two authorized viewers use different display timezones
- WHEN each views the same deadline
- THEN each MAY see a localized time
- AND both representations MUST refer to the same authoritative instant

### Requirement: SLA condition is explicit

Each unresolved incident MUST expose one current SLA condition: `on-track`, `warning`, `breached`, or `paused`. `paused` MUST be used only when the applied rule enables blocked-time pause and the incident is currently blocked. Resolved incidents MUST expose the terminal condition reached at resolution and whether the deadline was met. The condition MUST be derived from authoritative time, cycle events, and applied rule rather than editable client input.

#### Scenario: Enter warning condition

- GIVEN an unresolved incident reaches its warning threshold before its deadline
- WHEN SLA condition is evaluated
- THEN its condition MUST become `warning`
- AND exactly one warning event for that threshold and cycle MUST be appended

#### Scenario: Resolve before deadline

- GIVEN an incident is resolved before its deadline
- WHEN its terminal SLA outcome is recorded
- THEN it MUST be marked as met
- AND later passage of wall-clock time MUST NOT mark that resolved cycle breached

### Requirement: Blocked-time policy

The safe MVP default MUST continue elapsed SLA time while an incident is blocked. A matrix cell MAY explicitly enable blocked-time pause. Under a pausing rule, the deadline and pending warning thresholds MUST be extended by the total duration of completed and current blocked intervals; entering and leaving pause MUST append SLA events. A pause MUST NOT erase a warning or breach already reached, and a blocked incident that was already breached MUST remain breached.

#### Scenario: Pausing rule extends deadline

- GIVEN an incident's rule permits blocked-time pause
- AND the incident is blocked for two hours before breach
- WHEN it resumes
- THEN its remaining warning and deadline instants MUST be extended by two hours
- AND the original rule, block interval, and recalculated instants MUST remain traceable

#### Scenario: Block after breach

- GIVEN an incident has already breached
- WHEN it becomes blocked under a pausing rule
- THEN the breach MUST remain recorded
- AND the incident MUST remain breached rather than paused

### Requirement: Classification amendment recalculates prospectively

When category or severity is amended, the system MUST close the prior obligation segment at the amendment time and apply the active rule for the new category-by-severity combination to the current cycle. The new deadline MUST be calculated from the original cycle start, not from the amendment time, unless the change occurs through supervisor reopen. If the newly calculated deadline is already past, the system MUST immediately record a breach. Prior warnings, deadlines, and breaches MUST remain in history.

#### Scenario: Severity increase causes immediate breach

- GIVEN an incident has been open for three hours under a low-severity rule
- WHEN severity is amended to critical with a two-hour target
- THEN the new obligation MUST be breached immediately
- AND the prior low-severity obligation segment MUST remain traceable

#### Scenario: Severity decrease does not erase breach

- GIVEN an incident breached under a high-severity rule
- WHEN severity is validly amended to medium
- THEN the earlier breach MUST remain in history and metrics
- AND the current obligation MUST use the medium rule prospectively

### Requirement: Reopen starts a distinct SLA cycle

Supervisor reopen MUST preserve the resolved cycle as immutable history without altering its met or breached outcome and MUST create a new attributable SLA cycle at reopen time. The reopened incident MUST be in the approved `open` lifecycle state. Its new cycle MUST immediately apply the active matrix rule for the retained provisional category and severity and MUST expose exactly one defined SLA condition: `on-track`, `warning`, `breached`, or `paused`; because an `open` incident is not blocked, the new cycle MUST NOT be `paused`. If triage confirms the retained category and severity, the cycle MUST continue unchanged. If triage corrects either value, the system MUST apply the classification-amendment recalculation rules from the same reopen-time cycle start while preserving every prior obligation segment and event. Prior SLA cycles MUST remain separately reportable.

#### Scenario: Reopen a previously met incident

- GIVEN an incident was resolved within its original deadline
- WHEN a supervisor reopens it
- THEN the first cycle MUST remain immutably recorded as met
- AND the incident MUST become `open`
- AND a second attributable cycle MUST begin at reopen time using the active rule for the retained provisional category and severity
- AND the second cycle MUST expose a defined SLA condition without altering the first cycle's metrics

#### Scenario: Correct triage after reopen

- GIVEN a reopened incident is `open` with a new SLA cycle based on its retained provisional category and severity
- WHEN an authorized triager corrects the category or severity
- THEN the current cycle MUST be recalculated from the original reopen time under the newly applicable rule
- AND the initial obligation segment and every prior SLA cycle MUST remain immutable and traceable

### Requirement: Escalation events

The system MUST append an SLA event when each configured warning threshold or deadline is reached for an unresolved cycle. The safe default MUST create one warning event and one breach event per cycle and MUST not repeat reminders. Configurable repeat reminders MAY be enabled by an authorized configurator, but MUST define an interval no shorter than one hour and MUST be deduplicated. Escalation events MUST identify the incident, SLA cycle, matrix rule version, threshold, authoritative time, and recipients selected by policy.

#### Scenario: Deadline breach

- GIVEN an unresolved incident reaches its deadline
- WHEN SLA evaluation occurs
- THEN exactly one breach event MUST be appended for that cycle and deadline
- AND eligible escalation recipients MUST receive alerts

#### Scenario: Repeated evaluation is deduplicated

- GIVEN a breach event already exists for the cycle
- WHEN the same deadline is evaluated again
- THEN another default breach event or duplicate recipient alert MUST NOT be created

### Requirement: Alert event eligibility

The MVP MUST evaluate alerts for incident creation, triage completion or correction, assignment or reassignment, start, blocked, resumed, resolution, reopen, recurrence suggestion requiring a decision, recurrence confirmation or dismissal, SLA warning, and SLA breach. The safe default channel matrix MUST be:

| Event | In-app | Email |
| --- | --- | --- |
| Assignment or reassignment to recipient | Required | Required |
| Blocked or resumed | Required for owner and operational lead | Required for blocked; optional for resumed |
| Resolved | Required for reporter, owner, and operational lead | Optional |
| Reopened | Required for reporter, former owner, new operational lead | Required |
| Critical incident creation | Required for supervisor and configured responders | Required |
| Recurrence decision required | Required for eligible decision-maker | Optional |
| Recurrence decision completed | Required for reporter and operational lead | Optional |
| SLA warning | Required for owner and escalation recipients | Required |
| SLA breach | Required for owner, sector lead, supervisor, and configured escalation recipients | Required |
| Other material lifecycle events | Required for directly affected users | Optional |

Required email alerts MUST not be disabled by personal preference during the pilot. Users MAY disable optional email alerts. In-app records MUST still be retained for eligible events regardless of email preference.

#### Scenario: Required breach channels

- GIVEN an incident breaches its SLA
- WHEN recipients are evaluated
- THEN each eligible recipient MUST receive an in-app notification record
- AND a required email delivery attempt MUST be created

#### Scenario: Optional email preference

- GIVEN a user disabled optional resolution emails
- WHEN an incident relevant to the user is resolved
- THEN the user MUST still receive the eligible in-app notification
- AND no optional resolution email attempt MUST be created

### Requirement: Recipient scope

An alert recipient MUST be both event-eligible and authorized to view the incident at delivery-evaluation time. The current assignee MUST receive assignment, blocked, resume, warning, breach, and reopen events relevant to the assignee. The reporter MUST receive resolution and reopen events. The sector lead MUST receive assignment gaps, blocked, warning, breach, resolution, and reopen events in the lead's sectors. The supervisor MUST receive critical creation, ownership gaps, blocked, breach, and reopen events in the supervisor's stores. Inventory and central users MUST receive alerts only for matching category responsibility and explicit store scope. Configuration MAY narrow non-mandatory recipients but MUST NOT broaden access beyond authorization.

#### Scenario: Central user is excluded from an unauthorized store

- GIVEN a central user is configured as an escalation recipient for Store A only
- WHEN a matching incident in Store B breaches
- THEN no notification or email revealing Store B's incident MUST be created for that user

#### Scenario: Recipient loses access before delivery evaluation

- GIVEN a user was formerly in the incident's sector
- WHEN the user's scope is removed before a queued alert is evaluated for delivery
- THEN the alert MUST not disclose incident content to the user
- AND the suppressed outcome MUST be traceable to authorized administrators without exposing it to the user

### Requirement: Alert deduplication

For each recipient and channel, the system MUST create at most one alert for the same incident, material event, SLA cycle, and threshold unless an explicit reminder policy generates a distinct reminder occurrence. Retries MUST reuse the original delivery record rather than create a new user-visible notification. Reassignment to a new recipient MUST create a distinct eligible alert for the new assignment event.

#### Scenario: Duplicate event processing

- GIVEN an assignment event has already produced an in-app notification and email attempt for a user
- WHEN the event is processed again
- THEN no second in-app notification or logically separate email alert MUST be created

### Requirement: In-app notification traceability

Each in-app notification MUST record recipient, event, incident reference, creation time, eligibility basis, and `unread` or `read` state. A notification MUST start `unread`. Only its recipient MUST be allowed to mark it read or unread. Marking a notification read MUST record the authoritative read time and MUST NOT alter the underlying incident event.

#### Scenario: Recipient reads a notification

- GIVEN a recipient has an unread notification
- WHEN the recipient marks it read
- THEN its state MUST become `read`
- AND its read time MUST be recorded

#### Scenario: Another user attempts to mark it read

- GIVEN a notification belongs to User A
- WHEN User B attempts to change its read state
- THEN the system MUST deny the action

### Requirement: Email delivery traceability and failure handling

Each email alert MUST record recipient, related event, eligibility basis, preference decision, and delivery state. Delivery states MUST distinguish at least `queued`, `sent`, `delivered` when positively confirmed, `failed`, and `suppressed`. The system MUST NOT claim `delivered` without confirmation from the delivery channel. The safe default MUST retry transient failures up to three attempts over no more than 30 minutes, while permanent failures MUST not be retried. Each attempt and final failure reason MUST be traceable. Email failure MUST NOT roll back the incident action or in-app notification.

#### Scenario: Transient email failure

- GIVEN a required email attempt fails transiently
- WHEN retries remain
- THEN the same delivery record MUST show the additional attempt
- AND MUST NOT create duplicate user-visible alerts

#### Scenario: Permanent email failure

- GIVEN the delivery channel reports a permanent invalid-address failure
- WHEN the failure is recorded
- THEN delivery state MUST become `failed`
- AND the in-app notification and incident action MUST remain valid
- AND authorized operational support MUST be able to identify the failure

### Requirement: Alert configuration is attributable

Changes to event eligibility, recipient rules, preferences, retry policy, or reminder intervals MUST be attributable, versioned, scope-bound, and effective prospectively. Incidents and alert records MUST identify the policy version used. Disabling outbound alerts for pilot containment MUST suppress new email attempts while preserving in-app and historical delivery records unless an authorized containment decision explicitly states otherwise.

#### Scenario: Disable outbound pilot email

- GIVEN an authorized containment action disables outbound email
- WHEN a later eligible event occurs
- THEN the email outcome MUST be recorded as suppressed by that containment policy
- AND no stale email MUST be sent
- AND the in-app notification MUST still be created when authorized

## Open Product Questions

- Pilot owners MUST approve actual category-specific matrix values and mandatory escalation recipients before production use; the seed matrix is a safe operational starting point only.
- Business-hours calendars, holidays, and regional schedules are intentionally not part of the MVP clock behavior and require a future product decision.
- Quantified email delivery objectives and provider-level definition of `delivered` require a selected delivery service and pilot baseline; the system MUST report observed states without inventing an objective.
- Whether required pilot emails may later be acknowledged or muted after escalation remains unresolved; the MVP keeps them required and deduplicated.
