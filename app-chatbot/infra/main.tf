# ============================================================
# Locals
# ============================================================

locals {
  name_prefix = "${var.organization_name}-${var.application_name}-${var.environment}"
  bucket_name = "${local.name_prefix}-frontend"
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
# Módulo Frontend (S3 + CloudFront + Cognito)
# ============================================================

module "frontend" {
  source = "./modules/frontend"

  region                      = var.region
  environment                 = var.environment
  application_name            = var.application_name
  organization_name           = var.organization_name
  name_prefix                 = local.name_prefix
  bucket_name                 = local.bucket_name
  manage_cognito_user_pool    = var.manage_cognito_user_pool
  cognito_min_password_length = var.cognito_min_password_length
  common_tags                 = local.common_tags
}

# ============================================================
# Módulo Backend (Lambdas + API Gateway WebSocket + DynamoDB)
# ============================================================

module "backend" {
  source = "./modules/backend"

  region                       = var.region
  environment                  = var.environment
  application_name             = var.application_name
  organization_name            = var.organization_name
  name_prefix                  = local.name_prefix
  bucket_name                  = local.bucket_name
  bedrock_model_id             = var.bedrock_model_id
  manage_cognito_user_pool     = var.manage_cognito_user_pool
  existing_user_pool_id        = var.existing_user_pool_id
  existing_user_pool_client_id = var.existing_user_pool_client_id
  common_tags                  = local.common_tags

  # IDs do Cognito resolvidos — vêm do módulo frontend quando manage=true,
  # ou das variáveis de entrada quando manage=false
  cognito_user_pool_id        = var.manage_cognito_user_pool ? module.frontend.user_pool_id : var.existing_user_pool_id
  cognito_user_pool_client_id = var.manage_cognito_user_pool ? module.frontend.user_pool_client_id : var.existing_user_pool_client_id
}
