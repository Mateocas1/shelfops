variable "name" {
  description = "Name prefix for every resource in this module."
  type        = string
}

variable "vpc_id" {
  description = "VPC that owns the load balancer and target group."
  type        = string
}

variable "public_subnet_ids" {
  description = "Public subnets for the internet-facing load balancer."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Security group restricting the ALB to CloudFront origin ranges."
  type        = string
}

variable "container_port" {
  description = "Container port the target group forwards to."
  type        = number
  default     = 3000
}

variable "health_check_path" {
  description = "Target group health check path."
  type        = string
  default     = "/ready"
}
