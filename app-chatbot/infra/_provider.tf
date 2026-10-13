provider "aws" {
  region = var.region
  # assume_role {
  #   role_arn = "arn:aws:iam::${var.account_client}:role/${var.organization_name}-cross-account-role"
  # }
  default_tags {
    tags = var.common_tags
  }
}
