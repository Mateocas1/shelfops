#!/usr/bin/env bash
# Prints the Cognito + seed-tenant commands for the ShelfOps demo.
#
# It only reads `terraform output` and echoes commands: it never creates a user,
# runs a task, or touches AWS. Review the output, then paste what you need.
#
# Usage:
#   scripts/cognito-demo-setup.sh
#   TF_DIR=infra/terraform/envs/demo scripts/cognito-demo-setup.sh
#
# Override the tenant fields with environment variables (defaults below).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TF_DIR="${TF_DIR:-$ROOT/infra/terraform/envs/demo}"

ORG_SLUG="${ORG_SLUG:-shelfops-demo}"
ORG_NAME="${ORG_NAME:-ShelfOps Demo}"
STORE_CODE="${STORE_CODE:-store-001}"
STORE_NAME="${STORE_NAME:-Demo Store}"
USER_EMAIL="${USER_EMAIL:-demo@shelfops.example}"
USER_NAME="${USER_NAME:-Demo User}"
USER_ROLE="${USER_ROLE:-supervisor}"

output() { terraform -chdir="$TF_DIR" output -raw "$1" 2>/dev/null || true; }

REGION="$(output aws_region)"
POOL_ID="$(output cognito_user_pool_id)"
ISSUER="$(output oidc_issuer)"
CLOUDFRONT="$(output cloudfront_domain_name)"
DESTINATION="$(output oidc_destination_url)"
SEED_TASK="$(output seed_tenant_task_command)"

if [[ -z "$POOL_ID" ]]; then
  echo "No Cognito pool in Terraform state. Apply the demo root with enable_auth = true first." >&2
  exit 1
fi

cat <<EOF
# ShelfOps demo: Cognito user + tenant seed (region ${REGION:-us-east-1})
#
# 1. Create the demo user. The password must satisfy the pool policy:
#    12+ characters with upper, lower, digit and symbol.
aws cognito-idp admin-create-user \\
  --region ${REGION:-us-east-1} \\
  --user-pool-id $POOL_ID \\
  --username $USER_EMAIL \\
  --user-attributes Name=email,Value=$USER_EMAIL Name=email_verified,Value=true \\
  --message-action SUPPRESS

aws cognito-idp admin-set-user-password \\
  --region ${REGION:-us-east-1} \\
  --user-pool-id $POOL_ID \\
  --username $USER_EMAIL \\
  --password 'REPLACE-WITH-A-STRONG-PASSWORD' \\
  --permanent

# 2. Read the user's "sub" (the OIDC subject seed:tenant maps to this user).
aws cognito-idp admin-get-user \\
  --region ${REGION:-us-east-1} \\
  --user-pool-id $POOL_ID \\
  --username $USER_EMAIL \\
  --query 'UserAttributes[?Name==\`sub\`].Value | [0]' \\
  --output text

# 3. Seed the tenant and the OIDC mapping with the one-off ECS task below.
#    Replace every <...> placeholder. Use the issuer and the subject from above:
#      --oidc-issuer  $ISSUER
#      --oidc-subject <sub printed in step 2>
#    Suggested tenant fields:
#      --org-slug $ORG_SLUG --org-name "$ORG_NAME"
#      --store-code $STORE_CODE --store-name "$STORE_NAME"
#      --user-email $USER_EMAIL --user-name "$USER_NAME" --user-role $USER_ROLE
$SEED_TASK

# 4. Browser login without a UI: open this URL, sign in on the Hosted UI, and the
#    API redirects to $DESTINATION with the session cookies set.
https://$CLOUDFRONT/auth/login

# 5. Copy shelfops_session (HttpOnly) and shelfops_csrf from the browser, then
#    follow docs/api-walkthrough.md for the curl requests.
EOF
