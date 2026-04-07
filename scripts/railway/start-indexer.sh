#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

print_runtime_header "indexer"

require_env CHAIN_ENV
require_env RPC_URL
require_env PLAYER_REGISTRY_ADDRESS

# Accept POKER_TABLE_ADDRESSES (preferred, comma-separated) or legacy POKER_TABLE_ADDRESS.
if [ -n "${POKER_TABLE_ADDRESSES:-}" ]; then
  export POKER_TABLE_ADDRESSES
elif [ -n "${POKER_TABLE_ADDRESS:-}" ]; then
  echo "[indexer] WARNING: POKER_TABLE_ADDRESS is deprecated. Use POKER_TABLE_ADDRESSES instead." >&2
  export POKER_TABLE_ADDRESSES="$POKER_TABLE_ADDRESS"
else
  echo "[indexer] ERROR: POKER_TABLE_ADDRESSES is required." >&2
  exit 1
fi

# Use shared hydrate_db_env from common.sh
hydrate_db_env

require_env DB_HOST
require_env DB_NAME
require_env DB_USER
require_env DB_PASSWORD

export PORT="${PORT:-3002}"
export START_BLOCK="${START_BLOCK:-0}"
# Default false: flushing on start destroys historical data. Set to true only
# for a planned re-index (e.g. after a schema migration that requires replay).
export INDEXER_FLUSH_ON_START="${INDEXER_FLUSH_ON_START:-false}"
# Per-environment recommended: local=1000  testnet=2000  mainnet=3000
export POLL_INTERVAL_MS="${POLL_INTERVAL_MS:-1000}"
export LOG_BLOCK_RANGE="${LOG_BLOCK_RANGE:-90}"

flush_on_start="$(printf '%s' "$INDEXER_FLUSH_ON_START" | tr '[:upper:]' '[:lower:]')"
if [ "$flush_on_start" = "1" ] || [ "$flush_on_start" = "true" ] || [ "$flush_on_start" = "yes" ] || [ "$flush_on_start" = "on" ]; then
  echo "[railway] indexer flush enabled, clearing database tables before startup"
  pnpm --filter @playerco/indexer db:flush
fi

# Safe to run repeatedly; schema file uses IF NOT EXISTS.
pnpm --filter @playerco/indexer db:migrate
pnpm --filter @playerco/indexer start
