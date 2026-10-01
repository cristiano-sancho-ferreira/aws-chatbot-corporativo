# ============================================================
# Locals e variáveis
# ============================================================
# ============================================================

locals {
  name_prefix   = "${var.organization_name}-${var.application_name}-${var.environment}-${data.aws_caller_identity.current.id}"
  bucket_name   = "${local.name_prefix}-frontend"
  common_tags = merge(
    var.common_tags,
    {
      Organization = var.organization_name
      Environment  = var.environment
      Application  = var.application_name
      Project      = "chatbot-corp"
    }
  )
}

# ============================================================
# Bucket S3
# ============================================================

resource "aws_s3_bucket" "chatbot_corp" {
  bucket = "${local.bucket_name}"
  force_destroy = true
  tags = local.common_tags
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

# ============================================================
# Distribuição CloudFront
# ============================================================

resource "aws_cloudfront_distribution" "chatbot_corp" {
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  comment             = "${local.name_prefix} - frontend do chatbot"
  tags = local.common_tags

  origin {
    domain_name              = aws_s3_bucket.chatbot_corp.bucket_regional_domain_name
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.chatbot_corp.id
  }

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    compress                = true

    # Cache "managed" da AWS otimizado para conteúdo estático (CachingOptimized)
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  # SPA: qualquer rota que não exista no S3 (403/404) cai no index.html
  # com status 200, pra o React Router (se você adicionar) cuidar da rota no client.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }

  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

# Origin Access Control: permite que só esta distribuição CloudFront
# específica leia objetos do bucket (substitui o antigo OAI).
resource "aws_cloudfront_origin_access_control" "chatbot_corp" {
  name                              = "${local.name_prefix}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

