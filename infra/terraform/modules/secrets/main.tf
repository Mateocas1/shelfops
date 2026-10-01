locals {
  create_database_url = var.database_address != null
  database_url = local.create_database_url ? format(
    "postgresql://%s:%s@%s:%d/%s",
    var.database_username,
    urlencode(var.database_password),
    var.database_address,
    var.database_port,
    var.database_name,
  ) : null
  create_oidc_secret = var.oidc_client_secret != null
}

resource "random_password" "cursor_secret" {
  length  = 48
  special = false
}

resource "random_password" "metrics_bearer_token" {
  length  = 48
  special = false
}

#checkov:skip=CKV_AWS_149:AWS-managed encryption at rest is used to keep the demo free
resource "aws_secretsmanager_secret" "cursor_secret" {
  name                    = "${var.name}/CURSOR_SECRET"
  description             = "ShelfOps cursor signing secret"
  recovery_window_in_days = 0

  tags = { Name = "${var.name}-cursor-secret" }
}

resource "aws_secretsmanager_secret_version" "cursor_secret" {
  secret_id     = aws_secretsmanager_secret.cursor_secret.id
  secret_string = random_password.cursor_secret.result
}

#checkov:skip=CKV_AWS_149:AWS-managed encryption at rest is used to keep the demo free
resource "aws_secretsmanager_secret" "metrics_bearer_token" {
  name                    = "${var.name}/METRICS_BEARER_TOKEN"
  description             = "ShelfOps metrics scrape bearer token"
  recovery_window_in_days = 0

  tags = { Name = "${var.name}-metrics-token" }
}

resource "aws_secretsmanager_secret_version" "metrics_bearer_token" {
  secret_id     = aws_secretsmanager_secret.metrics_bearer_token.id
  secret_string = random_password.metrics_bearer_token.result
}

#checkov:skip=CKV_AWS_149:AWS-managed encryption at rest is used to keep the demo free
resource "aws_secretsmanager_secret" "database_url" {
  count                   = local.create_database_url ? 1 : 0
  name                    = "${var.name}/DATABASE_URL"
  description             = "ShelfOps PostgreSQL connection string with TLS verification"
  recovery_window_in_days = 0

  tags = { Name = "${var.name}-database-url" }
}

resource "aws_secretsmanager_secret_version" "database_url" {
  count         = local.create_database_url ? 1 : 0
  secret_id     = aws_secretsmanager_secret.database_url[0].id
  secret_string = local.database_url
}

#checkov:skip=CKV_AWS_149:AWS-managed encryption at rest is used to keep the demo free
resource "aws_secretsmanager_secret" "oidc_client_secret" {
  count                   = local.create_oidc_secret ? 1 : 0
  name                    = "${var.name}/SHELFOPS_OIDC_CLIENT_SECRET"
  description             = "ShelfOps OIDC client secret"
  recovery_window_in_days = 0

  tags = { Name = "${var.name}-oidc-client-secret" }
}

resource "aws_secretsmanager_secret_version" "oidc_client_secret" {
  count         = local.create_oidc_secret ? 1 : 0
  secret_id     = aws_secretsmanager_secret.oidc_client_secret[0].id
  secret_string = var.oidc_client_secret
}
