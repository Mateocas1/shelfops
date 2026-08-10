# OIDC session boundary

ShelfOps uses an OIDC Authorization Code BFF boundary: the browser keeps no provider access token. After a successful callback, the API owns an opaque session identifier and sends it only as an `HttpOnly`, `Secure`, `SameSite=Lax` `shelfops_session` cookie.

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
