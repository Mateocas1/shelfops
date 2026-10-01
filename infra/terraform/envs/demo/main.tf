resource "random_password" "db_password" {
  length  = 32
  special = false
}

locals {
  name = "${var.project}-${var.environment}"

  # LocalStack's free plan does not emulate ECR, ECS, RDS, ELBv2 or CloudFront.
  enable_network  = var.enable_network && !var.localstack
  enable_database = var.enable_database && !var.localstack
  enable_compute  = var.enable_compute && !var.localstack
  enable_ingress  = var.enable_ingress && !var.localstack
  enable_budget   = var.enable_budget && !var.localstack

  db_password = var.db_password != null ? var.db_password : random_password.db_password.result

  network_vpc_id                 = try(module.network[0].vpc_id, null)
  network_public_subnet_ids      = try(module.network[0].public_subnet_ids, [])
  network_private_subnet_ids     = try(module.network[0].private_subnet_ids, [])
  network_alb_security_group_id  = try(module.network[0].alb_security_group_id, null)
  network_task_security_group_id = try(module.network[0].task_security_group_id, null)

  database_address    = try(module.database[0].address, null)
  database_port       = try(module.database[0].port, 5432)
  database_identifier = try(module.database[0].identifier, null)

  ingress_target_group_arn  = try(module.ingress[0].target_group_arn, null)
  ingress_alb_arn_suffix    = try(module.ingress[0].alb_arn_suffix, null)
  ingress_target_arn_suffix = try(module.ingress[0].target_group_arn_suffix, null)

  oidc_environment = var.oidc_enabled ? {
    SHELFOPS_OIDC_ISSUER                   = var.oidc_issuer
    SHELFOPS_OIDC_CLIENT_ID                = var.oidc_client_id
    SHELFOPS_OIDC_CALLBACK_URL             = var.oidc_callback_url
    SHELFOPS_OIDC_DESTINATION_URL          = var.oidc_destination_url
    SHELFOPS_OIDC_ORGANIZATION_ID          = var.oidc_organization_id
    SHELFOPS_OIDC_SESSION_TTL_SECONDS      = tostring(var.oidc_session_ttl_seconds)
    SHELFOPS_OIDC_PROVIDER_TIMEOUT_SECONDS = tostring(var.oidc_provider_timeout_seconds)
  } : {}

  environment = merge({
    NODE_ENV             = "production"
    HOST                 = "0.0.0.0"
    PORT                 = tostring(var.container_port)
    LOG_LEVEL            = var.log_level
    TRUST_PROXY          = tostring(var.trust_proxy_hops)
    DATABASE_SSL_MODE    = var.database_ssl_mode
    RATE_LIMIT_MAX       = tostring(var.rate_limit_max)
    RATE_LIMIT_WINDOW_MS = tostring(var.rate_limit_window_ms)
    CORS_ALLOWED_ORIGINS = var.cors_allowed_origins
  }, local.oidc_environment)

  api_secrets = merge(
    {
      CURSOR_SECRET        = module.secrets.cursor_secret_arn
      METRICS_BEARER_TOKEN = module.secrets.metrics_bearer_token_arn
    },
    module.secrets.database_url_arn == null ? {} : { DATABASE_URL = module.secrets.database_url_arn },
    module.secrets.oidc_client_secret_arn == null ? {} : { SHELFOPS_OIDC_CLIENT_SECRET = module.secrets.oidc_client_secret_arn },
  )

  one_off_secrets = module.secrets.database_url_arn == null ? {} : { DATABASE_URL = module.secrets.database_url_arn }

  all_secret_arns = compact([
    module.secrets.cursor_secret_arn,
    module.secrets.metrics_bearer_token_arn,
    module.secrets.database_url_arn,
    module.secrets.oidc_client_secret_arn,
  ])
}

resource "terraform_data" "guards" {
  lifecycle {
    precondition {
      condition     = !local.enable_compute || var.container_image != ""
      error_message = "container_image must be a full ECR image reference when compute is enabled."
    }
    precondition {
      condition     = !(local.enable_database || local.enable_compute || local.enable_ingress) || local.enable_network
      error_message = "enable_network must stay true while database, compute or ingress is enabled."
    }
    precondition {
      condition     = !var.oidc_enabled || var.oidc_client_secret != null
      error_message = "oidc_client_secret is required when oidc_enabled is true."
    }
    precondition {
      condition     = !local.enable_budget || var.alarm_email != ""
      error_message = "alarm_email is required when enable_budget is true."
    }
  }
}

module "network" {
  source = "../../modules/network"
  count  = local.enable_network ? 1 : 0

  name           = local.name
  vpc_cidr       = var.vpc_cidr
  az_count       = var.az_count
  container_port = var.container_port
}

module "database" {
  source = "../../modules/database"
  count  = local.enable_database ? 1 : 0

  name                   = local.name
  vpc_id                 = local.network_vpc_id
  private_subnet_ids     = local.network_private_subnet_ids
  task_security_group_id = local.network_task_security_group_id
  instance_class         = var.db_instance_class
  database_name          = var.db_name
  username               = var.db_username
  password               = local.db_password
  backup_retention_days  = var.db_backup_retention_days
  deletion_protection    = var.db_deletion_protection
  skip_final_snapshot    = var.db_skip_final_snapshot
}

# Secrets Manager is available on the LocalStack free plan, so this module is
# always created; the DATABASE_URL secret only exists when RDS is enabled.
module "secrets" {
  source = "../../modules/secrets"

  name               = local.name
  database_address   = local.database_address
  database_port      = local.database_port
  database_name      = var.db_name
  database_username  = var.db_username
  database_password  = local.db_password
  oidc_client_secret = var.oidc_enabled ? var.oidc_client_secret : null
}

module "ingress" {
  source = "../../modules/ingress"
  count  = local.enable_ingress ? 1 : 0

  name                  = local.name
  vpc_id                = local.network_vpc_id
  public_subnet_ids     = local.network_public_subnet_ids
  alb_security_group_id = local.network_alb_security_group_id
  container_port        = var.container_port
}

module "compute" {
  source = "../../modules/compute"
  count  = local.enable_compute ? 1 : 0

  name                   = local.name
  region                 = var.aws_region
  container_image        = var.container_image
  container_cpu          = var.container_cpu
  container_memory       = var.container_memory
  desired_count          = var.desired_count
  public_subnet_ids      = local.network_public_subnet_ids
  task_security_group_id = local.network_task_security_group_id
  target_group_arn       = local.ingress_target_group_arn
  environment            = local.environment
  secrets                = local.api_secrets
  one_off_environment    = { NODE_ENV = "production", DATABASE_SSL_MODE = var.database_ssl_mode }
  one_off_secrets        = local.one_off_secrets
  secret_arns            = local.all_secret_arns
  log_retention_days     = var.log_retention_days
}

module "observability" {
  source = "../../modules/observability"

  name                    = local.name
  region                  = var.aws_region
  alarm_email             = var.alarm_email
  alb_arn_suffix          = local.ingress_alb_arn_suffix
  target_group_arn_suffix = local.ingress_target_arn_suffix
  ecs_cluster_name        = try(module.compute[0].cluster_name, null)
  ecs_service_name        = try(module.compute[0].service_name, null)
  rds_identifier          = local.database_identifier
  log_group_name          = try(module.compute[0].log_group_name, null)
}

module "budgets" {
  source = "../../modules/budgets"

  enabled     = local.enable_budget
  name        = "${local.name}-zero-spend"
  limit_usd   = var.budget_limit_usd
  alarm_email = var.alarm_email
}
