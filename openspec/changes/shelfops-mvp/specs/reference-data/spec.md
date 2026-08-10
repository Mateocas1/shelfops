# Reference Data Specification

## Purpose

Define the single-organization operational hierarchy, reference catalogs, accountable configuration, and simulated MVP data used by ShelfOps incidents.

## Requirements

### Requirement: Single-organization operational hierarchy

The system MUST represent exactly one retail organization for the MVP. The organization MUST contain stores; each store MUST contain sectors; and each operational location MUST belong to exactly one store and one sector in that store. Products MUST belong to the organization and MAY be associated with one or more stores. Every user, incident, evidence item, configuration record, notification, and audit event MUST be attributable to the organization and any applicable store, sector, or location scope.

#### Scenario: Create a valid hierarchy

- GIVEN the configured MVP organization
- WHEN an authorized configurator creates a store, a sector in that store, and a location in that sector
- THEN each record is associated with the organization
- AND the sector is associated with the store
- AND the location is associated with both that store and sector

#### Scenario: Reject a cross-store location relationship

- GIVEN a sector in Store A
- WHEN a configurator attempts to associate that sector with a location in Store B
- THEN the system MUST reject the relationship
- AND MUST NOT alter either store's hierarchy

#### Scenario: Reject a second organization

- GIVEN the MVP organization already exists
- WHEN any actor attempts to create another independent organization
- THEN the system MUST reject the request as outside the MVP product model

### Requirement: Governed reference records

Stores, sectors, locations, products, users, categories, and severities MUST have durable identifiers, human-readable names, active status, and attributable creation and change timestamps. Deactivation MUST preserve references from historical incidents. A referenced record MUST NOT be hard-deleted while retained incident or audit records depend on it. Reference changes MUST NOT rewrite historical incident snapshots.

#### Scenario: Deactivate a referenced location

- GIVEN an active location referenced by an existing incident
- WHEN an authorized configurator deactivates the location
- THEN the location MUST be unavailable for new incident selection
- AND the existing incident MUST retain the location identifier and displayable historical label
- AND the deactivation actor and timestamp MUST be traceable

#### Scenario: Reject an inactive reference on a new incident

- GIVEN an inactive product or location
- WHEN a user attempts to use it as context for a new incident
- THEN the system MUST reject the reference
- AND MUST identify the invalid field without creating the incident

### Requirement: Initial incident category catalog

The MVP MUST provide the configurable categories `out-of-stock`, `inventory-mismatch`, `misplaced-product`, `price-or-label`, `replenishment-blocked`, `equipment-failure`, and `other`. Each category MUST define whether location context, product context, creation evidence, or specific resolution evidence types are required. The safe MVP default MUST require a location and at least one creation evidence item for every category; MUST require a product for all categories except `equipment-failure` and `other`; and MUST permit `other` only with a reporter-supplied explanatory note. Authorized configuration MAY adjust creation-evidence requirements where urgent reporting justifies it but MUST NOT permit evidence-free resolution.

#### Scenario: Create an inventory mismatch with required context

- GIVEN `inventory-mismatch` is active with its default policy
- WHEN an authorized user supplies a store, sector, location, product, severity, description, and creation evidence
- THEN the category context MUST be accepted

#### Scenario: Reject an under-specified other-category report

- GIVEN `other` is active
- WHEN a user submits an incident without an explanatory note
- THEN the system MUST reject the incident
- AND MUST explain that the category requires a note

### Requirement: Initial severity catalog

The MVP MUST provide the ordered severities `low`, `medium`, `high`, and `critical`. Their default meanings MUST be: `low`, limited impact with a workaround; `medium`, material local disruption without immediate safety or store-wide impact; `high`, major operational impact, substantial loss risk, or no practical workaround; and `critical`, immediate safety, regulatory, severe loss, or store-wide continuity risk. Severity labels and guidance MAY be configured by an authorized configurator, but ordering MUST remain explicit and historical incidents MUST retain the severity definition applied when classified.

#### Scenario: Present severity guidance

- GIVEN a user is triaging an incident
- WHEN severity choices are shown
- THEN the system MUST show the active ordered severity catalog
- AND MUST make the configured decision guidance available

#### Scenario: Preserve a prior severity definition

- GIVEN an incident was classified as `high` under version 1 of the catalog
- WHEN an authorized configurator changes the `high` guidance
- THEN the incident history MUST retain version 1 as the applied classification definition
- AND new classifications MUST use the new version

### Requirement: Accountable configuration

Only a supervisor acting within the supervisor's store scope or a central-operations user with an explicit configuration grant for the affected stores MUST be allowed to configure store, sector, location, category policy, severity guidance, SLA, recurrence, or alert rules. Organization-wide product and category catalog changes MUST require an explicit organization-level configuration grant. Each configuration change MUST record the actor, timestamp, affected scope, prior value, new value, and effective time.

#### Scenario: Authorized store configuration

- GIVEN a supervisor scoped to Store A
- WHEN the supervisor changes a Store A location or store-scoped rule
- THEN the system MUST save an attributable configuration event

#### Scenario: Denied organization-wide configuration

- GIVEN a supervisor has Store A scope but no organization-level configuration grant
- WHEN the supervisor attempts to change the organization-wide product catalog
- THEN the system MUST deny the action
- AND MUST NOT change the catalog

### Requirement: Representative simulated fixtures

The MVP MUST include clearly labeled non-production fixtures sufficient to demonstrate and test authorization and workflow behavior. The fixture set MUST contain at least two stores, at least two sectors and two locations per store, at least ten products, every operational role, collaborators assigned to different sectors, a supervisor per store, and central users with both single-store and multi-store scopes. Fixtures MUST include active and inactive references and incidents covering each category, severity, lifecycle state, and SLA condition. Fixture identity and relationships MUST be deterministic across resets.

#### Scenario: Exercise cross-store access

- GIVEN the simulated fixture set is loaded
- WHEN authorization scenarios use the single-store and multi-store central users
- THEN the data MUST permit both an allowed authorized-store path and a denied unauthorized-store path

#### Scenario: Prevent fixture confusion

- GIVEN simulated fixtures are visible in a non-production environment
- WHEN a user views fixture records
- THEN the system MUST identify them as simulated
- AND MUST NOT represent them as production operational data

### Requirement: Reference-data validation

Names MUST be nonblank after trimming. Identifiers MUST be stable and unique within their documented scope. A sector MUST belong to the incident's store; a location MUST belong to the incident's sector and store; and a selected product MUST be active and available to the incident's store when store availability is configured.

#### Scenario: Reject inconsistent incident context

- GIVEN a location belongs to Sector A in Store A
- WHEN an incident request supplies that location with Sector B or Store B
- THEN the system MUST reject the inconsistent context
- AND MUST NOT create or modify an incident

## Open Product Questions

- The pilot's final product catalog, store names, sector taxonomy, and category-specific evidence policies require operational-owner approval before production use; the simulated defaults are not universal retail policy.
- The legal retention period for deactivated reference labels and their dependent incident records remains unresolved and MUST be decided before production rollout.
