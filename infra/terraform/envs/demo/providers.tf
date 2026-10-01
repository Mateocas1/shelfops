locals {
  localstack_enabled = var.localstack ? [1] : []
}

provider "aws" {
  region = var.aws_region

  access_key                  = var.localstack ? "test" : null
  secret_key                  = var.localstack ? "test" : null
  skip_credentials_validation = var.localstack
  skip_metadata_api_check     = var.localstack
  skip_requesting_account_id  = var.localstack
  s3_use_path_style           = var.localstack

  dynamic "endpoints" {
    for_each = local.localstack_enabled
    content {
      s3                     = var.localstack_endpoint
      ecr                    = var.localstack_endpoint
      ecs                    = var.localstack_endpoint
      rds                    = var.localstack_endpoint
      elasticloadbalancingv2 = var.localstack_endpoint
      cloudfront             = var.localstack_endpoint
      secretsmanager         = var.localstack_endpoint
      cloudwatch             = var.localstack_endpoint
      logs                   = var.localstack_endpoint
      sns                    = var.localstack_endpoint
      iam                    = var.localstack_endpoint
      sts                    = var.localstack_endpoint
      ec2                    = var.localstack_endpoint
      kms                    = var.localstack_endpoint
      budgets                = var.localstack_endpoint
    }
  }

  default_tags {
    tags = {
      Project     = var.project
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
