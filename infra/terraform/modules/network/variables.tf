variable "name" {
  description = "Name prefix for every resource in this module."
  type        = string
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "az_count" {
  description = "Number of availability zones (and subnet pairs) to create."
  type        = number
  default     = 2
}

variable "container_port" {
  description = "Container port the task listens on and the ALB forwards to."
  type        = number
  default     = 3000
}
