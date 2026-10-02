# Publica o frontend automaticamente a cada "terraform apply", em 3 passos
# encadeados: build (npm) -> sync (S3) -> invalidação (CloudFront).
# Para desativar e fazer isso manualmente (ex.: dentro de uma pipeline de CI),
# defina auto_deploy = false no terraform.tfvars.

locals {
  # Hash de todo o código-fonte + arquivos de config do frontend. Sempre que
  # qualquer um desses arquivos mudar, o hash muda e os três null_resource
  # abaixo são recriados (rebuild -> sync -> invalidação) no próximo apply.
  frontend_path = "${path.module}/../frontend"
  frontend_source_files = var.auto_deploy ? sort(concat(
    tolist(fileset(local.frontend_path, "src/**")),
    tolist(fileset(local.frontend_path, "public/**")),
    ["package.json", "package-lock.json", "vite.config.ts", "index.html"]
  )) : []

  frontend_source_hash = var.auto_deploy ? sha1(join("", [
    for f in local.frontend_source_files : filesha1("${local.frontend_path}/${f}")
  ])) : ""
}

# 1. Instala dependências e builda o React (gera <frontend_path>/dist)
resource "null_resource" "build_frontend" {
  count = var.auto_deploy ? 1 : 0

  triggers = {
    always_run = timestamp()
  }

  provisioner "local-exec" {
    working_dir = local.frontend_path
    command     = "npm install && npm run build"
  }
}

# 2. Sincroniza o build (dist/) com o bucket S3 do frontend
resource "null_resource" "sync_s3" {
  count = var.auto_deploy ? 1 : 0

  triggers = {
    bucket_name = aws_s3_bucket.chatbot_corp.bucket
    source_hash = local.frontend_source_hash
    always_run  = timestamp()
  }

  provisioner "local-exec" {
    command = "aws s3 sync ${local.frontend_path}/dist s3://${aws_s3_bucket.chatbot_corp.bucket} --delete"
  }

  depends_on = [
    null_resource.build_frontend,
    aws_s3_bucket.chatbot_corp
  ]
}

# 3. Invalida o cache do CloudFront para a nova versão ficar visível na hora
resource "null_resource" "invalidate_cloudfront" {
  count = var.auto_deploy ? 1 : 0

  triggers = {
    sync_id    = null_resource.sync_s3[0].id
    always_run = timestamp()
  }

  provisioner "local-exec" {
    command = "aws cloudfront create-invalidation --distribution-id ${aws_cloudfront_distribution.chatbot_corp.id} --paths /*"
  }

  depends_on = [null_resource.sync_s3]
}


# Gera o .env do frontend com os valores reais do Cognito criado acima
# (e o ws_url do backend, que você preenche em terraform.tfvars), pra não
# precisar copiar/colar outputs manualmente antes de cada build.
resource "local_file" "frontend_env" {
  count = var.auto_deploy ? 1 : 0

  filename = "${local.frontend_path}/.env"
  content  = <<-EOT
    VITE_COGNITO_USER_POOL_ID=${var.manage_cognito_user_pool ? aws_cognito_user_pool.users[0].id : var.existing_user_pool_id}
    VITE_COGNITO_CLIENT_ID=${var.manage_cognito_user_pool ? aws_cognito_user_pool_client.spa[0].id : var.existing_user_pool_client_id}
    VITE_COGNITO_REGION=${var.region}
    VITE_WS_URL=${var.ws_url}
    VITE_ASSISTANT_NAME=${var.assistant_name}
  EOT
}
