# Authorization Specification

## Purpose

Define role-and-scope authorization for one retail organization so every user sees and changes only the incidents and configuration required for assigned work.

## Requirements

### Requirement: Role and scope are both required

Every protected read or action MUST require an authenticated active user, a role that permits the action, and organizational scope that contains the target record. Scope MUST be evaluated from authoritative assignments rather than client-supplied claims. Store, sector, ownership, category responsibility, and explicit grants MUST be combined as specified below. Possession of a record identifier MUST NOT grant access.

#### Scenario: Role permits but scope denies

- GIVEN a sector lead in Sector A has a role that can assign incidents
- AND the target incident belongs to Sector B
- WHEN the lead attempts to assign the incident
- THEN the system MUST deny the action
- AND MUST NOT reveal or change restricted incident data

#### Scenario: Scope permits but role denies

- GIVEN a collaborator belongs to the incident's sector
- AND collaborators cannot assign incidents
- WHEN the collaborator attempts assignment
- THEN the system MUST deny the action
- AND MUST NOT alter ownership or history

### Requirement: Collaborator permissions

A collaborator MUST be allowed to create incidents in an assigned store and sector; view incidents the collaborator created; view incidents in an assigned sector; add evidence or comments to a visible incident; act on an incident when the collaborator is its current assignee; and confirm or dismiss a recurrence suggestion presented during the collaborator's own report. A collaborator MUST NOT classify, assign, reassign, reopen, configure policy, export a store-wide history, or view another sector solely because it is in the same store.

#### Scenario: Collaborator works an assigned incident

- GIVEN a collaborator can view an incident in the collaborator's sector
- AND is the current assignee
- WHEN the collaborator starts, blocks, resumes, or resolves the incident under valid lifecycle rules
- THEN the action MUST be allowed

#### Scenario: Collaborator attempts triage

- GIVEN a collaborator created an open incident
- WHEN the collaborator attempts to confirm classification or final assignment
- THEN the system MUST deny the action
- AND the incident MUST remain open

### Requirement: Sector lead permissions

A sector lead MUST be allowed to view, classify, assign, reassign, and monitor incidents in assigned sectors; add evidence and comments; and act on an incident when assigned. A sector lead MUST NOT access other sectors unless the incident was created by the lead or an explicit additional sector scope exists. A sector lead MUST NOT reopen resolved incidents or configure organization-wide policy.

#### Scenario: Lead triages within sector

- GIVEN an open incident belongs to a lead's assigned sector
- WHEN the lead confirms or corrects the deterministic triage suggestion and assigns an eligible user
- THEN the system MUST allow the incident to become classified

#### Scenario: Lead attempts reopen

- GIVEN a resolved incident is in the lead's sector
- WHEN the lead attempts to reopen it
- THEN the system MUST deny the transition

### Requirement: Supervisor permissions

A supervisor MUST be allowed to view and monitor all incidents in assigned stores; classify, assign, reassign, add evidence, block, and resume incidents in those stores; configure store-scoped reference and policy records; export store-scoped incident records; and reopen resolved incidents. A supervisor MUST resolve an incident only when the supervisor is the current assignee and supplies required resolution evidence. Supervisor status alone MUST NOT bypass the assigned-resolver rule.

#### Scenario: Supervisor reopens within store

- GIVEN a resolved incident belongs to the supervisor's store
- WHEN the supervisor supplies a reopen reason
- THEN the system MUST allow the supervisor-controlled reopen transition

#### Scenario: Supervisor attempts direct resolution while unassigned

- GIVEN an in-progress incident is assigned to another user
- WHEN a supervisor attempts to resolve it without first becoming the assignee
- THEN the system MUST deny resolution
- AND MUST preserve the current assignee and state

### Requirement: Inventory-team permissions

An inventory-team user MUST be allowed to view inventory-relevant incidents only within explicitly assigned store and sector scopes. The default inventory-relevant categories MUST be `out-of-stock`, `inventory-mismatch`, `misplaced-product`, and `replenishment-blocked`. Within that category and organizational scope, the user MAY classify or accept assignment when granted an inventory-triage permission and MAY perform assignee lifecycle actions when assigned. The user MUST NOT gain access to unrelated categories or stores by role alone.

#### Scenario: Inventory access is allowed by category and scope

- GIVEN an inventory user is assigned Store A
- AND an inventory-mismatch incident belongs to Store A
- WHEN the user views the incident
- THEN access MUST be allowed

#### Scenario: Inventory role does not expose equipment incidents

- GIVEN the same user has no general store scope for equipment incidents
- WHEN the user requests a Store A equipment-failure incident
- THEN the system MUST deny access

### Requirement: Central-operations permissions

A central-operations user MUST be allowed to view and work incidents only in explicitly authorized stores and only for assigned category responsibilities or incidents assigned to that user or team. Multi-store scope MUST enumerate authorized stores; it MUST NOT imply organization-wide access. Classification, assignment, or configuration MUST require the corresponding explicit action grant in addition to store scope. Central-operations users MUST NOT reopen incidents unless they also hold the supervisor role for the target store.

