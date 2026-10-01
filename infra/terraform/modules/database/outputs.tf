output "address" {
  description = "RDS endpoint hostname."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "RDS port."
  value       = aws_db_instance.this.port
}

output "database_name" {
  description = "Initial database name."
  value       = aws_db_instance.this.db_name
}

output "identifier" {
  description = "DB instance identifier (used as the CloudWatch alarm dimension)."
  value       = aws_db_instance.this.identifier
}

output "security_group_id" {
  description = "Database security group."
  value       = aws_security_group.this.id
}
