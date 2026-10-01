variable "aws_region" {
  description = "Region for the Terraform state bucket."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for Terraform state (for example shelfops-tfstate-<account-id>)."
  type        = string
}

variable "localstack" {
  description = "Point the provider at LocalStack instead of AWS."
  type        = bool
  default     = false
}

variable "localstack_endpoint" {
  description = "LocalStack endpoint URL."
  type        = string
  default     = "http://localhost:4566"
}
