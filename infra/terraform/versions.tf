terraform {
  required_version = ">= 1.6, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0"
    }

  }
  # Configure an encrypted remote backend with locking at terraform init.
  # Never commit a local state file or credentials.
}

provider "aws" {
  region = var.region
  default_tags {
    tags = { Application = "AgenteGestor", Environment = var.environment, ManagedBy = "Terraform" }
  }
}

variable "region" {
  type    = string
  default = "sa-east-1"
}
variable "environment" {
  type    = string
  default = "production"
}
variable "name" {
  type    = string
  default = "agentegestor"
}
variable "app_url" {
  type = string
  validation {
    condition     = can(regex("^https://[^/]+$", var.app_url))
    error_message = "app_url must be a canonical HTTPS origin without a path."
  }
}
variable "certificate_arn" {
  type = string
}
variable "image_uri" {
  type = string
  validation {
    condition     = can(regex("@sha256:[a-f0-9]{64}$", var.image_uri))
    error_message = "Pin the container image by digest, not a mutable tag."
  }
}
variable "runtime_secret_arn" {
  type        = string
  description = "Externally populated Secrets Manager JSON. DATABASE_URL uses a least-privileged app DB role, never the managed RDS master account. REDIS_URL points to authenticated TLS Redis reachable from private subnets."
}
variable "runtime_secret_keys" {
  type    = set(string)
  default = ["DATABASE_URL", "REDIS_URL", "JWT_SECRET", "META_APP_SECRET", "META_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_TOKEN_ENCRYPTION_KEY", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]
}
variable "secret_kms_key_arn" {
  type    = string
  default = null
}
variable "extra_environment" {
  type    = map(string)
  default = {}
}
variable "alarm_email" {
  type = string
}
variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}
variable "db_engine_version" {
  type    = string
  default = "17"
}
variable "api_desired_count" {
  type    = number
  default = 2
}
variable "worker_desired_count" {
  type    = number
  default = 2
}
variable "cpu" {
  type    = number
  default = 512
}
variable "memory" {
  type    = number
  default = 1024
}
data "aws_availability_zones" "available" {
  state = "available"
}
data "aws_caller_identity" "current" {
}
locals {
  prefix = "${var.name}-${var.environment}"
  azs    = slice(data.aws_availability_zones.available.names, 0, 2)
  services = { api = var.api_desired_count, worker = var.worker_desired_count
  }
}
