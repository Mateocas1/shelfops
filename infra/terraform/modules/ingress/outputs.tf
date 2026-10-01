output "alb_dns_name" {
  description = "Load balancer DNS name (CloudFront origin)."
  value       = aws_lb.this.dns_name
}

output "alb_arn_suffix" {
  description = "Load balancer ARN suffix for CloudWatch dimensions."
  value       = aws_lb.this.arn_suffix
}

output "target_group_arn" {
  description = "Target group ARN registered by the ECS service."
  value       = aws_lb_target_group.this.arn
}

output "target_group_arn_suffix" {
  description = "Target group ARN suffix for CloudWatch dimensions."
  value       = aws_lb_target_group.this.arn_suffix
}

output "listener_arn" {
  description = "HTTP listener ARN."
  value       = aws_lb_listener.http.arn
}

output "distribution_domain_name" {
  description = "CloudFront distribution domain name (the HTTPS entry point)."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "distribution_id" {
  description = "CloudFront distribution identifier."
  value       = aws_cloudfront_distribution.this.id
}

output "origin_verify_secret" {
  description = "Shared secret header value between CloudFront and the ALB."
  value       = random_password.origin_verify.result
  sensitive   = true
}
