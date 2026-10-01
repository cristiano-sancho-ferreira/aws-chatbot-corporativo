
========= Local ============
terraform init -var-file="prd.tfvars" -backend-config="region=us-east-2" -backend-config="bucket=imersao-aws-ia-terraform-states" -upgrade 
terraform validate
terraform fmt -recursive   
terraform plan -var-file="prd.tfvars"
terraform apply -auto-approve -var-file="prd.tfvars" -parallelism=3  
terraform destroy -auto-approve -var-file="prd.tfvars"

===========================


Agora você pode acessar o curso da DevOps na Nuvem e devorar todo o conteúdo já disponível! Abaixo está seu login e senha de acesso:

Email: cristiano.sancho.ferreira@gmail.com
Senha: bdyxsBNy
https://devops-na-nuvem.memberkit.com.br/280938-workshop-devops-na-nuvem-observabilidade
