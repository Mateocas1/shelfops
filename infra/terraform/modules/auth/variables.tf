variable "name" {
  description = "Name prefix for every Cognito resource."
  type        = string
}

variable "aws_region" {
  description = "Region used to build the Cognito issuer and Hosted UI URLs."
  type        = string
}

variable "callback_urls" {
  description = "Allowed OAuth callback URLs. Each must be an exact HTTPS URL; the API requires the path /auth/callback."
  type        = list(string)

  validation {
    condition     = length(var.callback_urls) > 0
    error_message = "At least one callback URL is required."
  }
}

variable "logout_urls" {
  description = "Allowed post-logout redirect URLs."
  type        = list(string)

  validation {
    condition     = length(var.logout_urls) > 0
    error_message = "At least one logout URL is required."
  }
}

variable "domain_prefix" {
  description = "Cognito prefix domain. Must be globally unique. When empty, one is generated from the name plus a random suffix."
  type        = string
  default     = ""

  validation {
    condition     = var.domain_prefix == "" || can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$", var.domain_prefix))
    error_message = "domain_prefix must be a lowercase DNS label."
  }
}

variable "mfa_configuration" {
  description = "MFA setting: OFF, OPTIONAL, or ON. OPTIONAL lets each user opt in without enforcement."
  type        = string
  default     = "OPTIONAL"

  validation {
    condition     = contains(["OFF", "OPTIONAL", "ON"], var.mfa_configuration)
    error_message = "mfa_configuration must be OFF, OPTIONAL, or ON."
  }
}

variable "deletion_protection" {
  description = "Enable Cognito User Pool deletion protection. The ephemeral demo leaves it off."
  type        = bool
  default     = false
}

variable "password_minimum_length" {
  description = "Minimum password length. The pool always requires upper, lower, digit and symbol."
  type        = number
  default     = 12
}

variable "tags" {
  description = "Tags applied to every taggable resource."
  type        = map(string)
  default     = {}
}
