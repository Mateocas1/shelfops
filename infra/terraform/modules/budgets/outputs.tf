output "budget_name" {
  description = "Created budget name, or null when disabled."
  value       = var.enabled ? aws_budgets_budget.this[0].name : null
}
