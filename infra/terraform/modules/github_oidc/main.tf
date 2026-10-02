data "aws_partition" "current" {}

locals {
  partition         = data.aws_partition.current.partition
  oidc_host         = "token.actions.githubusercontent.com"
  oidc_provider_arn = var.create_provider ? aws_iam_openid_connect_provider.github[0].arn : var.oidc_provider_arn

  ecr_repository_arn              = "arn:${local.partition}:ecr:${var.region}:${var.account_id}:repository/${var.ecr_repository_name}"
  ecs_cluster_arn                 = "arn:${local.partition}:ecs:${var.region}:${var.account_id}:cluster/${var.ecs_cluster_name}"
  ecs_service_arn                 = "arn:${local.partition}:ecs:${var.region}:${var.account_id}:service/${var.ecs_cluster_name}/${var.ecs_service_name}"
  api_task_definition_pattern     = "arn:${local.partition}:ecs:${var.region}:${var.account_id}:task-definition/${var.api_task_definition_family}:*"
  one_off_task_definition_pattern = "arn:${local.partition}:ecs:${var.region}:${var.account_id}:task-definition/${var.one_off_task_definition_family}:*"
  execution_role_arn              = "arn:${local.partition}:iam::${var.account_id}:role/${var.execution_role_name}"
  task_role_arn                   = "arn:${local.partition}:iam::${var.account_id}:role/${var.task_role_name}"
  state_bucket_arn                = "arn:${local.partition}:s3:::${var.state_bucket_name}"
  state_object_arn                = "arn:${local.partition}:s3:::${var.state_bucket_name}/*"
  state_lock_arn                  = "arn:${local.partition}:s3:::${var.state_bucket_name}/${var.state_key}.tflock"
}

# AWS validates GitHub's certificate against its own trusted root CAs, so no
# thumbprint is configured. Source: GitHub changelog 2023-07-13
# "GitHub Actions OIDC integration with AWS no longer requires pinning of
# intermediate TLS certificates" and hashicorp/terraform-provider-aws#32480.
resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_provider ? 1 : 0

  url            = "https://${local.oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

data "aws_iam_policy_document" "assume_with_subject" {
  for_each = {
    plan   = "repo:${var.github_repository}:pull_request"
    deploy = "repo:${var.github_repository}:ref:refs/heads/main"
    apply  = "repo:${var.github_repository}:environment:${var.environment_name}"
  }

  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = [each.value]
    }
  }
}

resource "aws_iam_role" "plan" {
  name                 = "${var.name}-github-plan"
  assume_role_policy   = data.aws_iam_policy_document.assume_with_subject["plan"].json
  description          = "Read-only terraform plan role for GitHub pull requests"
  max_session_duration = 3600
  permissions_boundary = var.permissions_boundary_arn

  tags = merge(var.tags, { Name = "${var.name}-github-plan" })
}

resource "aws_iam_role" "deploy" {
  name                 = "${var.name}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.assume_with_subject["deploy"].json
  description          = "Image deploy role for pushes to main"
  max_session_duration = 3600
  permissions_boundary = var.permissions_boundary_arn

  tags = merge(var.tags, { Name = "${var.name}-github-deploy" })
}

resource "aws_iam_role" "apply" {
  name                 = "${var.name}-github-apply"
  assume_role_policy   = data.aws_iam_policy_document.assume_with_subject["apply"].json
  description          = "Terraform apply/destroy role, gated by the ${var.environment_name} environment"
  max_session_duration = 3600
  permissions_boundary = var.permissions_boundary_arn

  tags = merge(var.tags, { Name = "${var.name}-github-apply" })
}

# Plan: read-only service discovery plus state read and lock-file write.
data "aws_iam_policy_document" "plan" {
  statement {
    sid    = "DescribeForPlan"
    effect = "Allow"

    actions = [
      "ec2:Describe*",
      "rds:Describe*",
      "rds:ListTagsForResource",
      "ecs:Describe*",
      "ecs:List*",
      "ecr:Describe*",
      "ecr:List*",
      "ecr:GetLifecyclePolicy",
      "ecr:GetRepositoryPolicy",
      "elasticloadbalancing:Describe*",
      "cloudfront:Get*",
      "cloudfront:List*",
      "secretsmanager:DescribeSecret",
      "secretsmanager:ListSecrets",
      "secretsmanager:GetResourcePolicy",
      "sns:GetTopicAttributes",
      "sns:ListTopics",
      "sns:ListTagsForResource",
      "cloudwatch:Describe*",
      "cloudwatch:Get*",
      "cloudwatch:List*",
      "logs:Describe*",
      "logs:ListTagsForResource",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:GetPolicy",
      "iam:GetPolicyVersion",
      "iam:GetOpenIDConnectProvider",
      "iam:List*",
      "kms:Describe*",
      "kms:List*",
      "budgets:ViewBudget",
      "budgets:DescribeBudget*",
      "sts:GetCallerIdentity",
    ]

    resources = ["*"]
  }

  statement {
    sid       = "StateRead"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectVersion", "s3:ListBucket", "s3:GetBucketLocation", "s3:GetBucketVersioning"]
    resources = [local.state_bucket_arn, local.state_object_arn]
  }

  # Pull requests run their own code with this role, so writes are limited to
  # the S3-native lock file: a PR can never overwrite or delete the state.
  statement {
    sid       = "StateLock"
    effect    = "Allow"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = [local.state_lock_arn]
  }
}

