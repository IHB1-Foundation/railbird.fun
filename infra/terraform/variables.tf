variable "environment" {
  description = "Deployment environment: staging | production"
  type        = string
  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be staging or production"
  }
}

variable "railway_token" {
  description = "Railway API token (RAILWAY_TOKEN)"
  type        = string
  sensitive   = true
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS + WAF permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for the domain"
  type        = string
}

variable "domain" {
  description = "Primary domain, e.g. railbird.xyz"
  type        = string
  default     = "railbird.xyz"
}

variable "indexer_origin" {
  description = "Railway public URL for the indexer service"
  type        = string
  default     = ""
}

variable "ownerview_origin" {
  description = "Railway public URL for the ownerview service"
  type        = string
  default     = ""
}
