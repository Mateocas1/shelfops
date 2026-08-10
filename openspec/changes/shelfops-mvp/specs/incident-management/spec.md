# Incident Management Specification

## Purpose

Define an accountable incident record from report through deterministic triage, ownership, work, evidence-backed resolution, recurrence review, reopening, and immutable material history.

## Requirements

### Requirement: Structured incident creation

An authorized reporter MUST be able to create an incident with a store, sector, operational location, category, severity, concise title, description, occurrence or discovery time, reporter identity, and evidence required by the active category policy. Product context MUST be included when required by category policy and MAY otherwise be included. Reporter-selected category and severity MUST be identified as provisional until human triage is complete, while remaining the current visible values and initial SLA basis. The system MUST assign a durable incident identifier, set the initial state to `open`, record the creation time, and snapshot the applicable category, severity, recurrence, and SLA rule versions. Client-supplied actor identity, creation time, state, or audit fields MUST be ignored or rejected.

#### Scenario: Create a complete incident

- GIVEN an active authorized reporter and valid in-scope references
- WHEN the reporter submits all fields and evidence required by the category
- THEN the system MUST create exactly one `open` incident
- AND MUST record the reporter and authoritative creation timestamp
- AND MUST expose its initial triage and SLA status

#### Scenario: Reject missing required context

- GIVEN a category requires product context and creation evidence
- WHEN a reporter omits either requirement
- THEN the system MUST reject the request with field-level validation details
- AND MUST NOT create an incident, history event, SLA event, or alert

#### Scenario: Reject a future occurrence time

- GIVEN the reported occurrence time is later than the authoritative current time beyond a configurable clock-skew allowance
- WHEN the user submits the incident
- THEN the system MUST reject the occurrence time
- AND the safe MVP clock-skew allowance MUST default to five minutes

### Requirement: Creation evidence

Creation evidence MUST contain at least one attributable text note, image, document, or approved reference when category policy requires evidence. The safe MVP defaults MUST accept text notes up to 4,000 characters and up to five JPEG, PNG, or PDF attachments of no more than 10 MiB each per evidence event. Limits and allowed types MUST be configurable, MUST be disclosed before submission, and MUST be enforced consistently across clients. Evidence MUST record uploader, timestamp, type, display name, and association to the incident event.

#### Scenario: Accept a note as evidence

- GIVEN the active category policy accepts a text note
- WHEN a reporter supplies a nonblank note within the configured limit
- THEN the note MUST satisfy the creation-evidence requirement

#### Scenario: Reject unsupported evidence

- GIVEN executable files are not an approved evidence type
- WHEN a user uploads an executable file
- THEN the system MUST reject the file
- AND MUST preserve the rest of the unsent incident draft for correction where the client supports drafts

### Requirement: Deterministic triage suggestions

On creation and whenever an authorized user requests retriage, the system MUST evaluate active deterministic rules against recorded incident inputs. The result MUST suggest category, severity, and an eligible assignee or explicitly state that manual selection is required. Every suggestion MUST record the rule identifier and version, evaluated inputs, suggested outputs, creation timestamp, and a concise human-readable explanation. Identical normalized inputs under the same rule version MUST produce identical suggestions. A suggestion MUST NOT change confirmed incident values or ownership by itself.

#### Scenario: Repeat deterministic evaluation

- GIVEN the same incident inputs and triage rule version
- WHEN triage is evaluated more than once
- THEN each evaluation MUST produce the same suggested category, severity, assignee, and explanation

#### Scenario: No rule matches

- GIVEN no active triage rule matches the incident
- WHEN triage is evaluated
- THEN the system MUST record a `manual triage required` suggestion
- AND MUST NOT invent or finalize an assignee

### Requirement: Human confirmation or correction of triage

An authorized triager MUST explicitly confirm or correct each suggested category, severity, and assignment before the incident can leave `open`. A correction MUST capture the human-selected value and correction reason; a confirmation MUST identify the confirmed suggestion. When deterministic evaluation returns `manual triage required`, the authorized triager MUST select the final category, severity, and eligible assignee and MUST provide a rationale; the system MUST retain the manual-fallback result alongside the no-match suggestion and evaluated rule version. The final assignee MUST be eligible and singular. The triage decision MUST preserve both the suggestion and human outcome.

#### Scenario: Confirm all suggestions

- GIVEN an open incident has complete eligible suggestions
- WHEN an authorized triager confirms category, severity, and assignee
- THEN the system MUST record confirmation for each decision
- AND MUST transition the incident to `classified`

