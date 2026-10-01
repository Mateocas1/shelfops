output "cursor_secret_arn" {
  description = "ARN of the CURSOR_SECRET secret."
  value       = aws_secretsmanager_secret.cursor_secret.arn
}

output "metrics_bearer_token_arn" {
  description = "ARN of the METRICS_BEARER_TOKEN secret."
  value       = aws_secretsmanager_secret.metrics_bearer_token.arn
}

output "database_url_arn" {
  description = "ARN of the DATABASE_URL secret, or null when no database is configured."
  value       = local.create_database_url ? aws_secretsmanager_secret.database_url[0].arn : null
}

output "oidc_client_secret_arn" {
  description = "ARN of the OIDC client secret, or null when OIDC is disabled."
  value       = local.create_oidc_secret ? aws_secretsmanager_secret.oidc_client_secret[0].arn : null
}
