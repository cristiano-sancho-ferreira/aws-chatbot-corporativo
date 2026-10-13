output "user_pool_id" {
  description = "ID do Cognito User Pool"
  value       = var.manage_cognito_user_pool ? aws_cognito_user_pool.users[0].id : null
}

output "user_pool_client_id" {
  description = "ID do app client do Cognito User Pool"
  value       = var.manage_cognito_user_pool ? aws_cognito_user_pool_client.spa[0].id : null
}

output "s3_bucket_id" {
  description = "Nome do bucket S3 do frontend"
  value       = aws_s3_bucket.chatbot_corp.id
}

output "s3_bucket_arn" {
  description = "ARN do bucket S3 do frontend"
  value       = aws_s3_bucket.chatbot_corp.arn
}

output "cloudfront_distribution_id" {
  description = "ID da distribuição CloudFront"
  value       = aws_cloudfront_distribution.chatbot_corp.id
}

output "cloudfront_domain_name" {
  description = "Domínio padrão do CloudFront"
  value       = aws_cloudfront_distribution.chatbot_corp.domain_name
}
