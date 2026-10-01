output "vpc_id" {
  description = "VPC identifier."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet identifiers (ALB and Fargate task)."
  value       = aws_subnet.public[*].id
}

output "private_subnet_ids" {
  description = "Private subnet identifiers (RDS)."
  value       = aws_subnet.private[*].id
}

output "alb_security_group_id" {
  description = "Security group attached to the load balancer."
  value       = aws_security_group.alb.id
}

output "task_security_group_id" {
  description = "Security group attached to the ECS task."
  value       = aws_security_group.task.id
}

output "cloudfront_prefix_list_id" {
  description = "Managed prefix list that restricts the ALB to CloudFront."
  value       = data.aws_ec2_managed_prefix_list.cloudfront.id
}
