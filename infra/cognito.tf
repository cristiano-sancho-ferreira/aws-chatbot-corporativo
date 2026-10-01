# User Pool com cadastro público habilitado (self sign-up): qualquer pessoa
# pode criar conta pela tela do site, e o Cognito envia o código de
# verificação para o e-mail automaticamente antes de liberar o login.
resource "aws_cognito_user_pool" "users" {
  count = var.manage_cognito_user_pool ? 1 : 0

  name = "${local.name_prefix}-users"
  tags = local.common_tags

  # E-mail é o "username": login e cadastro usam o mesmo campo
  username_attributes     = ["email"]
  auto_verified_attributes = ["email"]

  # allow_admin_create_user_only = false é o que habilita o self sign-up.
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  password_policy {
    minimum_length    = var.cognito_min_password_length
    require_lowercase = true
    require_uppercase = true
    require_numbers   = true
    require_symbols   = false
  }

  # Usa o e-mail padrão do próprio Cognito para enviar o código de
  # confirmação (limite baixo de envios/dia — ver nota no README sobre SES).
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Confirme seu cadastro"
    email_message        = "Seu código de confirmação é {####}"
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = false
    mutable             = true
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }
}

# App Client usado pelo frontend (SPA). Sem client secret, porque o secret
# não pode ficar seguro num app que roda no navegador.
resource "aws_cognito_user_pool_client" "spa" {
  count = var.manage_cognito_user_pool ? 1 : 0

  name         = "${local.name_prefix}-spa-client"
  user_pool_id = aws_cognito_user_pool.users[0].id

  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  prevent_user_existence_errors = "ENABLED"

  access_token_validity  = 60   # minutos
  id_token_validity      = 60   # minutos
  refresh_token_validity = 30   # dias

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }
}
