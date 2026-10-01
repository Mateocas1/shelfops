output "oidc_provider_arn" {
  description = "ARN of the GitHub OIDC provider."
  value       = local.oidc_provider_arn
}

output "plan_role_arn" {
  description = "Read-only role for terraform plan on pull requests."
  value       = aws_iam_role.plan.arn
}

output "deploy_role_arn" {
  description = "Deploy role for pushes to main."
  value       = aws_iam_role.deploy.arn
}

output "apply_role_arn" {
  description = "Terraform apply/destroy role gated by the protected environment."
  value       = aws_iam_role.apply.arn
}
