# Declara os providers que este módulo aceita.
# O alias "us_east_1" é obrigatório para o WAF (scope=CLOUDFRONT).
terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 6.0"
      configuration_aliases = [aws.us_east_1]
    }
  }
}
