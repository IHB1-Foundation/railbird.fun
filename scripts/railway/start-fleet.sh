#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

print_runtime_header "fleet"

require_env CHAIN_ENV
require_env RPC_URL
require_env CHAIN_ID

hydrate_table_env

export OWNERVIEW_URL="$(default_ownerview_url)"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://railbird.fun,https://www.railbird.fun}"
export PORT="${PORT:-3003}"

if [ -z "${FLEET_OPERATOR_KEYS:-}" ]; then
  derived_keys=()
  for slot in 1 2 3 4 5 6 7 8 9; do
    key_var="AGENT_${slot}_OPERATOR_PRIVATE_KEY"
    if [ -n "${!key_var:-}" ]; then
      derived_keys+=("${!key_var}")
    fi
  done
  if [ "${#derived_keys[@]}" -gt 0 ]; then
    export FLEET_OPERATOR_KEYS="$(IFS=,; printf '%s' "${derived_keys[*]}")"
    echo "[railway] derived FLEET_OPERATOR_KEYS from AGENT_{1..9}_OPERATOR_PRIVATE_KEY"
  fi
fi

if [ -z "${FLEET_OPERATOR_KEYS:-}" ]; then
  echo "[railway] WARNING: FLEET_OPERATOR_KEYS is empty; create-agent will return no-wallets until keys are configured." >&2
fi

pnpm --filter @playerco/fleet start
