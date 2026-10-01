terraform {
  required_version = ">= 1.10.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.60"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Partial configuration: supply bucket/region/encrypt with
  #   terraform init -backend-config=backend.hcl
  # `use_lockfile` gives S3-native state locking without DynamoDB.
  backend "s3" {
    key          = "shelfops/demo/terraform.tfstate"
    use_lockfile = true
  }
}
