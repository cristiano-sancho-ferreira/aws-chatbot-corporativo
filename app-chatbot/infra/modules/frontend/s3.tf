# ============================================================
# Bucket S3
# ============================================================

resource "aws_s3_bucket" "chatbot_corp" {
  bucket        = var.bucket_name
  force_destroy = true
  tags          = var.common_tags
}

# Política do bucket: nega tudo, exceto leitura vinda da distribuição CloudFront abaixo.
resource "aws_s3_bucket_policy" "chatbot_corp" {
  bucket = aws_s3_bucket.chatbot_corp.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipalReadOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.chatbot_corp.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.chatbot_corp.arn
          }
        }
      }
    ]
  })
}