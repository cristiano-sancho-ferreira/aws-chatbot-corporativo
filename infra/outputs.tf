output "s3_bucket_name" {
  description = "Nome do bucket S3 onde o build (dist/) deve ser enviado"
  value       = aws_s3_bucket.chatbot_corp.id
}

output "cloudfront_distribution_id" {
  description = "ID da distribuição CloudFront (usado para invalidar o cache no deploy)"
  value       = aws_cloudfront_distribution.chatbot_corp.id
}

output "cloudfront_domain_name" {
  description = "Domínio padrão do CloudFront (*.cloudfront.net)"
  value       = aws_cloudfront_distribution.chatbot_corp.domain_name
}