#### Scenario: Correct an assignment suggestion

- GIVEN a suggested assignee is eligible but not operationally appropriate
- WHEN an authorized triager selects another eligible assignee and gives a reason
- THEN the system MUST retain the original suggestion
- AND MUST record the corrected assignee, actor, reason, and timestamp
- AND MAY transition to `classified` when all triage decisions are complete

#### Scenario: Complete manual fallback triage

- GIVEN deterministic evaluation recorded `manual triage required`
- WHEN an authorized triager selects a category, severity, and eligible assignee and supplies a rationale
- THEN the system MUST retain the no-match suggestion, human-selected values, rationale, actor, and timestamp
- AND MUST transition the incident to `classified`

#### Scenario: Reject partial triage

- GIVEN category and severity are confirmed but assignment is neither confirmed nor corrected
- WHEN the triager attempts to complete triage
- THEN the system MUST reject the transition to `classified`
- AND MUST keep the recorded partial decisions without treating them as final classification

### Requirement: Exact lifecycle transition model

The only normal lifecycle transitions MUST be:

| From | To | Required actor and conditions |
| --- | --- | --- |
| `open` | `classified` | Authorized triager; category, severity, and one eligible assignee explicitly confirmed or corrected |
| `classified` | `in-progress` | Current assignee; start note optional |
| `in-progress` | `blocked` | Current assignee or in-scope supervisor; nonblank blocked reason required |
| `blocked` | `in-progress` | Current assignee or in-scope supervisor; nonblank resume note required |
| `in-progress` | `resolved` | Current assignee; required resolution evidence and resolution summary supplied |
| `resolved` | `open` | In-scope supervisor; nonblank reopen reason supplied |

No other state-to-state transition MUST be allowed. Reassignment and classification amendment are material actions but MUST NOT themselves create an unlisted state transition. Reopening MUST retain the current category and severity as provisional inputs, retain prior assignment for history, clear current assignment, and require a new explicit triage decision before returning to `classified`.

#### Scenario: Start classified work

- GIVEN a classified incident has an active eligible assignee
- WHEN that assignee starts work
- THEN the incident MUST transition to `in-progress`
- AND MUST append a transition event

#### Scenario: Reject open to in-progress

- GIVEN an incident is `open`
- WHEN any actor attempts to transition it directly to `in-progress`
- THEN the system MUST reject the transition
- AND MUST retain the `open` state

#### Scenario: Reject resolution from blocked

- GIVEN an incident is `blocked`
- WHEN the assignee attempts to resolve it directly
- THEN the system MUST reject the transition
- AND MUST require a valid resume to `in-progress` first

#### Scenario: Reject resolved to classified

- GIVEN an incident is `resolved`
- WHEN a supervisor attempts to move it directly to `classified`
- THEN the system MUST reject the transition
- AND MUST require supervisor reopen to `open`

### Requirement: Ownership and reassignment

A `classified`, `in-progress`, or `blocked` incident MUST have exactly one active current assignee. Authorized reassigners MAY replace the assignee in any of those states, but MUST supply a reason when the incident is `in-progress` or `blocked`. Reassignment MUST preserve state, append the prior and new assignee, and notify eligible affected users. If no eligible assignee is available, the incident MUST remain `open` or be reopened to `open`; it MUST NOT be represented as classified without ownership.

#### Scenario: Reassign active work

- GIVEN an in-progress incident has Assignee A
- WHEN an authorized supervisor reassigns it to eligible Assignee B with a reason
- THEN the state MUST remain `in-progress`
- AND history MUST show both assignees, actor, reason, and timestamp

#### Scenario: Reject removal of classified ownership

- GIVEN a classified incident has one assignee
- WHEN a user attempts to remove the assignee without replacement
- THEN the system MUST reject the action

### Requirement: Classification amendments

An authorized triager MAY amend category or severity after classification, but the amendment MUST include a reason, preserve the prior value and rule snapshot, evaluate assignee eligibility again, start a prospective SLA recalculation under the SLA specification, and create a material event. The amendment MUST NOT erase earlier SLA warnings or breaches. If the current assignee becomes ineligible, an authorized user MUST provide a replacement in the same action or the amendment MUST be rejected.

#### Scenario: Increase severity during work

- GIVEN an in-progress incident is `medium`
- WHEN an authorized triager changes it to `high` with a reason and keeps an eligible assignee
- THEN the state MUST remain `in-progress`
- AND the prior and new severity and SLA obligations MUST remain traceable

#### Scenario: Reject amendment that invalidates ownership

