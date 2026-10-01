output "cloudfront_domain_name" {
  description = "HTTPS entry point (default CloudFront domain)."
  value       = try(module.ingress[0].distribution_domain_name, null)
}

output "aws_region" {
  description = "AWS region the demo is deployed into."
  value       = var.aws_region
}

output "smoke_url" {
  description = "Readiness URL through CloudFront."
  value       = try("https://${module.ingress[0].distribution_domain_name}/ready", null)
}

output "alb_dns_name" {
  description = "ALB DNS name (reachable only from CloudFront)."
  value       = try(module.ingress[0].alb_dns_name, null)
}

output "ecr_repository_url" {
  description = "Push the API image here."
  value       = try(module.compute[0].ecr_repository_url, null)
}

output "ecs_cluster_name" {
  description = "ECS cluster name."
  value       = try(module.compute[0].cluster_name, null)
}

output "ecs_service_name" {
  description = "ECS service name."
  value       = try(module.compute[0].service_name, null)
}

output "one_off_task_definition_arn" {
  description = "Task definition for the migrate and seed-tenant one-off tasks."
  value       = try(module.compute[0].one_off_task_definition_arn, null)
}

output "log_group_name" {
  description = "CloudWatch log group."
  value       = try(module.compute[0].log_group_name, null)
}

output "rds_address" {
  description = "RDS endpoint hostname."
  value       = local.database_address
  sensitive   = true
}

output "database_url_secret_arn" {
  description = "Secrets Manager ARN holding DATABASE_URL."
  value       = module.secrets.database_url_arn
  sensitive   = true
}

output "dashboard_name" {
  description = "CloudWatch dashboard name."
  value       = module.observability.dashboard_name
}

output "alarm_topic_arn" {
  description = "SNS topic receiving every alarm."
  value       = module.observability.alarm_topic_arn
}

output "github_plan_role_arn" {
  description = "Set as the AWS_PLAN_ROLE_ARN GitHub variable."
  value       = try(module.github_oidc[0].plan_role_arn, null)
}

output "github_deploy_role_arn" {
  description = "Set as the AWS_DEPLOY_ROLE_ARN GitHub variable."
  value       = try(module.github_oidc[0].deploy_role_arn, null)
}

output "github_apply_role_arn" {
  description = "Set as the AWS_APPLY_ROLE_ARN GitHub variable."
  value       = try(module.github_oidc[0].apply_role_arn, null)
}

output "private_subnet_ids" {
  description = "Private subnets used by one-off tasks and RDS."
  value       = local.network_private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnets used by the ALB and the API task."
  value       = local.network_public_subnet_ids
}

output "task_security_group_id" {
  description = "Security group for the API and one-off tasks."
  value       = local.network_task_security_group_id
}

output "migrate_task_command" {
  description = "Ready-to-run aws ecs run-task command for migrations."
  value = try(
    "aws ecs run-task --cluster ${module.compute[0].cluster_name} --task-definition ${module.compute[0].one_off_task_definition_arn} --launch-type FARGATE --network-configuration \"awsvpcConfiguration={subnets=[${join(",", local.network_public_subnet_ids)}],securityGroups=[${local.network_task_security_group_id}],assignPublicIp=ENABLED}\"",
    null
  )
}

output "seed_tenant_task_command" {
  description = "Ready-to-run aws ecs run-task command for `seed-tenant`, overriding the container command."
  value = try(
    "aws ecs run-task --cluster ${module.compute[0].cluster_name} --task-definition ${module.compute[0].one_off_task_definition_arn} --launch-type FARGATE --network-configuration \"awsvpcConfiguration={subnets=[${join(",", local.network_public_subnet_ids)}],securityGroups=[${local.network_task_security_group_id}],assignPublicIp=ENABLED}\" --overrides '{\"containerOverrides\":[{\"name\":\"one-off\",\"command\":[\"node\",\"scripts/seed-tenant.cjs\",\"--org-slug\",\"<slug>\",\"--org-name\",\"<name>\",\"--store-code\",\"<code>\",\"--store-name\",\"<name>\",\"--user-email\",\"<email>\",\"--oidc-issuer\",\"<issuer>\",\"--oidc-subject\",\"<subject>\"]}]}'",
    null
  )
}

output "cognito_user_pool_id" {
  description = "Cognito User Pool id, or null when enable_auth is off."
  value       = try(module.auth[0].user_pool_id, null)
}

output "cognito_hosted_ui_domain" {
  description = "Cognito Hosted UI prefix domain, or null when enable_auth is off."
  value       = try(module.auth[0].hosted_ui_domain, null)
}

output "oidc_issuer" {
  description = "Effective SHELFOPS_OIDC_ISSUER (Cognito pool endpoint when enable_auth is on)."
  value       = local.auth_issuer
}

output "oidc_client_id" {
  description = "Effective SHELFOPS_OIDC_CLIENT_ID."
  value       = local.auth_client_id
}

output "oidc_callback_url" {
  description = "Effective SHELFOPS_OIDC_CALLBACK_URL."
  value       = local.auth_callback_url
}

output "oidc_destination_url" {
  description = "Effective SHELFOPS_OIDC_DESTINATION_URL."
  value       = local.auth_destination_url
}
