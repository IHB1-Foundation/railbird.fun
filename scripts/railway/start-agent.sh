#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

slot="${AGENT_SLOT:-}"
if [ -z "$slot" ] && [ -n "${RAILWAY_SERVICE_NAME:-}" ]; then
  svc="$(printf '%s' "$RAILWAY_SERVICE_NAME" | tr '[:upper:]' '[:lower:]')"
  if [[ "$svc" =~ ^agent-([1-4])$ ]]; then
    slot="${BASH_REMATCH[1]}"
  elif [[ "$svc" =~ ^agent([1-4])$ ]]; then
    slot="${BASH_REMATCH[1]}"
  fi
fi
if [[ ! "$slot" =~ ^[1-4]$ ]]; then
  echo "[railway] AGENT_SLOT must be one of: 1,2,3,4" >&2
  exit 1
fi

print_runtime_header "agent-$slot"

require_env RPC_URL
require_env CHAIN_ID
require_env POKER_TABLE_ADDRESS

export OWNERVIEW_URL="${OWNERVIEW_URL:-https://ownerview.railbird.fun}"

key_var="AGENT_${slot}_OPERATOR_PRIVATE_KEY"
aggr_var="AGENT_${slot}_AGGRESSION"
delay_var="AGENT_${slot}_TURN_ACTION_DELAY_MS"

if [ -z "${!key_var:-}" ]; then
  echo "[railway] missing env: $key_var" >&2
  exit 1
fi

export OPERATOR_PRIVATE_KEY="${!key_var}"
export AGGRESSION_FACTOR="${!aggr_var:-0.3}"
export TURN_ACTION_DELAY_MS="${!delay_var:-${TURN_ACTION_DELAY_MS:-60000}}"
export POLL_INTERVAL_MS="${POLL_INTERVAL_MS:-1000}"
export MAX_HANDS="${MAX_HANDS:-0}"

echo "[railway] mapped $key_var -> OPERATOR_PRIVATE_KEY"
echo "[railway] aggression=${AGGRESSION_FACTOR} delay_ms=${TURN_ACTION_DELAY_MS}"

pnpm --filter @playerco/agent-bot start
