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
