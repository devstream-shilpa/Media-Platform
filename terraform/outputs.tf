cat > terraform/outputs.tf << 'EOF'
output "alb_dns_name" {
  description = "DNS name of the ALB"
  value       = aws_lb.main.dns_name
}

output "alb_url" {
  description = "Full URL of the ALB"
  value       = "http://${aws_lb.main.dns_name}"
}

output "db_endpoint" {
  description = "RDS database endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "db_address" {
  description = "RDS database address"
  value       = aws_db_instance.main.address
}

output "redis_endpoint" {
  description = "Redis cache endpoint"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "s3_media_bucket" {
  description = "S3 bucket for media storage"
  value       = aws_s3_bucket.media.id
}

output "sqs_queue_url" {
  description = "SQS queue URL"
  value       = aws_sqs_queue.media_processing.url
}

output "lambda_function_arn" {
  description = "Lambda function ARN"
  value       = aws_lambda_function.media_processing.arn
}

output "asg_name" {
  description = "Auto Scaling Group name"
  value       = aws_autoscaling_group.app.name
}
EOF
