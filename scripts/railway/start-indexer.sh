#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

print_runtime_header "indexer"

require_env CHAIN_ENV
require_env RPC_URL
require_env POKER_TABLE_ADDRESS
require_env PLAYER_REGISTRY_ADDRESS

hydrate_db_env() {
  export DB_HOST="${DB_HOST:-${PGHOST:-}}"
  export DB_PORT="${DB_PORT:-${PGPORT:-5432}}"
  export DB_NAME="${DB_NAME:-${PGDATABASE:-}}"
  export DB_USER="${DB_USER:-${PGUSER:-}}"
  export DB_PASSWORD="${DB_PASSWORD:-${PGPASSWORD:-}}"

  if [ -z "${DB_HOST:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    eval "$(
      DATABASE_URL="$DATABASE_URL" node -e '
        try {
          const u = new URL(process.env.DATABASE_URL);
          const host = u.hostname || "";
          const port = u.port || "5432";
          const db = (u.pathname || "").replace(/^\//, "");
          const user = decodeURIComponent(u.username || "");
          const pass = decodeURIComponent(u.password || "");
          const out = [
            `export DB_HOST=${JSON.stringify(host)}`,
            `export DB_PORT=${JSON.stringify(port)}`,
            `export DB_NAME=${JSON.stringify(db)}`,
            `export DB_USER=${JSON.stringify(user)}`,
            `export DB_PASSWORD=${JSON.stringify(pass)}`
          ];
          console.log(out.join("\n"));
        } catch (err) {
          process.exit(1);
        }
      ' 2>/dev/null || true
    )"
  fi
}

hydrate_db_env

require_env DB_HOST
require_env DB_NAME
require_env DB_USER
require_env DB_PASSWORD

export PORT="${PORT:-3002}"
export START_BLOCK="${START_BLOCK:-0}"
export INDEXER_FLUSH_ON_START="${INDEXER_FLUSH_ON_START:-true}"
export POLL_INTERVAL_MS="${POLL_INTERVAL_MS:-2000}"
export LOG_BLOCK_RANGE="${LOG_BLOCK_RANGE:-90}"

flush_on_start="$(printf '%s' "$INDEXER_FLUSH_ON_START" | tr '[:upper:]' '[:lower:]')"
if [ "$flush_on_start" = "1" ] || [ "$flush_on_start" = "true" ] || [ "$flush_on_start" = "yes" ] || [ "$flush_on_start" = "on" ]; then
  echo "[railway] indexer flush enabled, clearing database tables before startup"
  pnpm --filter @playerco/indexer db:flush
fi

# Safe to run repeatedly; schema file uses IF NOT EXISTS.
pnpm --filter @playerco/indexer db:migrate
pnpm --filter @playerco/indexer start
