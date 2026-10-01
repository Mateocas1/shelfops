variable "name" {
  description = "Name prefix for every secret."
  type        = string
}

variable "database_address" {
  description = "RDS endpoint hostname. When null, no DATABASE_URL secret is created."
  type        = string
  default     = null
}

variable "database_port" {
  description = "RDS port."
  type        = number
  default     = 5432
}

variable "database_name" {
  description = "Database name used in the connection string."
  type        = string
  default     = "shelfops"
}

variable "database_username" {
  description = "Database user used in the connection string."
  type        = string
  default     = "shelfops"
}

variable "database_password" {
  description = "Database password embedded in the connection string."
  type        = string
  sensitive   = true
}

variable "oidc_client_secret" {
  description = "OIDC client secret. When null, no OIDC secret is created."
  type        = string
  default     = null
  sensitive   = true
}
