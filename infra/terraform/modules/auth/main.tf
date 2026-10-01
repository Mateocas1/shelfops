locals {
  domain_prefix = var.domain_prefix != "" ? var.domain_prefix : "${var.name}-${random_string.domain_suffix[0].result}"
  issuer_url    = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.this.id}"
  hosted_ui_url = "https://${local.domain_prefix}.auth.${var.aws_region}.amazoncognito.com"
}

resource "random_string" "domain_suffix" {
  count = var.domain_prefix == "" ? 1 : 0

  length  = 6
  lower   = true
  upper   = false
  numeric = true
  special = false
}

resource "aws_cognito_user_pool" "this" {
  # Advanced security (threat protection) is deliberately left off: it is the
  # paid tier, while this demo stays inside the free Lite/Essentials MAU
  # allowance. checkov has no user-pool rule for it, so there is no skip here.
  name                     = "${var.name}-users"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = var.mfa_configuration
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"
  # Users are created by an operator with the CLI, never by self-signup.
  admin_create_user_config {
    allow_admin_create_user_only = true
  }

  password_policy {
    minimum_length                   = var.password_minimum_length
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  tags = var.tags
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = local.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_client" "this" {
  # The API exchanges the authorization code with ClientSecretBasic and PKCE
  # S256, so the client needs a generated secret.
  name         = "${var.name}-api"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret = true

  allowed_oauth_flows                  = ["code"]
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["COGNITO"]

  callback_urls = var.callback_urls
  logout_urls   = var.logout_urls

  # Hosted UI signs in with SRP; refresh tokens rotate without a password.
  explicit_auth_flows = ["ALLOW_USER_SRP_AUTH", "ALLOW_REFRESH_TOKEN_AUTH"]

  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"
}
