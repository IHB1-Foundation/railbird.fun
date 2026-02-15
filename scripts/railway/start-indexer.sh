#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

print_runtime_header "indexer"

require_env CHAIN_ENV
require_env RPC_URL
require_env POKER_TABLE_ADDRESS
require_env PLAYER_REGISTRY_ADDRESS
require_env DB_HOST
require_env DB_NAME
require_env DB_USER
require_env DB_PASSWORD

export PORT="${PORT:-3002}"
export START_BLOCK="${START_BLOCK:-0}"
export POLL_INTERVAL_MS="${POLL_INTERVAL_MS:-2000}"

# Safe to run repeatedly; schema file uses IF NOT EXISTS.
pnpm --filter @playerco/indexer db:migrate
pnpm --filter @playerco/indexer start
