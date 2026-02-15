#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

print_runtime_header "keeper"

require_env RPC_URL
require_env CHAIN_ID
require_env POKER_TABLE_ADDRESS
require_env KEEPER_PRIVATE_KEY

export POLL_INTERVAL_MS="${POLL_INTERVAL_MS:-2000}"
export ENABLE_REBALANCING="${ENABLE_REBALANCING:-false}"
export REBALANCE_BUY_AMOUNT_MON="${REBALANCE_BUY_AMOUNT_MON:-0}"
export REBALANCE_SELL_AMOUNT_TOKENS="${REBALANCE_SELL_AMOUNT_TOKENS:-0}"

pnpm --filter @playerco/keeper-bot start
