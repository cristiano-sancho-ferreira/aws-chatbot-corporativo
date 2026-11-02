provider "aws" {
  region = var.region
  # assume_role {
  #   role_arn = "arn:aws:iam::${var.account_client}:role/${var.organization_name}-cross-account-role"
  # }
  default_tags {
    tags = var.common_tags
  }
}

# Provider alias us-east-1 — obrigatório para recursos globais:
# WAF (scope=CLOUDFRONT), ACM para CloudFront.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = var.common_tags
  }
}
