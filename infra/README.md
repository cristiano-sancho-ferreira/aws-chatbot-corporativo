
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
`ws_url` está vazio. Como esse endpoint ainda não processa mensagens, o chat
fica em modo local: mostra as mensagens na tela, sem enviá-las ao backend nem
gerar respostas. Para integrar o processamento, informe em `ws_url` a URL de
um backend que tenha a rota `sendMessage`.
