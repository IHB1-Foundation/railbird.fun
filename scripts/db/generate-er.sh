#!/usr/bin/env bash
# Generate ER diagram + HTML schema docs from a live Postgres using SchemaSpy.
# Output: docs/db/er-diagram/
#
# Usage:
#   DB_HOST=localhost DB_PORT=5432 DB_USER=playerco DB_PASS=playerco DB_NAME=playerco \
#     bash scripts/db/generate-er.sh
#
# Requires: docker
set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-playerco}"
DB_PASS="${DB_PASS:-playerco}"
DB_NAME="${DB_NAME:-playerco}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
OUT_DIR="${REPO_ROOT}/docs/db/er-diagram"
mkdir -p "${OUT_DIR}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required to run schemaspy" >&2
  exit 1
fi

echo "Generating SchemaSpy report → ${OUT_DIR}"
docker run --rm \
  --network host \
  -v "${OUT_DIR}:/output" \
  schemaspy/schemaspy:latest \
  -t pgsql11 \
  -host "${DB_HOST}" -port "${DB_PORT}" \
  -db "${DB_NAME}" \
  -u "${DB_USER}" -p "${DB_PASS}" \
  -s public \
  -vizjs

echo
echo "Open ${OUT_DIR}/index.html to view the report."
