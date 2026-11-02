variable "region" {}

variable "environment" {}

variable "organization_name" {}

variable "application_name" {}

variable "common_tags" {}

variable "bucket_name" {}

variable "name_prefix" {}

variable "bedrock_model_id" {}

# Modelo leve (Haiku) usado pela Lambda Processor para sumarização de histórico
variable "bedrock_model_haiku" {
  default = "anthropic.claude-3-haiku-20240307-v1:0"
}

# Modelo de alta capacidade (Sonnet) disponível como tool para o agente
variable "bedrock_model_sonnet" {
  default = "anthropic.claude-3-5-sonnet-20241022-v2:0"
}

variable "manage_cognito_user_pool" {}

variable "existing_user_pool_id" {}

variable "existing_user_pool_client_id" {}

# IDs do Cognito resolvidos pelo módulo frontend (passados pelo root)
variable "cognito_user_pool_id" {}

variable "cognito_user_pool_client_id" {}
