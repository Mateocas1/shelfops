variable "name" {
  description = "Name prefix for every resource in this module."
  type        = string
}

variable "region" {
  description = "AWS region used by the awslogs driver."
  type        = string
}

variable "container_image" {
  description = "Full image reference (ECR repository URL with an immutable tag)."
  type        = string

  validation {
    condition     = can(regex("^[0-9]{12}\\.dkr\\.ecr\\.[a-z0-9-]+\\.amazonaws\\.com/", var.container_image))
    error_message = "container_image must be a full ECR image reference."
  }
}

variable "container_port" {
  description = "Port the API listens on."
  type        = number
  default     = 3000
}

variable "container_cpu" {
  description = "Fargate task CPU units (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "container_memory" {
  description = "Fargate task memory in MiB."
  type        = number
  default     = 512
}

variable "one_off_image" {
  description = "Image for the one-off migrate/seed-tenant task. Defaults to container_image."
  type        = string
  default     = null

  validation {
    condition     = var.one_off_image == null || can(regex("^[0-9]{12}\\.dkr\\.ecr\\.[a-z0-9-]+\\.amazonaws\\.com/", var.one_off_image))
    error_message = "one_off_image must be a full ECR image reference when set."
  }
}

variable "cpu_architecture" {
  description = "Fargate CPU architecture. The image is built for amd64."
  type        = string
  default     = "X86_64"
}

variable "desired_count" {
  description = "Number of API tasks to run."
  type        = number
  default     = 1
}

variable "public_subnet_ids" {
  description = "Public subnets for the Fargate task (no NAT gateway)."
  type        = list(string)
}

variable "task_security_group_id" {
  description = "Security group for the Fargate task."
  type        = string
}

variable "target_group_arn" {
  description = "Target group registered by the ECS service."
  type        = string
}

variable "environment" {
  description = "Non-secret environment variables for the API container."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Map of environment variable name to Secrets Manager ARN for the API container."
  type        = map(string)
  default     = {}
}

variable "one_off_environment" {
  description = "Non-secret environment variables for the one-off task."
  type        = map(string)
  default     = {}
}

variable "one_off_secrets" {
  description = "Map of environment variable name to Secrets Manager ARN for the one-off task."
  type        = map(string)
  default     = {}
}

variable "one_off_command" {
  description = "Command overridden on the one-off task definition (migrate by default)."
  type        = list(string)
  default     = ["node", "scripts/migrate.cjs"]
}

variable "secret_arns" {
  description = "Secret ARNs the task execution role may read."
  type        = list(string)
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention in days."
  type        = number
  default     = 7
}

variable "wait_for_steady_state" {
  description = "Wait for the ECS service to reach steady state during apply."
  type        = bool
  default     = false
}

variable "enable_execute_command" {
  description = "Enable ECS Exec (ssm) for debugging. Disabled for least privilege."
  type        = bool
  default     = false
}
