output "user_pool_id" {
  description = "Cognito User Pool identifier."
  value       = aws_cognito_user_pool.this.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN."
  value       = aws_cognito_user_pool.this.arn
}

output "issuer_url" {
  description = "OIDC issuer for SHELFOPS_OIDC_ISSUER (the pool endpoint)."
  value       = local.issuer_url
}

output "client_id" {
  description = "App client id for SHELFOPS_OIDC_CLIENT_ID."
  value       = aws_cognito_user_pool_client.this.id
}

output "client_secret" {
  description = "App client secret for SHELFOPS_OIDC_CLIENT_SECRET (stored in Secrets Manager)."
  value       = aws_cognito_user_pool_client.this.client_secret
  sensitive   = true
}

output "hosted_ui_domain" {
  description = "Cognito Hosted UI prefix domain."
  value       = aws_cognito_user_pool_domain.this.domain
}

output "hosted_ui_url" {
  description = "Hosted UI base URL."
  value       = local.hosted_ui_url
}

output "authorize_url" {
  description = "OAuth authorization endpoint used by the browser login."
  value       = "${local.hosted_ui_url}/oauth2/authorize"
}

output "token_url" {
  description = "OAuth token endpoint advertised by discovery."
  value       = "${local.hosted_ui_url}/oauth2/token"
}

output "logout_url" {
  description = "Hosted UI logout endpoint."
  value       = "${local.hosted_ui_url}/logout"
}

output "callback_urls" {
  description = "Registered OAuth callback URLs."
  value       = aws_cognito_user_pool_client.this.callback_urls
}