- GIVEN a category change would make the current assignee ineligible
- WHEN no eligible replacement is supplied
- THEN the system MUST reject the amendment
- AND MUST preserve category, assignee, and SLA state

### Requirement: Blocked behavior

Entering `blocked` MUST record a normalized blocked reason, optional evidence, actor, timestamp, and the active SLA pause policy. The default blocked policy MUST NOT pause SLA time. Where the applied SLA rule explicitly enables pause, only time after the block event and before a valid resume MUST be excluded; prior elapsed time and prior breaches MUST remain. Repeated block/resume cycles MUST each be retained.

#### Scenario: Block without a reason

- GIVEN an in-progress incident
- WHEN an authorized actor attempts to block it without a reason
- THEN the system MUST reject the transition

#### Scenario: Default block continues SLA

- GIVEN an incident uses the safe default non-pausing policy
- WHEN it becomes blocked
- THEN its deadline MUST remain unchanged
- AND warnings and breach evaluation MUST continue

### Requirement: Evidence-backed resolution

Only the current assignee MUST be allowed to transition an `in-progress` incident to `resolved`. Resolution MUST require a nonblank summary and at least one newly attributable resolution evidence item created or explicitly linked as part of the resolution action. A text resolution note MUST be accepted as the safe minimum; category policy MAY additionally require an image, document, or approved reference. Evidence from initial creation alone MUST NOT satisfy resolution unless it is explicitly supplemented by a new resolution note explaining the outcome.

#### Scenario: Resolve with required evidence

- GIVEN an in-progress incident and its current assignee
- WHEN the assignee supplies a resolution summary and all category-required evidence
- THEN the system MUST transition the incident to `resolved`
- AND MUST append the summary, evidence references, actor, and timestamp

#### Scenario: Reject evidence-free resolution

- GIVEN an in-progress incident
- WHEN the assignee submits a resolution without new resolution evidence
- THEN the system MUST reject the transition
- AND MUST leave the incident in progress

#### Scenario: Reject resolution by a non-assignee

- GIVEN an in-progress incident is assigned to User A
- WHEN User B attempts resolution even with valid evidence
- THEN the system MUST deny the action
- AND MUST create no resolution event

### Requirement: Supervisor-controlled reopening

Only an in-scope supervisor MUST be allowed to reopen a `resolved` incident. Reopening MUST require a reason, append a `resolved` to `open` event, retain the complete prior resolution and evidence, increment a reopen count, clear current ownership, and initiate new deterministic triage suggestions. At the same authoritative reopen time, the system MUST create a new attributable SLA cycle using the active rule for the retained provisional category and severity; any later triage correction MUST recalculate that same cycle from reopen time under the newly applicable rule. Reopening MUST NOT merge, overwrite, or delete the prior work or SLA cycle.

#### Scenario: Reopen an inadequate resolution

- GIVEN a resolved incident with resolution evidence
- WHEN an in-scope supervisor supplies an inadequate-resolution reason
- THEN the incident MUST become `open`
- AND the prior resolution MUST remain viewable in history
- AND a new triage and SLA cycle MUST be identifiable

#### Scenario: Reject reopen by the former assignee

- GIVEN a resolved incident
- WHEN its former assignee attempts to reopen it without supervisor authority
- THEN the system MUST deny the transition

### Requirement: Append-oriented material history

The system MUST append an immutable material event for creation; triage suggestion; triage confirmation or correction; assignment or reassignment; category or severity amendment; every lifecycle transition; blocked reason and resume; evidence addition or supersession; SLA warning, pause, resume, breach, or recalculation; recurrence suggestion and decision; resolution; reopen; and notification delivery outcome. Each material event MUST have a durable identifier, event type, incident identifier, authoritative timestamp, actor or system origin, affected scope, relevant prior and new values, reason where required, and correlation to the initiating action. History MUST be ordered deterministically by authoritative timestamp and a stable tie-breaker.

#### Scenario: Reconstruct an incident

- GIVEN an incident has been triaged, reassigned, blocked, resumed, resolved, and reopened
- WHEN an authorized reviewer views its history
- THEN the reviewer MUST be able to identify every responsible actor, time, decision, prior value, new value, evidence reference, and SLA event in order

#### Scenario: Attempt to edit a history event

- GIVEN a material event exists
- WHEN any user attempts to update or delete it
- THEN the system MUST reject the operation

### Requirement: Corrections append rather than overwrite

