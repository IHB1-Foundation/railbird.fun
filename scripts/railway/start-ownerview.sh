#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

print_runtime_header "ownerview"

require_env CHAIN_ENV
require_env RPC_URL
require_env POKER_TABLE_ADDRESS
require_env JWT_SECRET
require_env DEALER_API_KEY

export PORT="${PORT:-3001}"
export HOLECARD_DATA_DIR="${HOLECARD_DATA_DIR:-/data/holecards}"

pnpm --filter @playerco/ownerview start
