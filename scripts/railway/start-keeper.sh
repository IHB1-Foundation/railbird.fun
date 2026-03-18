#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

print_runtime_header "keeper"

require_env RPC_URL
require_env CHAIN_ID
require_env KEEPER_PRIVATE_KEY

# Support POKER_TABLE_ADDRESSES (multi-table, comma-separated) or POKER_TABLE_ADDRESS (single)
if [ -z "${POKER_TABLE_ADDRESSES:-}" ] && [ -z "${POKER_TABLE_ADDRESS:-}" ]; then
  echo "[railway] missing env: POKER_TABLE_ADDRESSES (or POKER_TABLE_ADDRESS)" >&2
  exit 1
fi

export OWNERVIEW_URL="${OWNERVIEW_URL:-https://ownerview.railbird.fun}"
export POLL_INTERVAL_MS="$(default_poll_interval_ms 2000 2000)"

pnpm --filter @playerco/keeper-bot start
