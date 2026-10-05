
========= Local ============
terraform init -var-file="prd.tfvars" -backend-config="region=us-east-2" -backend-config="bucket=imersao-aws-ia-terraform-states" -upgrade 
terraform validate
terraform fmt -recursive   
terraform plan -var-file="prd.tfvars"
terraform apply -auto-approve -var-file="prd.tfvars" -parallelism=3  

# Acesse a URL exibida pelo apply (ou consulte-a novamente com):
terraform output -raw cloudfront_domain_name

# Destrói os recursos; execute apenas quando quiser remover o site:
terraform destroy -auto-approve -var-file="prd.tfvars"

===========================

O `terraform apply` publica o frontend, mas não abre o navegador. Acesse a URL
retornada pelo comando acima usando `https://` para visualizar a tela de login.
O frontend usa automaticamente o endpoint WebSocket criado neste stack quando
`ws_url` está vazio. O Terraform também cria uma Lambda para a rota
`sendMessage`, que invoca o Amazon Bedrock usando o modelo configurado em
`bedrock_model_id` (padrão: `amazon.nova-lite-v1:0`). Antes de aplicar,
confirme que esse modelo está disponível para sua conta e região. Cada chamada
ao modelo pode gerar cobrança.
