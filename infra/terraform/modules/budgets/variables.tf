variable "enabled" {
  description = "Create the budget. Keep false when a budget with this name already exists."
  type        = bool
  default     = false
}

variable "name" {
  description = "Budget name."
  type        = string
  default     = "shelfops-demo-zero-spend"
}

variable "limit_usd" {
  description = "Monthly budget limit in USD."
  type        = string
  default     = "1"
}

variable "alarm_email" {
  description = "Email notified when actual or forecasted spend crosses the limit."
  type        = string
}
