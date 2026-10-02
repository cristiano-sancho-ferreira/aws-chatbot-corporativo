
========= Local ============
terraform init -var-file="prd.tfvars" -backend-config="region=us-east-2" -backend-config="bucket=imersao-aws-ia-terraform-states" -upgrade 
terraform validate
terraform fmt -recursive   
terraform plan -var-file="prd.tfvars"
terraform apply -auto-approve -var-file="prd.tfvars" -parallelism=3  
terraform destroy -auto-approve -var-file="prd.tfvars"

===========================







