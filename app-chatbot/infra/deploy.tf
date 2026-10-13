# Publica o frontend automaticamente a cada "terraform apply", em 3 passos
# encadeados: build (npm) -> sync (S3) -> invalidação (CloudFront).
# Para desativar e fazer isso manualmente (ex.: dentro de uma pipeline de CI),
# defina auto_deploy = false no terraform.tfvars.

locals {
  frontend_path = "${path.module}/../frontend"
}

# Gera o .env do frontend com os valores reais do Cognito e do WebSocket.
resource "local_file" "frontend_env" {
  count = var.auto_deploy ? 1 : 0

  filename = "${local.frontend_path}/.env"
  content  = <<-EOT
    VITE_COGNITO_USER_POOL_ID=${var.manage_cognito_user_pool ? module.frontend.user_pool_id : var.existing_user_pool_id}
    VITE_COGNITO_CLIENT_ID=${var.manage_cognito_user_pool ? module.frontend.user_pool_client_id : var.existing_user_pool_client_id}
    VITE_COGNITO_REGION=${var.region}
    VITE_WS_URL=${var.ws_url != "" ? var.ws_url : module.backend.websocket_api_endpoint}
    VITE_CHAT_MESSAGES_ENABLED=true
    VITE_ASSISTANT_NAME=${var.assistant_name}
  EOT
}



# 1. Instala dependências e builda o React (gera <frontend_path>/dist)
resource "null_resource" "build_frontend" {
  count = var.auto_deploy ? 1 : 0

  triggers = {
    env_hash = local_file.frontend_env[0].content
  }

  provisioner "local-exec" {
    working_dir = local.frontend_path
    command     = "npm install && npm run build"
  }

  depends_on = [local_file.frontend_env]
}



# 2. Sincroniza o build (dist/) com o bucket S3 do frontend
resource "null_resource" "sync_s3" {
  count = var.auto_deploy ? 1 : 0

  triggers = {
    build_id = null_resource.build_frontend[0].id
  }

  provisioner "local-exec" {
    command = "aws s3 sync ${local.frontend_path}/dist s3://${module.frontend.s3_bucket_id} --delete"
  }

  depends_on = [null_resource.build_frontend]
}




# 3. Invalida o cache do CloudFront para a nova versão ficar visível imediatamente
resource "null_resource" "invalidate_cloudfront" {
  count = var.auto_deploy ? 1 : 0

  triggers = {
    sync_id = null_resource.sync_s3[0].id
  }

  provisioner "local-exec" {
    command = "aws cloudfront create-invalidation --distribution-id ${module.frontend.cloudfront_distribution_id} --paths /*"
  }

  depends_on = [null_resource.sync_s3]
}
