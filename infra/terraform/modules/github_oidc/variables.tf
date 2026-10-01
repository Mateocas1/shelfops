variable "name" {
  description = "Name prefix for the roles in this module."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository allowed to assume the roles, as owner/repo."
  type        = string
  default     = "Mateocas1/shelfops"
}

variable "region" {
  description = "AWS region used to build resource ARNs."
  type        = string
}

variable "account_id" {
  description = "AWS account id used to build resource ARNs."
  type        = string
}

variable "create_provider" {
  description = "Create the GitHub OIDC provider. Set false when the account already has one."
  type        = bool
  default     = true
}

variable "oidc_provider_arn" {
  description = "Existing OIDC provider ARN used when create_provider is false."
  type        = string
  default     = null
}

variable "ecr_repository_name" {
  description = "ECR repository the deploy role may push to."
  type        = string
}

variable "ecs_cluster_name" {
  description = "ECS cluster name."
  type        = string
}

variable "ecs_service_name" {
  description = "ECS service name."
  type        = string
}

variable "api_task_definition_family" {
  description = "Family of the API task definition."
  type        = string
}

variable "one_off_task_definition_family" {
  description = "Family of the migrate/seed-tenant task definition."
  type        = string
}

variable "execution_role_name" {
  description = "ECS task execution role name the deploy role may pass to ECS."
  type        = string
}

variable "task_role_name" {
  description = "ECS task role name the deploy role may pass to ECS."
  type        = string
}

variable "state_bucket_name" {
  description = "S3 bucket holding Terraform state."
  type        = string
}

variable "state_key" {
  description = "Object key of the Terraform state; the plan role may only write its .tflock."
  type        = string
  default     = "shelfops/demo/terraform.tfstate"
}

variable "environment_name" {
  description = "Protected GitHub environment trusted to run terraform apply/destroy."
  type        = string
  default     = "demo-apply"
}

variable "tags" {
  description = "Extra tags applied to the roles."
  type        = map(string)
  default     = {}
}
