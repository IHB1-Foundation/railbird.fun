#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

print_runtime_header "ownerview"

require_env CHAIN_ENV
require_env RPC_URL
require_env JWT_SECRET
require_env DEALER_API_KEY

# Validate JWT_SECRET length (defense in depth — index.ts also validates at runtime)
if [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "[ownerview] ERROR: JWT_SECRET must be at least 32 characters (got ${#JWT_SECRET})" >&2
  exit 1
fi

# Accept POKER_TABLE_ADDRESSES (preferred, comma-separated) or legacy POKER_TABLE_ADDRESS.
hydrate_table_env
if [ -n "${POKER_TABLE_ADDRESSES:-}" ]; then
  export POKER_TABLE_ADDRESSES
elif [ -n "${POKER_TABLE_ADDRESS:-}" ]; then
  echo "[ownerview] WARNING: POKER_TABLE_ADDRESS is deprecated. Use POKER_TABLE_ADDRESSES instead." >&2
  export POKER_TABLE_ADDRESSES="$POKER_TABLE_ADDRESS"
else
  echo "[ownerview] ERROR: POKER_TABLE_ADDRESSES is required." >&2
  exit 1
fi

export PORT="${PORT:-3001}"
export HOLECARD_DATA_DIR="${HOLECARD_DATA_DIR:-/data/holecards}"

pnpm --filter @playerco/ownerview start
