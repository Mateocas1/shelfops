output "state_bucket_name" {
  description = "Bucket to pass to `terraform init -backend-config` in envs/demo."
  value       = aws_s3_bucket.state.bucket
}

output "state_bucket_arn" {
  description = "ARN of the state bucket."
  value       = aws_s3_bucket.state.arn
}
