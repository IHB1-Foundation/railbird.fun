#!/bin/bash
# Run 4-agent configuration for KAIA Table 2 (high-stakes: SB=1, BB=2)
#
# Prerequisites:
# - Contracts deployed, seats registered
# - OwnerView service running
#
# Usage:
#   ./scripts/run-kaia-table2.sh

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Load root .env if present
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  . "$ROOT_DIR/.env"
  set +a
fi

# Common config
RPC_URL=${RPC_URL:-https://public-en-kairos.node.kaia.io}
OWNERVIEW_URL=${OWNERVIEW_URL:-http://localhost:3001}
MAX_HANDS=${MAX_HANDS:-0}
CHAIN_ID=${CHAIN_ID:-1001}
TURN_ACTION_DELAY_MS=${TURN_ACTION_DELAY_MS:-0}
AGENT_DECISION_ENGINE=${AGENT_DECISION_ENGINE:-simple}
GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.0-flash}
GEMINI_TEMPERATURE=${GEMINI_TEMPERATURE:-0.2}
GEMINI_TIMEOUT_MS=${GEMINI_TIMEOUT_MS:-8000}
POLL_INTERVAL_MS=${POLL_INTERVAL_MS:-2000}

TABLE2=${TABLE_2_ADDRESS:?TABLE_2_ADDRESS must be set}

# Agent 10-13 keys
AGENT_10_KEY=${AGENT_10_OPERATOR_PRIVATE_KEY:?AGENT_10_OPERATOR_PRIVATE_KEY must be set}
AGENT_11_KEY=${AGENT_11_OPERATOR_PRIVATE_KEY:?AGENT_11_OPERATOR_PRIVATE_KEY must be set}
AGENT_12_KEY=${AGENT_12_OPERATOR_PRIVATE_KEY:?AGENT_12_OPERATOR_PRIVATE_KEY must be set}
AGENT_13_KEY=${AGENT_13_OPERATOR_PRIVATE_KEY:?AGENT_13_OPERATOR_PRIVATE_KEY must be set}

AGENT_10_AGGRESSION=${AGENT_10_AGGRESSION:-0.25}
AGENT_11_AGGRESSION=${AGENT_11_AGGRESSION:-0.45}
AGENT_12_AGGRESSION=${AGENT_12_AGGRESSION:-0.65}
AGENT_13_AGGRESSION=${AGENT_13_AGGRESSION:-0.85}

AGENT_KEYS=("$AGENT_10_KEY" "$AGENT_11_KEY" "$AGENT_12_KEY" "$AGENT_13_KEY")
AGENT_AGGRESSIONS=("$AGENT_10_AGGRESSION" "$AGENT_11_AGGRESSION" "$AGENT_12_AGGRESSION" "$AGENT_13_AGGRESSION")
AGENT_NUMS=(10 11 12 13)

echo -e "${GREEN}=== Railbird KAIA Table 2 (High-Stakes) Runner ===${NC}"
echo ""
echo "Configuration:"
echo "  Table:         $TABLE2"
echo "  Agents:        10, 11, 12, 13"
echo "  RPC:           $RPC_URL"
echo "  Chain ID:      $CHAIN_ID"
echo "  OwnerView:     $OWNERVIEW_URL"
echo "  Max hands:     $MAX_HANDS"
echo "  Poll interval: ${POLL_INTERVAL_MS}ms"
echo "  Turn delay:    ${TURN_ACTION_DELAY_MS}ms"
echo "  Engine:        ${AGENT_DECISION_ENGINE}"
echo ""

PIDS=()
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down all agents...${NC}"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null
  echo -e "${GREEN}All agents stopped.${NC}"
}
trap cleanup EXIT INT TERM

for i in 0 1 2 3; do
  agent_num=${AGENT_NUMS[$i]}
  key="${AGENT_KEYS[$i]}"
  aggression="${AGENT_AGGRESSIONS[$i]}"
  engine_var="AGENT_${agent_num}_DECISION_ENGINE"
  engine="${!engine_var:-$AGENT_DECISION_ENGINE}"
  gemini_key_var="AGENT_${agent_num}_GEMINI_API_KEY"
  gemini_key="${!gemini_key_var:-${GEMINI_API_KEY:-}}"

  echo -e "${CYAN}Starting Agent ${agent_num} on ${TABLE2} (aggression=${aggression}, engine=${engine})...${NC}"

  RPC_URL=$RPC_URL \
  OPERATOR_PRIVATE_KEY=$key \
  AGENT_TABLE_ADDRESS=$TABLE2 \
  OWNERVIEW_URL=$OWNERVIEW_URL \
  CHAIN_ID=$CHAIN_ID \
  POLL_INTERVAL_MS=$POLL_INTERVAL_MS \
  MAX_HANDS=$MAX_HANDS \
  AGGRESSION_FACTOR=$aggression \
  TURN_ACTION_DELAY_MS=$TURN_ACTION_DELAY_MS \
  AGENT_DECISION_ENGINE=$engine \
  GEMINI_API_KEY=$gemini_key \
  GEMINI_MODEL=$GEMINI_MODEL \
  GEMINI_TEMPERATURE=$GEMINI_TEMPERATURE \
  GEMINI_TIMEOUT_MS=$GEMINI_TIMEOUT_MS \
  node --import tsx bots/agent/src/index.ts &

  PIDS+=($!)
  echo "  Agent ${agent_num} PID: $!"
  sleep 0.3
done

echo ""
echo -e "${GREEN}All 4 agents started. Ctrl+C to stop.${NC}"
echo ""

for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

echo ""
echo -e "${GREEN}=== All agents completed ===${NC}"
