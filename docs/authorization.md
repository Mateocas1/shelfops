# Authorization decisions are role-and-scope bound

ShelfOps authorizes an active person from server-owned assignments, never from a client claim or record identifier. WU-04 establishes the pure policy boundary used by later session, repository, and HTTP work.

## Quick path

1. Load active role scopes, category responsibilities, and action grants into one application `AuthorizedPrincipal`.
2. Use the domain visibility policy before loading or listing incidents; hidden records resolve as `not-found`.
3. Use the domain action and assignment policies after a visible record is available; persist a mutation only after an `allowed` or `eligible` result.

## Policy boundary

| Concern | Decision |
| --- | --- |
| Authoritative principal | `packages/application/src/authorization/authorized-principal.ts` is the single application contract for an active user and its loaded assignments. |
| Shared vocabulary | Domain `types.ts` owns roles, scopes, responsibilities, grants, actions, records, and decision types. |
| Dependency direction | Application depends on domain vocabulary; domain policies accept primitive principal facts and never import application, HTTP, SQL, sessions, or frameworks. |
| Visibility result | A denied visibility check returns `not-found`, so an identifier cannot disclose a hidden incident. |
| Action result | A visible but unauthorized action returns `forbidden` with a stable policy reason. |

## Role and scope intersection

Every allowance comes from one matching role scope. Combined roles are additive only within their own explicit store and sector assignments: a supervisor scope in Store A does not authorize that person's central-operations scope in Store B to reopen an incident.

| Role | Visibility and work boundary |
| --- | --- |
| Collaborator | Own reports or assigned sector; lifecycle work only when the collaborator is the assignee. |
| Sector lead | Assigned sectors or own reports; may triage and assign only in assigned sectors, and works incidents only when assigned there. |
| Supervisor | Assigned stores; may triage, assign, block/resume, and reopen there; resolution remains assigned-only. |
| Inventory team | Explicit store/sector scope and inventory-relevant category responsibility; triage or assignment additionally needs a grant. |
| Central operations | Explicit stores plus a category responsibility, current assignment, or team assignment; configuration, export, triage, and assignment additionally require their corresponding grant. |

`ActionGrant` enables an action only after a matching role scope is found. It is not a store, sector, category, or team scope and therefore cannot broaden access.

Creator visibility is read-only: a sector lead who reported an incident outside assigned sectors can see it, but cannot classify, assign, work, resolve, reopen, or otherwise act on it without a matching action scope.

## Assignment rules

An assignee is eligible only when active and when at least one work-capable role scope matches the incident's store, sector, and category constraints. Inventory and central roles retain their category/team restrictions. Action permission held by an assigner or candidate never makes an out-of-scope candidate eligible.

The policy is pure: it neither changes the incident nor creates history, alerts, ownership changes, or notifications. A caller must treat an ineligible or forbidden result as a no-op.

## Deferred wiring

WU-04 deliberately does not add SQL predicates, persistence translation, OIDC/session loading, API responses, or mutation wiring. WU-05 loads this principal from the session boundary, and WU-06 translates visibility into scoped repository predicates and hidden-record HTTP behavior.

## Rollback

Revert `AuthorizedPrincipal`, the three domain policies, shared authorization types, their focused tests, and this guide together. Later session, SQL, and API wiring is outside this work unit and is not removed by this rollback.
