###############################################################################
# Railway module — creates a Railway project with one service per entry in
# var.services, plus optional Postgres and Redis add-ons.
###############################################################################

variable "project_name" { type = string }
variable "environment"  { type = string }
variable "services"     {
  type = map(object({ dockerfile = string, port = number }))
}
variable "postgres_enabled" { type = bool, default = true }
variable "redis_enabled"    { type = bool, default = true }

resource "railway_project" "main" {
  name        = var.project_name
  description = "Railbird ${var.environment} environment"
}

resource "railway_service" "services" {
  for_each = var.services

  project_id = railway_project.main.id
  name       = each.key

  source_repo = "https://github.com/0xYatha/railbird"

  config = {
    dockerfile_path = each.value.dockerfile
    root_directory  = "/"
  }
}

resource "railway_database" "postgres" {
  count      = var.postgres_enabled ? 1 : 0
  project_id = railway_project.main.id
  type       = "postgresql"
  name       = "${var.project_name}-db"
}

resource "railway_database" "redis" {
  count      = var.redis_enabled ? 1 : 0
  project_id = railway_project.main.id
  type       = "redis"
  name       = "${var.project_name}-cache"
}

output "project_id" {
  value = railway_project.main.id
}

output "database_url" {
  value     = var.postgres_enabled ? railway_database.postgres[0].connection_url : ""
  sensitive = true
}

output "redis_url" {
  value     = var.redis_enabled ? railway_database.redis[0].connection_url : ""
  sensitive = true
}
