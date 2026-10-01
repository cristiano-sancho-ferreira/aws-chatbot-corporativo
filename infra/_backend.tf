terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
  }
  backend "s3" {
    key          = "terraform/clients/chatbot/terraform.tfstate"
    use_lockfile = true # DynamoDB table for state locking
    # encrypt    = true # Enable server-side encryption for the state file
  }
}
