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

is_public_monad_rpc() {
  [[ "${RPC_URL:-}" == *"monad.xyz"* ]]
}

default_poll_interval_ms() {
  local local_default="$1"
  local monad_default="$2"
  if [ -n "${POLL_INTERVAL_MS:-}" ]; then
    echo "$POLL_INTERVAL_MS"
    return
  fi
  if is_public_monad_rpc; then
    echo "$monad_default"
    return
  fi
  echo "$local_default"
}
