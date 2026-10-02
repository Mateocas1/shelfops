variable "name" {
  description = "Name prefix for the boundary policy and the project roles it bounds."
  type        = string
}

variable "account_id" {
  description = "AWS account id used to build the boundary, role and policy ARNs."
  type        = string
}

variable "state_bucket_name" {
  description = "Terraform state bucket the plan, deploy and apply roles read and write."
  type        = string
}

variable "tags" {
  description = "Extra tags applied to the boundary policy."
  type        = map(string)
  default     = {}
}