#### Scenario: Cross-store access is bounded

- GIVEN a central-operations user is authorized for Stores A and B but not Store C
- WHEN the user requests matching incidents across all stores
- THEN results MUST include only eligible incidents from Stores A and B
- AND MUST exclude Store C without disclosing its incident counts

#### Scenario: Central user lacks action grant

- GIVEN a central user can view an equipment incident in an authorized store
- AND the user lacks assignment permission
- WHEN the user attempts to reassign it
- THEN the system MUST deny the action

### Requirement: Explicit action matrix

The system MUST enforce the following default matrix in addition to scope checks. `Assigned only` means the actor must be the current assignee. `Granted` means the action requires a separately recorded permission grant.

| Action | Collaborator | Sector lead | Supervisor | Inventory team | Central operations |
| --- | --- | --- | --- | --- | --- |
| Create incident | Assigned sector | Assigned sector | Assigned store | Assigned inventory scope | Authorized store/category |
| View incident | Own or assigned sector | Assigned sector | Assigned store | Inventory category and assigned scope | Authorized store plus category responsibility or assignment |
| Confirm/correct triage | No | Yes | Yes | Granted | Granted |
| Assign/reassign | No | Assigned sector | Assigned store | Granted within inventory scope | Granted within authorized scope |
| Start/block/resume | Assigned only | Assigned only, or supervisor-directed block is unavailable | Assigned only or supervisor override for block/resume | Assigned only | Assigned only |
| Resolve | Assigned only | Assigned only | Assigned only | Assigned only | Assigned only |
| Reopen | No | No | Assigned store | No | No, unless also target-store supervisor |
| Configure store policy | No | No | Assigned store | No | Granted |
| Configure organization catalog | No | No | Granted | No | Granted |
| Store-scope export | No | No | Assigned store | No | Granted |

Role combinations MUST be additive only within the union of explicitly assigned scopes. No role combination MUST bypass the rules for assigned-only resolution or supervisor-only reopening.

#### Scenario: Combined roles remain scope-bound

- GIVEN a user is a supervisor in Store A and central operations in Store B
- WHEN the user attempts to reopen an incident in Store B
- THEN the system MUST deny reopening because the supervisor role does not cover Store B

### Requirement: Assignment eligibility

An assignee MUST be active and MUST have a work scope compatible with the incident's store, sector, and category. Assignment to a team MAY be suggested, but an incident in `classified`, `in-progress`, or `blocked` MUST have exactly one current responsible assignee who is a user. Reassignment MUST pass the same eligibility rules and MUST create attributable history.

#### Scenario: Reject an out-of-scope assignee

- GIVEN a user works only in Store B
- WHEN an authorized lead attempts to assign a Store A incident to that user
- THEN the system MUST reject the assignment
- AND MUST leave existing ownership unchanged

### Requirement: Restricted response behavior

A request for an incident outside the user's visibility scope MUST behave as not found and MUST not disclose whether the incident exists. A visible incident on which the user lacks action permission MUST produce an explicit forbidden outcome. Lists, counts, filters, exports, histories, notifications, and search suggestions MUST apply the same visibility rules.

#### Scenario: Identifier probing

- GIVEN a user knows the identifier of an incident outside the user's scope
- WHEN the user requests the incident
- THEN the system MUST return a not-found outcome
- AND MUST NOT expose title, state, existence, or scope metadata

#### Scenario: Visible but forbidden action

- GIVEN a collaborator may view a sector incident but may not assign it
- WHEN the collaborator attempts assignment
- THEN the system MUST return a forbidden outcome

### Requirement: Authorization changes take effect safely

Deactivating a user or removing scope MUST prevent new access immediately after the authoritative change. Existing incident assignment MUST remain historically visible, but an inactive or newly out-of-scope assignee MUST be flagged as an ownership gap and MUST be reassigned by an authorized user before further assigned-only transitions. Authorization changes MUST be attributable and MUST NOT rewrite prior actions.

#### Scenario: Assignee loses scope

- GIVEN an in-progress incident is assigned to a user
- WHEN the user's relevant scope is removed
- THEN the incident MUST retain the historical assignment
- AND MUST be flagged for reassignment
- AND the former assignee MUST be denied further access unless another visibility rule applies

### Requirement: Denied actions are side-effect free

An authorization denial MUST NOT change incident state, ownership, evidence, audit history, SLA state, recurrence decisions, notifications, dashboard aggregates, or idempotency outcomes. Security-relevant denial telemetry MAY be retained outside the user-visible incident history without exposing restricted record content.

#### Scenario: Denied transition has no operational effects

- GIVEN an unauthorized actor attempts a lifecycle transition
- WHEN authorization fails
- THEN no transition event or recipient alert MUST be created
- AND the incident version MUST remain unchanged

## Open Product Questions

- The named individuals who receive organization-level configuration and export grants remain a pilot-governance decision; no operational role receives those grants implicitly.
- Whether inventory responsibility is assigned by category alone or by category plus product family remains unresolved; the MVP default is category plus explicit store/sector scope.