resource "aws_iam_role_policy" "plan" {
  name   = "${var.name}-github-plan"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan.json
}

# Deploy: push the one image, run the migrate task, roll the one service.
data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "EcrAuthorization"
    effect    = "Allow"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid    = "EcrPush"
    effect = "Allow"

    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]

    resources = [local.ecr_repository_arn]
  }

  statement {
    sid    = "RegisterTaskDefinition"
    effect = "Allow"

    # RegisterTaskDefinition cannot be scoped to a family: the ARN does not
    # exist until the revision is created.
    actions   = ["ecs:RegisterTaskDefinition"]
    resources = ["*"]
  }

  statement {
    sid       = "DescribeTaskDefinitions"
    effect    = "Allow"
    actions   = ["ecs:DescribeTaskDefinition"]
    resources = [local.api_task_definition_pattern, local.one_off_task_definition_pattern]
  }

  statement {
    sid    = "RunMigrationTask"
    effect = "Allow"

    # One task definition family, resolved to its newest revision, on this
    # cluster only: ecs:cluster is ARN-valued and ECS resolves a short cluster
    # name to its ARN before the condition is evaluated.
    actions   = ["ecs:RunTask"]
    resources = [local.one_off_task_definition_pattern]

    condition {
      test     = "StringEquals"
      variable = "ecs:cluster"
      values   = [local.ecs_cluster_arn]
    }
  }

  statement {
    sid    = "ReadMigrationTasks"
    effect = "Allow"

    # DescribeTasks and ListTasks have no resource-level permissions: they do
    # not support a task-definition ARN as a resource, so they stay on "*".
    actions   = ["ecs:DescribeTasks", "ecs:ListTasks"]
    resources = ["*"]
  }

  statement {
    sid       = "RollService"
    effect    = "Allow"
    actions   = ["ecs:DescribeServices", "ecs:UpdateService"]
    resources = [local.ecs_service_arn, local.ecs_cluster_arn]
  }

  statement {
    sid       = "PassTaskRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [local.execution_role_arn, local.task_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    sid       = "Identity"
    effect    = "Allow"
    actions   = ["sts:GetCallerIdentity"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "deploy" {
  name   = "${var.name}-github-deploy"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

# Apply: terraform needs create/update/delete across the demo services. It is
# broad within those services but bounded by service, scoped for IAM/S3, and
# only reachable through the protected environment above.
data "aws_iam_policy_document" "apply" {
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
    sid       = "State"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetBucket*", "s3:GetBucketLocation", "s3:GetBucketVersioning"]
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

    resources = ["arn:${local.partition}:iam::${var.account_id}:oidc-provider/${local.oidc_host}"]
  }

  # Roles and policies are limited to the project prefix, and creating, widening
  # or attaching anything to a role is only allowed while the CI permissions
  # boundary is attached: the apply role can never escalate past that ceiling.
  #   https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_boundaries.html
  #   https://docs.aws.amazon.com/service-authorization/latest/reference/list_iam.html
  statement {
    sid    = "ProjectRoles"
    effect = "Allow"

    actions = [
      "iam:DeleteRole",
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:DeleteRolePolicy",
      "iam:DetachRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateAssumeRolePolicy",
    ]

    resources = ["arn:${local.partition}:iam::${var.account_id}:role/${var.name}-*"]
  }

  statement {
    sid    = "ProjectRolesOnlyWithBoundary"
    effect = "Allow"

    actions = [
      "iam:CreateRole",
      "iam:PutRolePermissionsBoundary",
      "iam:PutRolePolicy",
      "iam:AttachRolePolicy",
    ]

    resources = ["arn:${local.partition}:iam::${var.account_id}:role/${var.name}-*"]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [var.permissions_boundary_arn]
    }
  }

  statement {
    sid       = "PassServiceRoles"
    effect    = "Allow"
    actions   = ["iam:PassRole"]
    resources = [local.execution_role_arn, local.task_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }

  statement {
    sid       = "ProjectPolicies"
    effect    = "Allow"
    actions   = ["iam:CreatePolicy", "iam:DeletePolicy", "iam:GetPolicy", "iam:GetPolicyVersion", "iam:ListPolicyVersions", "iam:CreatePolicyVersion", "iam:DeletePolicyVersion", "iam:TagPolicy", "iam:UntagPolicy"]
    resources = ["arn:${local.partition}:iam::${var.account_id}:policy/${var.name}-*"]
  }
}

resource "aws_iam_role_policy" "apply" {
  name   = "${var.name}-github-apply"
  role   = aws_iam_role.apply.id
  policy = data.aws_iam_policy_document.apply.json
}
