variable "aws_region" {
  description = "AWS region for the demo stack."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project tag and resource name prefix."
  type        = string
  default     = "shelfops"
}

variable "environment" {
  description = "Environment tag and name suffix."
  type        = string
  default     = "demo"
}

variable "localstack" {
  description = "Disable AWS-only modules and point the provider at LocalStack."
  type        = bool
  default     = false
}

variable "localstack_endpoint" {
  description = "LocalStack endpoint URL."
  type        = string
  default     = "http://localhost:4566"
}

variable "vpc_cidr" {
  description = "VPC CIDR block."
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones."
  type        = number
  default     = 2
}

variable "container_port" {
  description = "Port the API listens on."
  type        = number
  default     = 3000
}

variable "container_image" {
  description = "Full ECR image reference. Required when compute is enabled."
  type        = string
  default     = ""
}

variable "container_cpu" {
  description = "Fargate task CPU units."
  type        = number
  default     = 256
}

variable "container_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 512
}

variable "desired_count" {
  description = "Number of API tasks."
  type        = number
  default     = 1
}

variable "log_level" {
  description = "Application LOG_LEVEL."
  type        = string
  default     = "info"
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days."
  type        = number
  default     = 7
}

# CloudFront appends the viewer address and the ALB appends the CloudFront
# address, so the API trusts exactly two proxy hops.
variable "trust_proxy_hops" {
  description = "TRUST_PROXY hop count (2 for CloudFront -> ALB)."
  type        = number
  default     = 2
}

variable "database_ssl_mode" {
  description = "DATABASE_SSL_MODE for the application."
  type        = string
  default     = "verify-full"

  validation {
    condition     = contains(["disable", "require", "verify-full"], var.database_ssl_mode)
    error_message = "database_ssl_mode must be disable, require or verify-full."
  }
}

variable "rate_limit_max" {
  description = "RATE_LIMIT_MAX requests per window."
  type        = number
  default     = 100
}

variable "rate_limit_window_ms" {
  description = "RATE_LIMIT_WINDOW_MS window."
  type        = number
  default     = 60000
}

variable "cors_allowed_origins" {
  description = "Comma-separated CORS allowlist. Empty denies cross-origin."
  type        = string
  default     = ""
}

variable "db_instance_class" {
  description = "RDS instance class."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_name" {
  description = "Initial database name."
  type        = string
  default     = "shelfops"
}

variable "db_username" {
  description = "Database master username."
  type        = string
  default     = "shelfops"
}

variable "db_password" {
  description = "Database master password. Generated when null."
  type        = string
  default     = null
  sensitive   = true
}

variable "db_backup_retention_days" {
  description = "RDS automated backup retention."
  type        = number
  default     = 1
}

variable "db_deletion_protection" {
  description = "RDS deletion protection."
  type        = bool
  default     = false
}

variable "db_skip_final_snapshot" {
  description = "Skip the RDS final snapshot on destroy."
  type        = bool
  default     = true
}

variable "alarm_email" {
  description = "Email for alarm and budget notifications. Empty disables subscriptions."
  type        = string
  default     = ""
}

variable "enable_network" {
  description = "Create the VPC, subnets and security groups."
  type        = bool
  default     = true
}

variable "enable_database" {
  description = "Create RDS."
  type        = bool
  default     = true
}

variable "enable_compute" {
  description = "Create ECR, ECS, IAM roles and log group."
  type        = bool
  default     = true
}

variable "enable_ingress" {
  description = "Create the ALB and CloudFront distribution."
  type        = bool
  default     = true
}

variable "enable_budget" {
  description = "Create the USD budget alert. Skipped automatically under LocalStack."
  type        = bool
  default     = false
}

variable "budget_limit_usd" {
  description = "Monthly budget limit in USD."
  type        = string
  default     = "1"
}

variable "oidc_enabled" {
  description = "Inject the complete SHELFOPS_OIDC_* set into the API task."
  type        = bool
  default     = false
}

variable "oidc_issuer" {
  description = "OIDC issuer URL."
  type        = string
  default     = ""
}

variable "oidc_client_id" {
  description = "OIDC client id."
  type        = string
  default     = ""
}

variable "oidc_callback_url" {
  description = "OIDC callback URL (must end in /auth/callback)."
  type        = string
  default     = ""
}

variable "oidc_destination_url" {
  description = "OIDC post-login destination URL."
  type        = string
  default     = ""
}

variable "oidc_organization_id" {
  description = "OIDC organization UUID."
  type        = string
  default     = ""
}

variable "oidc_session_ttl_seconds" {
  description = "OIDC session TTL in seconds."
  type        = number
  default     = 3600
}

variable "oidc_provider_timeout_seconds" {
  description = "OIDC provider timeout in seconds."
  type        = number
  default     = 10
}

variable "oidc_client_secret" {
  description = "OIDC client secret, stored in Secrets Manager. Required when oidc_enabled."
  type        = string
  default     = null
  sensitive   = true
}

variable "enable_auth" {
  description = "Create the Cognito User Pool, Hosted UI domain and API app client, and derive the SHELFOPS_OIDC_* values from them. Requires enable_ingress. Skipped under LocalStack."
  type        = bool
  default     = false
}

variable "cognito_domain_prefix" {
  description = "Cognito prefix domain. Must be globally unique; when empty one is generated from the name plus a random suffix."
  type        = string
  default     = ""
}

variable "cognito_mfa_configuration" {
  description = "Cognito MFA setting: OFF, OPTIONAL, or ON."
  type        = string
  default     = "OPTIONAL"

  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.cognito_mfa_configuration)
    error_message = "cognito_mfa_configuration must be OFF, OPTIONAL, or ON."
  }
}

variable "cognito_deletion_protection" {
  description = "Enable Cognito User Pool deletion protection. The ephemeral demo leaves it off."
  type        = bool
  default     = false
}
