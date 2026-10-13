variable "region" {}

variable "environment" {}

variable "organization_name" {}

variable "application_name" {}

variable "common_tags" {}

variable "bucket_name" {}

variable "name_prefix" {}

variable "bedrock_model_id" {}

variable "manage_cognito_user_pool" {}

variable "existing_user_pool_id" {}

variable "existing_user_pool_client_id" {}

# IDs do Cognito resolvidos pelo módulo frontend (passados pelo root)
variable "cognito_user_pool_id" {}

variable "cognito_user_pool_client_id" {}
