# API walkthrough without a UI

ShelfOps has no browser UI. Login is an OIDC authorization-code BFF: the browser
starts at the API, signs in at the provider Hosted UI, and comes back with an
opaque session cookie. This page gets that session and drives the portfolio flow
(`open -> evaluated -> classified`) with curl.

The route/body shapes below match `openapi/openapi.json` and the payloads in
`scripts/demo.ts`; the auth behavior matches `apps/api/src/auth/` and
[authentication.md](authentication.md).

## Prerequisites

- The demo root applied with `enable_auth = true` (Cognito) and reachable at its
  CloudFront domain.
- A Cognito user mapped to a tenant by `seed:tenant`.
  `scripts/cognito-demo-setup.sh` prints the exact commands from the Terraform
  outputs (create user, read `sub`, run the one-off seed task).
- Reference data for the incident: a store (created by `seed:tenant`) plus a
  sector, location and product (see [reference-data.md](reference-data.md);
  `scripts/demo.ts` shows a complete fixture).

## 1. Create the user and the mapping

```sh
scripts/cognito-demo-setup.sh
```

It prints, without running them:

1. `aws cognito-idp admin-create-user` + `admin-set-user-password` for the demo
   email (the password must satisfy the pool policy: 12+ chars, upper, lower,
   digit, symbol).
2. `aws cognito-idp admin-get-user --query 'UserAttributes[?Name==`sub`]...'` to
   read the OIDC subject.
3. The `seed-tenant` one-off ECS task command from `terraform output
   seed_tenant_task_command`. Fill the `<...>` placeholders and pass
   `--oidc-issuer "$(terraform -chdir=infra/terraform/envs/demo output -raw oidc_issuer)"`
   with the subject from step 2.

## 2. Get a session

Open the login URL in a browser:

```sh
echo "https://$(terraform -chdir=infra/terraform/envs/demo output -raw cloudfront_domain_name)/auth/login"
```

The API redirects to the Cognito Hosted UI. After signing in it sets two cookies
and redirects to the `SHELFOPS_OIDC_DESTINATION_URL`
(`https://<cloudfront-domain>/api/v1/me` by default), which prints the principal.

Copy both cookies:

- `shelfops_session` — `HttpOnly`; authenticates every request.
- `shelfops_csrf` — readable; send its value as `X-CSRF-Token` on mutations.

```sh
ORIGIN="https://$(terraform -chdir=infra/terraform/envs/demo output -raw cloudfront_domain_name)"
SESSION="<shelfops_session value>"
CSRF="<shelfops_csrf value>"
```

Reads only need the session cookie; every `POST` must also send the CSRF header,
or the API answers `403 forbidden`.

## 3. Read the principal

```sh
curl -sS -b "shelfops_session=$SESSION" "$ORIGIN/api/v1/me"
```

## 4. Demo flow: open -> evaluated -> classified

Set the ids used by the incident: `STORE_ID` comes from `seed:tenant`; the rest
from the reference data.

```sh
STORE_ID="<store uuid>"; SECTOR_ID="<sector uuid>"
LOCATION_ID="<location uuid>"; PRODUCT_ID="<product uuid>"
AUTH=(-b "shelfops_session=$SESSION" -H "x-csrf-token: $CSRF" -H "content-type: application/json")
```

Create the incident (`open@v1`):

```sh
INCIDENT=$(curl -sS "${AUTH[@]}" -X POST "$ORIGIN/api/v1/incidents" -d "{
  \"storeId\": \"$STORE_ID\", \"sectorId\": \"$SECTOR_ID\",
  \"locationId\": \"$LOCATION_ID\", \"productId\": \"$PRODUCT_ID\",
  \"category\": \"out-of-stock\", \"severity\": \"high\",
  \"title\": \"Empty shelf in aisle 7\",
  \"description\": \"Reviewer observed the last unit was sold.\",
  \"occurredAt\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
  \"textEvidence\": \"Shelf and backroom were checked.\",
  \"idempotencyKey\": \"walkthrough-create\"
}")
INCIDENT_ID=$(echo "$INCIDENT" | python3 -c 'import json,sys;print(json.load(sys.stdin)["incidentId"])')
VERSION=$(echo "$INCIDENT" | python3 -c 'import json,sys;print(json.load(sys.stdin)["version"])')
```

Evaluate triage (`evaluated@v2`):

```sh
EVALUATION=$(curl -sS "${AUTH[@]}" -X POST \
  "$ORIGIN/api/v1/incidents/$INCIDENT_ID/triage/evaluations" \
  -d "{\"expectedVersion\": $VERSION, \"idempotencyKey\": \"walkthrough-evaluate\"}")
EVALUATION_ID=$(echo "$EVALUATION" | python3 -c 'import json,sys;print(json.load(sys.stdin)["evaluation"]["id"])')
TRIAGE_VERSION=$(echo "$EVALUATION" | python3 -c 'import json,sys;print(json.load(sys.stdin)["triage"]["version"])')
```

Read the awaiting-decision projection:

```sh
curl -sS -b "shelfops_session=$SESSION" "$ORIGIN/api/v1/incidents/$INCIDENT_ID/triage"
```

Confirm the suggestions (`classified@v3`):

```sh
curl -sS "${AUTH[@]}" -X POST "$ORIGIN/api/v1/incidents/$INCIDENT_ID/triage/decisions" -d "{
  \"evaluationId\": \"$EVALUATION_ID\",
  \"expectedVersion\": $TRIAGE_VERSION,
  \"idempotencyKey\": \"walkthrough-decide\",
  \"complete\": true,
  \"decisions\": [
    {\"field\": \"category\", \"disposition\": \"confirmed\", \"value\": \"out-of-stock\"},
    {\"field\": \"severity\", \"disposition\": \"confirmed\", \"value\": \"high\"},
    {\"field\": \"assignee\", \"disposition\": \"confirmed\", \"value\": \"<assigneeUserId>\"}
  ]
}"
```

Read the final state and history:

```sh
curl -sS -b "shelfops_session=$SESSION" "$ORIGIN/api/v1/incidents/$INCIDENT_ID"
curl -sS -b "shelfops_session=$SESSION" "$ORIGIN/api/v1/incidents/$INCIDENT_ID/triage"
```

The expected transition is `open@v1 -> evaluated@v2 -> classified@v3`; the
assignee value is the `assigneeUserId` from the evaluation response.

## 5. Log out

```sh
curl -sS -o /dev/null -w '%{http_code}\n' "${AUTH[@]}" -X POST "$ORIGIN/auth/logout"
```

`204` means the local session was revoked and both cookies were expired.
