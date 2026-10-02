data "aws_partition" "current" {}

locals {
  partition = data.aws_partition.current.partition

  # Built from the name so the policy document can reference its own ARN; the
  # terraform_data check below fails loudly if it ever drifts from the real one.
  boundary_arn      = "arn:${local.partition}:iam::${var.account_id}:policy/${var.name}-ci-boundary"
  role_pattern      = "arn:${local.partition}:iam::${var.account_id}:role/${var.name}-*"
  policy_pattern    = "arn:${local.partition}:iam::${var.account_id}:policy/${var.name}-*"
  oidc_provider_arn = "arn:${local.partition}:iam::${var.account_id}:oidc-provider/token.actions.githubusercontent.com"
  state_bucket_arn  = "arn:${local.partition}:s3:::${var.state_bucket_name}"
  state_object_arn  = "arn:${local.partition}:s3:::${var.state_bucket_name}/*"
}

# Permission ceiling for every role this stack creates. It grants nothing: the
# role's identity policies still decide what it may do, and the intersection of
# both is what it can actually do. The apply role's own policy requires this
# boundary through the iam:PermissionsBoundary condition, so every role it
# creates or edits inherits the same ceiling and cannot outgrow it.
#
# AWS-documented pattern for delegating IAM with a permissions boundary:
#   https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html
# iam:PermissionsBoundary is a documented condition key for exactly the four
# actions guarded below (CreateRole, PutRolePermissionsBoundary, PutRolePolicy
# and AttachRolePolicy), and the delegation example conditions AttachRolePolicy
# the same way:
#   https://docs.aws.amazon.com/service-authorization/latest/reference/list_iam.html
#   https://aws.amazon.com/blogs/security/delegate-permission-management-to-developers-using-iam-permissions-boundaries/
# "Changing and modifying a permissions boundary is a powerful permission. You
# should reserve this permission for full administrators in an account."
data "aws_iam_policy_document" "boundary" {
  # The demo services terraform manages. IAM is deliberately absent here: it is
  # scoped to the project's own roles, policies and OIDC provider below.
  statement {
    sid    = "DemoServices"
    effect = "Allow"

    actions = [
      "ec2:*",
      "rds:*",
      "ecs:*",
      "ecr:*",
      "elasticloadbalancing:*",
      "cloudfront:*",
      "sns:*",
      "cloudwatch:*",
      "logs:*",
      "secretsmanager:*",
      "budgets:*",
      "kms:Describe*",
      "kms:List*",
      "kms:CreateGrant",
      "kms:RevokeGrant",
      "sts:GetCallerIdentity",
    ]

    resources = ["*"]
  }

  statement {
    sid    = "TerraformState"
    effect = "Allow"

    actions = [
      "s3:GetObject",
      "s3:GetObjectVersion",
      "s3:PutObject",
      "s3:DeleteObject",
      "s3:ListBucket",
      "s3:GetBucket*",
      "s3:GetBucketLocation",
      "s3:GetBucketVersioning",
    ]

    resources = [local.state_bucket_arn, local.state_object_arn]
  }

  statement {
    sid    = "OidcProvider"
    effect = "Allow"

    actions = [
      "iam:CreateOpenIDConnectProvider",
      "iam:DeleteOpenIDConnectProvider",
      "iam:GetOpenIDConnectProvider",
      "iam:TagOpenIDConnectProvider",
      "iam:UntagOpenIDConnectProvider",
      "iam:UpdateOpenIDConnectProviderThumbprint",
    ]

    resources = [local.oidc_provider_arn]
  }

  # Read-only IAM discovery for terraform plan.
  statement {
    sid    = "ReadProjectIam"
    effect = "Allow"

    actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:GetOpenIDConnectProvider",
      "iam:List*",
    ]

    resources = ["*"]
  }

  # Escalation guard: roles can only be created or made more permissive while
  # this very boundary is attached to them.
  statement {
    sid    = "ChangeRolesOnlyWithThisBoundary"
    effect = "Allow"

    actions = [
      "iam:CreateRole",
      "iam:PutRolePermissionsBoundary",
      "iam:PutRolePolicy",
      "iam:AttachRolePolicy",
    ]

    resources = [local.role_pattern]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.boundary_arn]
    }
  }

  statement {
    sid    = "ProjectRoles"
    effect = "Allow"

    actions = [
      "iam:DeleteRole",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
    ]

    resources = [local.role_pattern]
  }

  statement {
    sid    = "ProjectPolicies"
    effect = "Allow"

    actions = [
      "iam:CreatePolicy",
      "iam:DeletePolicy",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:ListPolicyVersions",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicyVersion",
      "iam:TagPolicy",
      "iam:UntagPolicy",
    ]

    resources = [local.policy_pattern]
  }

  # The deploy and apply roles hand project roles to ECS and to nothing else.
  statement {
    sid       = "PassServiceRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [local.role_pattern]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  # Explicit denials, so the ceiling holds even if an identity policy above grows
  # a broader grant: nothing may create or widen a project role without this
  # boundary, and nobody may rewrite, delete or detach the boundary itself.
  statement {
    sid    = "DenyRolesWithoutThisBoundary"
    effect = "Deny"

    actions = [
      "iam:CreateRole",
      "iam:PutRolePermissionsBoundary",
      "iam:PutRolePolicy",
      "iam:AttachRolePolicy",
    ]

    resources = [local.role_pattern]

    condition {
      test     = "StringNotEquals"
      variable = "iam:PermissionsBoundary"
      values   = [local.boundary_arn]
    }
  }

  statement {
    sid    = "DenyBoundaryRewrites"
    effect = "Deny"

    actions = [
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
    ]

    resources = [local.boundary_arn]
  }

  statement {
    sid       = "DenyBoundaryDetach"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary"]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "boundary" {
  name        = "${var.name}-ci-boundary"
  description = "Permission ceiling for every role created by the ${var.name} stack"
  policy      = data.aws_iam_policy_document.boundary.json

  tags = merge(var.tags, { Name = "${var.name}-ci-boundary" })
}

# local.boundary_arn is written into the conditions above; if it stopped matching
# the real policy ARN those conditions would silently never match and the
# escalation guard would be gone, so fail the apply instead.
resource "terraform_data" "boundary_arn_matches" {
  lifecycle {
    precondition {
      condition     = local.boundary_arn == aws_iam_policy.boundary.arn
      error_message = "local.boundary_arn must match the created boundary policy ARN."
    }
  }
}
