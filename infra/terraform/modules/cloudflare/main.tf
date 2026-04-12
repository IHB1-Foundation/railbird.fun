###############################################################################
# Cloudflare module — DNS records and WAF rules for railbird.xyz
###############################################################################

variable "zone_id"          { type = string }
variable "domain"           { type = string }
variable "vercel_ip"        { type = string }
variable "indexer_origin"   { type = string, default = "" }
variable "ownerview_origin" { type = string, default = "" }

# ── DNS records ────────────────────────────────────────────────────────────

resource "cloudflare_record" "apex" {
  zone_id = var.zone_id
  name    = "@"
  type    = "A"
  value   = var.vercel_ip
  proxied = true
}

resource "cloudflare_record" "www" {
  zone_id = var.zone_id
  name    = "www"
  type    = "CNAME"
  value   = "cname.vercel-dns.com"
  proxied = true
}

resource "cloudflare_record" "staging" {
  zone_id = var.zone_id
  name    = "staging"
  type    = "CNAME"
  value   = "cname.vercel-dns.com"
  proxied = true
}

# ── WAF — block known bot signatures ──────────────────────────────────────

resource "cloudflare_ruleset" "waf" {
  zone_id     = var.zone_id
  name        = "Railbird WAF"
  description = "Block common attack patterns"
  kind        = "zone"
  phase       = "http_request_firewall_custom"

  rules {
    action      = "block"
    description = "Block SQLi / XSS probes"
    expression  = "(http.request.uri.query contains \"<script\" or http.request.uri.query contains \"UNION SELECT\")"
    enabled     = true
  }
}

output "zone_id" {
  value = var.zone_id
}