An authorized user MAY correct a mistaken note, evidence label, or material decision only through a new correction event that identifies the superseded event, correction reason, actor, timestamp, and corrected value. The superseded event MUST remain retained and visible as superseded. Evidence content MUST NOT be silently replaced; replacement evidence MUST be added and linked to the superseded item. Corrections MUST NOT retroactively remove valid SLA breaches or notifications.

#### Scenario: Correct a mistaken evidence label

- GIVEN an evidence item has an incorrect label
- WHEN an authorized user corrects it with a reason
- THEN a correction event MUST be appended
- AND the original label MUST remain available in history as superseded

### Requirement: Evidence access and retention

Evidence access MUST follow incident visibility. Evidence MUST remain attributable and retrievable for as long as its incident record is retained, unless a binding policy requires restricted removal. A policy-driven restriction MUST preserve metadata, reason, authority, timestamp, and a tamper-evident indication that content is unavailable. The safe MVP default MUST perform no automatic evidence purge. Authorized pilot export MUST include evidence metadata and resolvable evidence content or an explicit unavailable marker.

#### Scenario: User cannot bypass incident visibility

- GIVEN a user cannot view an incident
- WHEN the user requests a known evidence identifier from that incident
- THEN the system MUST return a not-found outcome
- AND MUST NOT disclose evidence metadata

### Requirement: Recurrence suggestions are advisory

The system MUST evaluate possible recurrence without autonomously linking or merging incidents. The safe MVP rule MUST consider prior incidents in the same store and category, within a configurable window defaulting to 30 elapsed days, and MUST require an exact shared location or exact shared product. When both current and prior incidents contain a value for a compared field, unequal values MUST not count as a match for that field. The window MUST be configurable from 1 to 90 days. Suggestions MUST exclude the current incident, identify up to five most recent matches, and explain matched fields, prior incident, rule version, and window.

#### Scenario: Suggest a recurrence candidate

- GIVEN a new incident has the same store, category, and product as a prior incident from the last 30 days
- WHEN recurrence evaluation runs
- THEN the prior incident MUST be suggested with the matching basis
- AND no recurrence link MUST be final yet

#### Scenario: Do not suggest a broad category-only match

- GIVEN two incidents share only store and category but have neither a shared location nor shared product
- WHEN recurrence evaluation runs
- THEN the prior incident MUST NOT be suggested

### Requirement: Human recurrence decision

An authorized user who can view both incidents MUST explicitly confirm or dismiss each recurrence suggestion. The decision MUST record the actor, timestamp, suggested prior incident, matching explanation, rule version, and optional decision note. Confirmation MUST create a traceable relationship but MUST NOT merge records, copy state, change ownership, alter SLA, or resolve either incident. Dismissal MUST suppress the same pair under the same rule version unless a user explicitly requests reevaluation.

#### Scenario: Confirm recurrence

- GIVEN a valid pending recurrence suggestion
- WHEN an authorized user confirms it
- THEN both incidents MUST remain independent
- AND the relationship and human decision MUST be traceable from each incident

#### Scenario: Dismiss recurrence

- GIVEN a pending suggestion
- WHEN an authorized user dismisses it
- THEN the decision MUST be retained
- AND the same rule version MUST NOT repeatedly present the same pair by default

### Requirement: Concurrent mutation protection

Every incident representation used for mutation MUST expose a version. A mutation based on a stale version MUST be rejected as a conflict, MUST return the current version or a way to retrieve it, and MUST create no partial state, evidence association, history event, SLA effect, recurrence decision, or alert. Users MUST be able to review current state and retry intentionally.

#### Scenario: Two users classify concurrently

- GIVEN two authorized users read the same open incident version
- WHEN User A completes triage first and User B submits a different decision using the stale version
- THEN User A's decision MUST remain authoritative
- AND User B's mutation MUST be rejected as a conflict
- AND both decisions MUST NOT be appended

#### Scenario: Concurrent resolution and reassignment

- GIVEN an assignee and supervisor act from the same incident version
- WHEN reassignment commits before the former assignee's resolution
- THEN the former assignee's stale resolution MUST be rejected
- AND the incident MUST not be resolved by a no-longer-current assignee

## Open Product Questions

- Production evidence retention, legal-hold, and restricted-removal policies require legal and operational approval; the MVP safe default is indefinite pilot retention with no automatic purge.
- Category-specific mandatory photo or document rules require pilot-owner approval; every resolution still requires at least a new attributable text note.
- Whether confirmed recurrence should support a later named "root incident" grouping is outside this MVP and MUST NOT be inferred from a confirmation.
