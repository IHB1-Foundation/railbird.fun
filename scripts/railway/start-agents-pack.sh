#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/common.sh"

print_runtime_header "agents-pack"

require_env RPC_URL
require_env CHAIN_ID
for slot in 1 2 3 4 5 6 7 8 9; do
  require_env "AGENT_${slot}_OPERATOR_PRIVATE_KEY"
done

hydrate_table_env
require_env POKER_TABLE_ADDRESS

export OWNERVIEW_URL="$(default_ownerview_url)"
export POLL_INTERVAL_MS="$(default_poll_interval_ms 1000 3000)"
export MAX_HANDS="${MAX_HANDS:-0}"
export TURN_ACTION_DELAY_MS="${TURN_ACTION_DELAY_MS:-0}"
export AGENT_DECISION_ENGINE="${AGENT_DECISION_ENGINE:-simple}"

PIDS=()

launch_slot() {
  local slot="$1"
  local key_var="AGENT_${slot}_OPERATOR_PRIVATE_KEY"
  local aggr_var="AGENT_${slot}_AGGRESSION"
  local delay_var="AGENT_${slot}_TURN_ACTION_DELAY_MS"
  local engine_var="AGENT_${slot}_DECISION_ENGINE"
  local model_var="AGENT_${slot}_GEMINI_MODEL"
  local temp_var="AGENT_${slot}_GEMINI_TEMPERATURE"
  local timeout_var="AGENT_${slot}_GEMINI_TIMEOUT_MS"
  local api_key_var="AGENT_${slot}_GEMINI_API_KEY"
  local health_var="AGENT_${slot}_HEALTH_PORT"

  (
    export OPERATOR_PRIVATE_KEY="${!key_var}"
    export AGGRESSION_FACTOR="${!aggr_var:-0.3}"
    export TURN_ACTION_DELAY_MS="${!delay_var:-$TURN_ACTION_DELAY_MS}"
    export AGENT_DECISION_ENGINE="${!engine_var:-$AGENT_DECISION_ENGINE}"
    export HEALTH_PORT="${!health_var:-$((9100 + slot - 1))}"

    if [ -n "${!model_var:-}" ]; then
      export GEMINI_MODEL="${!model_var}"
    fi
    if [ -n "${!temp_var:-}" ]; then
      export GEMINI_TEMPERATURE="${!temp_var}"
    fi
    if [ -n "${!timeout_var:-}" ]; then
      export GEMINI_TIMEOUT_MS="${!timeout_var}"
    fi
    if [ -n "${!api_key_var:-}" ]; then
      export GEMINI_API_KEY="${!api_key_var}"
    fi

    echo "[railway] starting agent-${slot} aggression=${AGGRESSION_FACTOR} delay_ms=${TURN_ACTION_DELAY_MS} engine=${AGENT_DECISION_ENGINE} health_port=${HEALTH_PORT}"
    pnpm --filter @playerco/agent-bot start
  ) &

  PIDS+=("$!")
}

cleanup() {
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
  wait || true
}

trap cleanup SIGINT SIGTERM

for slot in 1 2 3 4 5 6 7 8 9; do
  launch_slot "$slot"
done

echo "[railway] agents-pack running pids=${PIDS[*]}"

while true; do
  for pid in "${PIDS[@]}"; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      set +e
      wait "$pid"
      status=$?
      set -e
      echo "[railway] one agent exited (status=$status), stopping remaining agents"
      cleanup
      exit "$status"
    fi
  done
  sleep 1
done
