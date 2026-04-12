###############################################################################
# Railbird Infrastructure — Terraform Root Module
#
# Providers used:
#   - terraform-community/railway  (Railway services + volumes + variables)
#   - cloudflare/cloudflare        (DNS records, WAF rules, zone settings)
#
# Usage:
#   terraform init
#   terraform workspace select production   # or staging
#   terraform plan -var-file=envs/production.tfvars
#   terraform apply -var-file=envs/production.tfvars
###############################################################################

terraform {
  required_version = ">= 1.6"

  required_providers {
    railway = {
      source  = "terraform-community/railway"
      version = "~> 0.3"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
  }

  # Remote state — uncomment and configure for team use
  # backend "s3" {
  #   bucket = "railbird-tfstate"
  #   key    = "infra/terraform.tfstate"
  #   region = "ap-east-1"
  # }
}

# ── Providers ──────────────────────────────────────────────────────────────

provider "railway" {
  token = var.railway_token
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}

# ── Railway services ────────────────────────────────────────────────────────

module "railway" {
  source = "./modules/railway"

  project_name = "railbird-${var.environment}"
  environment  = var.environment

  services = {
    indexer    = { dockerfile = "services/indexer/Dockerfile",    port = 3002 }
    ownerview  = { dockerfile = "services/ownerview/Dockerfile",  port = 3001 }
    fleet      = { dockerfile = "services/fleet/Dockerfile",      port = 4002 }
    keeper     = { dockerfile = "bots/keeper/Dockerfile",         port = 9101 }
    agent      = { dockerfile = "bots/agent/Dockerfile",          port = 9100 }
    vrf        = { dockerfile = "bots/vrf-operator/Dockerfile",   port = 9102 }
  }

  postgres_enabled = true
  redis_enabled    = true
}

# ── Cloudflare DNS + WAF ───────────────────────────────────────────────────

module "cloudflare" {
  source = "./modules/cloudflare"

  zone_id  = var.cloudflare_zone_id
  domain   = var.domain

  # Point apex and www to Vercel
  vercel_ip = "76.76.21.21"

  # Railway internal hostnames (set after Railway deploy)
  indexer_origin   = var.indexer_origin
  ownerview_origin = var.ownerview_origin
}
