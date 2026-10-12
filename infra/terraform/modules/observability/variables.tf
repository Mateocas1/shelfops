variable "name" {
  description = "Name prefix for alarms, topic and dashboard."
  type        = string
}

variable "region" {
  description = "Region used by dashboard widgets."
  type        = string
}

variable "alarm_email" {
  description = "Email subscribed to the alarm topic. Empty disables the subscription."
  type        = string
  default     = ""
}

variable "enable_alb_alarms" {
  description = "Create the ALB alarms. A plan-time flag: the ARN suffixes are only known after apply, so they cannot drive count."
  type        = bool
  default     = false
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix; required when enable_alb_alarms is true."
  type        = string
  default     = null
}

variable "target_group_arn_suffix" {
  description = "Target group ARN suffix; required when enable_alb_alarms is true."
  type        = string
  default     = null
}

variable "ecs_cluster_name" {
  description = "ECS cluster name, or null when compute is disabled."
  type        = string
  default     = null
}

variable "ecs_service_name" {
  description = "ECS service name, or null when compute is disabled."
  type        = string
  default     = null
}

variable "rds_identifier" {
  description = "RDS instance identifier, or null when the database is disabled."
  type        = string
  default     = null
}

variable "log_group_name" {
  description = "Application log group name, or null when compute is disabled."
  type        = string
  default     = null
}

variable "latency_p95_threshold_seconds" {
  description = "p95 target response time alarm threshold in seconds."
  type        = number
  default     = 2
}

variable "rds_connections_threshold" {
  description = "RDS DatabaseConnections alarm threshold."
  type        = number
  default     = 60
}
