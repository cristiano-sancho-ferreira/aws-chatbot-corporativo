variable "region" {
  description = "Região AWS de deploy"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Ambiente (prd, dev, hml)"
  type        = string
  default     = "dev"
}

variable "account_client" {
  description = "ID da conta AWS"
  type        = string
  default     = "999999999999"
}

variable "organization_name" {
  description = "Nome da organização"
  type        = string
  default     = "pizzaria"
}

variable "application_name" {
  description = "Nome da aplicação"
  type        = string
  default     = "chatbot"
}

variable "common_tags" {
  description = "Tags padrão aplicadas a todos os recursos"
  type        = map(string)
  default = {
    ManagedBy  = "terraform"
    Owner      = "sancho.consultoria"
    aws-apn-id = "pc:kjgfjkadsfgskfdg"
  }
}

variable "auto_deploy" {
  description = "Se true, o 'terraform apply' já builda o React, sincroniza com o S3 e invalida o CloudFront. Se false, você builda e sobe o frontend manualmente (ver README)."
  type        = bool
  default     = true
}

variable "manage_cognito_user_pool" {
  description = "Se true, este Terraform cria o Cognito User Pool com self sign-up habilitado. Se você já tem um User Pool configurado, defina como false e informe as IDs existentes abaixo."
  type        = bool
  default     = true
}

variable "existing_user_pool_id" {
  description = "ID do User Pool Cognito existente quando manage_cognito_user_pool = false"
  type        = string
  default     = ""
}

variable "existing_user_pool_client_id" {
  description = "ID do app client do User Pool Cognito existente quando manage_cognito_user_pool = false"
  type        = string
  default     = ""
}

variable "cognito_min_password_length" {
  description = "Tamanho mínimo de senha exigido no cadastro"
  type        = number
  default     = 8
}

variable "ws_url" {
  description = "URL opcional de um WebSocket externo com processamento de mensagens. Vazia, usa o endpoint WebSocket criado neste stack."
  type        = string
  default     = ""
}

variable "assistant_name" {
  description = "Nome exibido no cabeçalho do chat"
  type        = string
  default     = "Assistente virtual"
}