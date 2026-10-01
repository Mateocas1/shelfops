# OIDC session boundary

ShelfOps uses an OIDC Authorization Code BFF boundary: the browser keeps no provider access token. After a successful callback, the API owns an opaque session identifier and sends it only as an `HttpOnly`, `Secure`, `SameSite=Lax` `shelfops_session` cookie.

## Production configuration

Configure all variables below or none. A partial bundle aborts startup before listening.

| Variable | Constraint |
| --- | --- |
| `SHELFOPS_OIDC_ISSUER` | Fixed HTTPS issuer URL |
| `SHELFOPS_OIDC_CLIENT_ID` / `SHELFOPS_OIDC_CLIENT_SECRET` | Nonblank provider credentials |
| `SHELFOPS_OIDC_CALLBACK_URL` | Fixed HTTPS URL ending exactly in `/auth/callback` |
| `SHELFOPS_OIDC_DESTINATION_URL` | Fixed HTTPS post-login destination |
| `SHELFOPS_OIDC_ORGANIZATION_ID` | Organization UUID that owns every accepted mapping and revocation |
| `SHELFOPS_OIDC_SESSION_TTL_SECONDS` | 60–2,592,000 seconds |
| `SHELFOPS_OIDC_PROVIDER_TIMEOUT_SECONDS` | 1–30 seconds |

The unpublished browser surface is exactly `GET /auth/login`, `GET /auth/callback`, and CSRF-protected `POST /auth/logout`. Logout revokes the authenticated local session before expiring its cookies. Failure responses contain only stable messages and correlation IDs.

## Runtime proof

Run `pnpm oidc:proof`. It uses the pinned loopback issuer from `infra/compose.oidc.yml`, bounded HTTP waits, a fixed Compose project, and unconditional cleanup. The proof exercises login, callback, local session creation, callback replay rejection, and logout revocation. Loopback HTTP is test-only; production configuration still requires HTTPS.

Deferred behavior remains absent: auto-provisioning, claim-derived authorization, provider logout, browser UI/E2E, production provider onboarding or secrets, and migration cleanup or constraint validation. Entrypoint hardening outside this boundary (rate limiting, CORS policy, and proxy trust) is documented in [Run the production API container](operations/container.md).

To roll back this unit, remove runtime proof and logout registration, then remove startup OIDC composition and operator configuration guidance. Keep the login/callback foundation and migration from the earlier units. Full capability rollback proceeds in reverse unit order and requires no schema rollback for this unit.

## Login persistence foundation

Migration 012 and `PostgresOidcLoginStore` provide provider-neutral persistence only. They hash authorization state, consume it once, resolve only an exact pre-provisioned `(issuer, subject)` mapping to an active organization user, create hash-only local session and CSRF credentials, and revoke a user session within its organization. Unknown, expired, and replayed state have the same safe result, and every operation participates in a caller-owned PostgreSQL transaction when needed.

The persistence foundation in this section validates no provider tokens, permits no production provider, and auto-provisions no identities from email or claims; the `GET /auth/login` and `GET /auth/callback` routes above are provided by the OIDC runtime layer. HTTPS issuers are canonicalized at the store boundary; loopback HTTP is permitted only for tests.

Migration 012 installs `sessions_bounded_expiry` as `NOT VALID`: sessions created before 012 may retain lifetimes over 30 days, while PostgreSQL rejects every new or updated session that violates the bound. PU-07B must clean up or expire incompatible legacy rows, then explicitly validate the constraint; operators must not validate it before that cleanup.

Operational cleanup may delete expired authorization transactions by `expires_at`. Rollback requires removing code use first, then dropping `oidc_authorization_transactions`, `oidc_identity_mappings`, and `sessions_bounded_expiry`; no production identities are seeded.

## Current user

`GET /api/v1/me` returns the active ShelfOps principal from the server-side session lookup. Client actor, role, scope, organization, and audit claims are ignored. Every lookup rechecks session expiry/revocation and the current user activity, roles, scopes, responsibilities, and grants.

Authentication failures return only `authentication-required` and a correlation ID. They never return a cookie, session ID, token, provider response, or user existence detail. The deterministic examples in `openapi/examples/auth/` contain no credentials.

## Cookie and CSRF rules

- The opaque session ID has 256 bits of randomness and is stored as a hash in PostgreSQL.
- Cookie-authenticated future `/api/v1/me/*` mutations must send the matching `X-CSRF-Token`; the auth boundary rejects missing or mismatched values before the route handler runs.
- Production composition rejects development identity adapters. With no production lookup configured, the route remains registered and denies authentication rather than treating a test adapter as production authentication.

## Local development issuer

`infra/compose.oidc.yml` starts only `ghcr.io/navikt/mock-oauth2-server`, a disposable local mock issuer. It is not a pilot or production provider selection. Start it with `docker compose -f infra/compose.oidc.yml up -d`, wait for `http://127.0.0.1:18080/isalive`, verify its `default` issuer discovery document at `http://127.0.0.1:18080/default/.well-known/openid-configuration`, then stop it with `docker compose -f infra/compose.oidc.yml down --volumes --remove-orphans`.

The concrete pilot OIDC provider, client registration, session lifetime, revocation policy, and credentials remain deferred. Roll back this boundary by removing the `buildApi()` auth registration, auth module, identity session port/adapter, migration, examples, guide, and local compose overlay together; `/health` remains available.
