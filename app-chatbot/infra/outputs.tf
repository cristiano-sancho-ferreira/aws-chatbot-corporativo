output "s3_bucket_name" {
  description = "Nome do bucket S3 onde o build do frontend é publicado"
  value       = module.frontend.s3_bucket_id
}

output "cloudfront_distribution_id" {
  description = "ID da distribuição CloudFront"
  value       = module.frontend.cloudfront_distribution_id
}

output "cloudfront_domain_name" {
  description = "Domínio padrão do CloudFront (*.cloudfront.net)"
  value       = module.frontend.cloudfront_domain_name
}

output "cognito_user_pool_id" {
  description = "ID do Cognito User Pool"
  value       = module.frontend.user_pool_id
}

output "cognito_user_pool_client_id" {
  description = "ID do app client do Cognito"
  value       = module.frontend.user_pool_client_id
}

output "websocket_api_endpoint" {
  description = "Endpoint WebSocket para o frontend conectar"
  value       = module.backend.websocket_api_endpoint
}

output "chat_history_table_name" {
  description = "Tabela DynamoDB de histórico de conversas"
  value       = module.backend.chat_history_table_name
}
