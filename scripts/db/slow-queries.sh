#!/usr/bin/env bash
# Print the top-N slow queries from pg_stat_statements.
#
# Usage:
#   DB_HOST=localhost DB_PORT=5432 DB_USER=playerco DB_PASS=playerco DB_NAME=playerco \
#     bash scripts/db/slow-queries.sh [LIMIT]
#
# pg_stat_statements must be enabled — see docs/db/data-dictionary.md.
set -euo pipefail

LIMIT="${1:-20}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-playerco}"
DB_PASS="${DB_PASS:-playerco}"
DB_NAME="${DB_NAME:-playerco}"

export PGPASSWORD="${DB_PASS}"

# Enable extension if missing (no-op if already there).
psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;" >/dev/null

psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" \
  -v ON_ERROR_STOP=1 <<SQL
SELECT
    round(mean_exec_time::numeric, 2) AS mean_ms,
    round(max_exec_time::numeric, 2)  AS max_ms,
    calls,
    round((100.0 * total_exec_time / NULLIF(SUM(total_exec_time) OVER (), 0))::numeric, 2) AS pct,
    rows,
    substring(regexp_replace(query, '\s+', ' ', 'g'), 1, 120) AS query
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat_statements%'
ORDER BY mean_exec_time DESC
LIMIT ${LIMIT};
SQL
