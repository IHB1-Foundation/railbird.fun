#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

print_runtime_header "vrf-operator"

require_env RPC_URL
require_env CHAIN_ID
require_env VRF_ADAPTER_ADDRESS
require_env VRF_OPERATOR_PRIVATE_KEY

export VRF_OPERATOR_POLL_INTERVAL_MS="${VRF_OPERATOR_POLL_INTERVAL_MS:-1500}"
export VRF_OPERATOR_MIN_CONFIRMATIONS="${VRF_OPERATOR_MIN_CONFIRMATIONS:-1}"
export VRF_OPERATOR_RESCAN_WINDOW="${VRF_OPERATOR_RESCAN_WINDOW:-256}"

pnpm --filter @playerco/vrf-operator-bot start
