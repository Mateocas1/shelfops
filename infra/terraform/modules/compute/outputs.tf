output "ecr_repository_url" {
  description = "ECR repository URL for the API image."
  value       = aws_ecr_repository.this.repository_url
}

output "ecr_repository_name" {
  description = "ECR repository name."
  value       = aws_ecr_repository.this.name
}

output "cluster_name" {
  description = "ECS cluster name."
  value       = aws_ecs_cluster.this.name
}

output "cluster_arn" {
  description = "ECS cluster ARN."
  value       = aws_ecs_cluster.this.arn
}

output "service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.this.name
}

output "task_definition_arn" {
  description = "API task definition ARN."
  value       = aws_ecs_task_definition.api.arn
}

output "one_off_task_definition_arn" {
  description = "One-off task definition ARN (migrate/seed-tenant)."
  value       = aws_ecs_task_definition.one_off.arn
}

output "log_group_name" {
  description = "CloudWatch log group shared by the API and one-off tasks."
  value       = aws_cloudwatch_log_group.this.name
}

output "execution_role_arn" {
  description = "Task execution role ARN."
  value       = aws_iam_role.execution.arn
}

output "task_role_arn" {
  description = "Task role ARN."
  value       = aws_iam_role.task.arn
}
