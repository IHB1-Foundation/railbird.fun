#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  . "$ROOT_DIR/.env"
  set +a
fi

require_env() {
  local key="$1"
  if [ -z "${!key:-}" ]; then
    echo "[railway] missing env: $key" >&2
    exit 1
  fi
}

print_runtime_header() {
  local service="$1"
  echo "[railway] service=$service"
  echo "[railway] chain_env=${CHAIN_ENV:-unset} chain_id=${CHAIN_ID:-unset}"
  echo "[railway] rpc_url=${RPC_URL:-unset}"
}

is_public_kaia_rpc() {
  [[ "${RPC_URL:-}" == *"kaia.io"* ]] || [[ "${RPC_URL:-}" == *"node.real.io"* ]]
}

##
# Hydrate DB_* env vars from individual PG* vars or a DATABASE_URL.
# Safe to call multiple times (idempotent).
##
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

default_poll_interval_ms() {
  local local_default="$1"
  local remote_default="$2"
  if [ -n "${POLL_INTERVAL_MS:-}" ]; then
    echo "$POLL_INTERVAL_MS"
    return
  fi
  if is_public_kaia_rpc; then
    echo "$remote_default"
    return
  fi
  echo "$local_default"
}
