# Bootstrap a tenant

`seed:tenant` creates the organization, one store, one user with a role, and the OIDC identity mapping for that user in a single transaction. Running it again with the same input changes nothing and reports `unchanged`, so it is safe to run before every deploy.

The command never prints or stores credentials. It uses the same `DATABASE_SSL_MODE` and `DATABASE_SSL_CA_PATH` rules as the API and migrations image.

## Local run

Set `DATABASE_URL`, then run from the repository root:

```sh
pnpm seed:tenant -- \
  --org-slug acme-retail \
  --org-name "Acme Retail" \
  --store-code store-001 \
  --store-name "Acme Downtown" \
  --user-email ops@acme.example \
  --user-name "Operations Lead" \
  --user-role supervisor \
  --oidc-issuer https://idp.acme.example \
  --oidc-subject subject-001
```

| Flag | Environment fallback | Required | Notes |
| --- | --- | --- | --- |
| `--org-slug` | `SHELFOPS_SEED_ORG_SLUG` | yes | Lowercase slug. Organizations are a schema-enforced singleton, so the existing organization adopts this slug. |
| `--org-name` | `SHELFOPS_SEED_ORG_NAME` | yes | Display name. |
| `--store-code` | `SHELFOPS_SEED_STORE_CODE` | yes | Lowercase natural key for the store; unique per organization. |
| `--store-name` | `SHELFOPS_SEED_STORE_NAME` | yes | Display name. |
| `--user-email` | `SHELFOPS_SEED_USER_EMAIL` | yes | Lowercase natural key for the user; unique per organization. |
| `--user-name` | `SHELFOPS_SEED_USER_NAME` | no | Defaults to the email. |
| `--user-role` | `SHELFOPS_SEED_USER_ROLE` | no | One of `collaborator`, `sector-lead`, `supervisor`, `inventory-team`, `central-operations`; defaults to `supervisor`. The user is also scoped to the store. |
| `--oidc-issuer` | `SHELFOPS_SEED_OIDC_ISSUER` | yes | HTTPS URL without a trailing slash. |
| `--oidc-subject` | `SHELFOPS_SEED_OIDC_SUBJECT` | yes | Provider subject for this user. |

Values can come from CLI flags or the matching environment variable. Invalid or missing input aborts before any write.

## One-off container task

The migrations image also ships the compiled seed script:

```sh
docker build --platform linux/amd64 --file Dockerfile.api --target migrate --tag shelfops-migrate:local .

docker run --rm \
  --entrypoint node \
  --env DATABASE_URL \
  --env DATABASE_SSL_MODE=verify-full \
  shelfops-migrate:local scripts/seed-tenant.cjs \
  --org-slug acme-retail --org-name "Acme Retail" \
  --store-code store-001 --store-name "Acme Downtown" \
  --user-email ops@acme.example --user-role supervisor \
  --oidc-issuer https://idp.acme.example --oidc-subject subject-001
```

## Output

Both commands write one machine-readable JSON object:

```json
{"status":"created","organizationId":"...","storeId":"...","userId":"...","identityMapping":{"issuer":"https://idp.acme.example","subject":"subject-001"},"created":["store","user","user-role","user-store-scope"],"updated":["organization"]}
```

`status` is `created` when the run inserted anything, `updated` when it only changed display names, and `unchanged` when it wrote nothing. Failures exit nonzero with `{"status":"failed","error":"<code>","detail":"<safe detail>"}`. An `oidc-identity-conflict` means the `(issuer, subject)` pair is already mapped to a different user; nothing from that run is committed.
