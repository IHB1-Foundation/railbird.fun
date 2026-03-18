#!/bin/bash
# Run 2-table × 2-agent configuration for KAIA Testnet (Kairos)
#
# Prerequisites:
# - KAIA Testnet (chain ID 1001) node accessible via RPC_URL
# - Contracts deployed (2 tables + VRF adapter)
# - OwnerView service running
# - Each agent wallet registered as a seat on its table
#
# Usage:
#   ./scripts/run-kaia-agents.sh <TABLE_1_ADDRESS> <TABLE_2_ADDRESS>
#
# Or set env vars:
#   TABLE_1_ADDRESS=0x...  TABLE_2_ADDRESS=0x...  ./scripts/run-kaia-agents.sh
#
# Environment overrides:
#   RPC_URL              - KAIA RPC endpoint (default: https://public-en-kairos.node.real.io)
#   OWNERVIEW_URL        - OwnerView service (default: http://localhost:3001)
#   MAX_HANDS            - Stop after N hands (default: 0, unlimited)
#   POLL_INTERVAL_MS     - Polling interval (default: 2000)
#   TURN_ACTION_DELAY_MS - Delay from turn start to action (default: 0)
#   CHAIN_ID             - Chain ID (default: 1001)

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

TABLE_1_ADDRESS=${1:-$TABLE_1_ADDRESS}
TABLE_2_ADDRESS=${2:-$TABLE_2_ADDRESS}
RPC_URL=${RPC_URL:-https://public-en-kairos.node.real.io}
OWNERVIEW_URL=${OWNERVIEW_URL:-http://localhost:3001}
MAX_HANDS=${MAX_HANDS:-0}
CHAIN_ID=${CHAIN_ID:-1001}
TURN_ACTION_DELAY_MS=${TURN_ACTION_DELAY_MS:-0}
AGENT_DECISION_ENGINE=${AGENT_DECISION_ENGINE:-simple}
GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.0-flash}
GEMINI_TEMPERATURE=${GEMINI_TEMPERATURE:-0.2}
GEMINI_TIMEOUT_MS=${GEMINI_TIMEOUT_MS:-8000}
POLL_INTERVAL_MS=${POLL_INTERVAL_MS:-2000}

if [ -z "$TABLE_1_ADDRESS" ] || [ -z "$TABLE_2_ADDRESS" ]; then
  echo -e "${RED}Error: TABLE_1_ADDRESS and TABLE_2_ADDRESS required${NC}"
  echo "Usage: $0 <TABLE_1_ADDRESS> <TABLE_2_ADDRESS>"
  echo ""
  echo "Or set TABLE_1_ADDRESS and TABLE_2_ADDRESS env vars"
  exit 1
fi

# Agent keys: Table 1 uses agents 1 & 2, Table 2 uses agents 3 & 4
# Defaults are Anvil deterministic test accounts — override with real keys in production
AGENT_1_KEY=${AGENT_1_OPERATOR_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}
AGENT_2_KEY=${AGENT_2_OPERATOR_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}
AGENT_3_KEY=${AGENT_3_OPERATOR_PRIVATE_KEY:-0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}
AGENT_4_KEY=${AGENT_4_OPERATOR_PRIVATE_KEY:-0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6}

# Aggression factors: 0.25 (tight) and 0.65 (loose) per table
AGENT_1_AGGRESSION=${AGENT_1_AGGRESSION:-0.25}
AGENT_2_AGGRESSION=${AGENT_2_AGGRESSION:-0.65}
AGENT_3_AGGRESSION=${AGENT_3_AGGRESSION:-0.25}
AGENT_4_AGGRESSION=${AGENT_4_AGGRESSION:-0.65}

AGENT_1_DECISION_ENGINE=${AGENT_1_DECISION_ENGINE:-$AGENT_DECISION_ENGINE}
AGENT_2_DECISION_ENGINE=${AGENT_2_DECISION_ENGINE:-$AGENT_DECISION_ENGINE}
AGENT_3_DECISION_ENGINE=${AGENT_3_DECISION_ENGINE:-$AGENT_DECISION_ENGINE}
AGENT_4_DECISION_ENGINE=${AGENT_4_DECISION_ENGINE:-$AGENT_DECISION_ENGINE}

echo -e "${GREEN}=== Railbird KAIA 2-Table × 2-Agent Runner ===${NC}"
echo ""
echo "Configuration:"
echo "  Table 1:       $TABLE_1_ADDRESS"
echo "  Table 2:       $TABLE_2_ADDRESS"
echo "  RPC:           $RPC_URL"
echo "  Chain ID:      $CHAIN_ID"
echo "  OwnerView:     $OWNERVIEW_URL"
echo "  Max hands:     $MAX_HANDS"
echo "  Poll interval: ${POLL_INTERVAL_MS}ms"
echo "  Turn delay:    ${TURN_ACTION_DELAY_MS}ms"
echo "  Engine:        ${AGENT_DECISION_ENGINE}"
echo ""
echo "Table 1 agents:"
echo "  Agent 1: aggression=${AGENT_1_AGGRESSION}"
echo "  Agent 2: aggression=${AGENT_2_AGGRESSION}"
echo "Table 2 agents:"
echo "  Agent 3: aggression=${AGENT_3_AGGRESSION}"
echo "  Agent 4: aggression=${AGENT_4_AGGRESSION}"
echo ""

# Cleanup function
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

# Table 1 — Agent 1 (aggression 0.25)
echo -e "${CYAN}Starting Table 1 / Agent 1 (aggression=${AGENT_1_AGGRESSION})...${NC}"
RPC_URL=$RPC_URL \
OPERATOR_PRIVATE_KEY=$AGENT_1_KEY \
AGENT_TABLE_ADDRESS=$TABLE_1_ADDRESS \
OWNERVIEW_URL=$OWNERVIEW_URL \
CHAIN_ID=$CHAIN_ID \
POLL_INTERVAL_MS=$POLL_INTERVAL_MS \
MAX_HANDS=$MAX_HANDS \
AGGRESSION_FACTOR=$AGENT_1_AGGRESSION \
TURN_ACTION_DELAY_MS=$TURN_ACTION_DELAY_MS \
AGENT_DECISION_ENGINE=$AGENT_1_DECISION_ENGINE \
GEMINI_API_KEY=${AGENT_1_GEMINI_API_KEY:-${GEMINI_API_KEY:-}} \
GEMINI_MODEL=${AGENT_1_GEMINI_MODEL:-$GEMINI_MODEL} \
GEMINI_TEMPERATURE=${AGENT_1_GEMINI_TEMPERATURE:-$GEMINI_TEMPERATURE} \
GEMINI_TIMEOUT_MS=${AGENT_1_GEMINI_TIMEOUT_MS:-$GEMINI_TIMEOUT_MS} \
node --import tsx bots/agent/src/index.ts &
PIDS+=($!)
echo "  Agent 1 PID: ${PIDS[${#PIDS[@]}-1]}"

# Table 1 — Agent 2 (aggression 0.65)
echo -e "${CYAN}Starting Table 1 / Agent 2 (aggression=${AGENT_2_AGGRESSION})...${NC}"
RPC_URL=$RPC_URL \
OPERATOR_PRIVATE_KEY=$AGENT_2_KEY \
AGENT_TABLE_ADDRESS=$TABLE_1_ADDRESS \
OWNERVIEW_URL=$OWNERVIEW_URL \
CHAIN_ID=$CHAIN_ID \
POLL_INTERVAL_MS=$POLL_INTERVAL_MS \
MAX_HANDS=$MAX_HANDS \
AGGRESSION_FACTOR=$AGENT_2_AGGRESSION \
TURN_ACTION_DELAY_MS=$TURN_ACTION_DELAY_MS \
AGENT_DECISION_ENGINE=$AGENT_2_DECISION_ENGINE \
GEMINI_API_KEY=${AGENT_2_GEMINI_API_KEY:-${GEMINI_API_KEY:-}} \
GEMINI_MODEL=${AGENT_2_GEMINI_MODEL:-$GEMINI_MODEL} \
GEMINI_TEMPERATURE=${AGENT_2_GEMINI_TEMPERATURE:-$GEMINI_TEMPERATURE} \
GEMINI_TIMEOUT_MS=${AGENT_2_GEMINI_TIMEOUT_MS:-$GEMINI_TIMEOUT_MS} \
node --import tsx bots/agent/src/index.ts &
PIDS+=($!)
echo "  Agent 2 PID: ${PIDS[${#PIDS[@]}-1]}"

# Table 2 — Agent 3 (aggression 0.25)
echo -e "${CYAN}Starting Table 2 / Agent 3 (aggression=${AGENT_3_AGGRESSION})...${NC}"
RPC_URL=$RPC_URL \
OPERATOR_PRIVATE_KEY=$AGENT_3_KEY \
AGENT_TABLE_ADDRESS=$TABLE_2_ADDRESS \
OWNERVIEW_URL=$OWNERVIEW_URL \
CHAIN_ID=$CHAIN_ID \
POLL_INTERVAL_MS=$POLL_INTERVAL_MS \
MAX_HANDS=$MAX_HANDS \
AGGRESSION_FACTOR=$AGENT_3_AGGRESSION \
TURN_ACTION_DELAY_MS=$TURN_ACTION_DELAY_MS \
AGENT_DECISION_ENGINE=$AGENT_3_DECISION_ENGINE \
GEMINI_API_KEY=${AGENT_3_GEMINI_API_KEY:-${GEMINI_API_KEY:-}} \
GEMINI_MODEL=${AGENT_3_GEMINI_MODEL:-$GEMINI_MODEL} \
GEMINI_TEMPERATURE=${AGENT_3_GEMINI_TEMPERATURE:-$GEMINI_TEMPERATURE} \
GEMINI_TIMEOUT_MS=${AGENT_3_GEMINI_TIMEOUT_MS:-$GEMINI_TIMEOUT_MS} \
node --import tsx bots/agent/src/index.ts &
PIDS+=($!)
echo "  Agent 3 PID: ${PIDS[${#PIDS[@]}-1]}"

# Table 2 — Agent 4 (aggression 0.65)
echo -e "${CYAN}Starting Table 2 / Agent 4 (aggression=${AGENT_4_AGGRESSION})...${NC}"
RPC_URL=$RPC_URL \
OPERATOR_PRIVATE_KEY=$AGENT_4_KEY \
AGENT_TABLE_ADDRESS=$TABLE_2_ADDRESS \
OWNERVIEW_URL=$OWNERVIEW_URL \
CHAIN_ID=$CHAIN_ID \
POLL_INTERVAL_MS=$POLL_INTERVAL_MS \
MAX_HANDS=$MAX_HANDS \
AGGRESSION_FACTOR=$AGENT_4_AGGRESSION \
TURN_ACTION_DELAY_MS=$TURN_ACTION_DELAY_MS \
AGENT_DECISION_ENGINE=$AGENT_4_DECISION_ENGINE \
GEMINI_API_KEY=${AGENT_4_GEMINI_API_KEY:-${GEMINI_API_KEY:-}} \
GEMINI_MODEL=${AGENT_4_GEMINI_MODEL:-$GEMINI_MODEL} \
GEMINI_TEMPERATURE=${AGENT_4_GEMINI_TEMPERATURE:-$GEMINI_TEMPERATURE} \
GEMINI_TIMEOUT_MS=${AGENT_4_GEMINI_TIMEOUT_MS:-$GEMINI_TIMEOUT_MS} \
node --import tsx bots/agent/src/index.ts &
PIDS+=($!)
echo "  Agent 4 PID: ${PIDS[${#PIDS[@]}-1]}"

echo ""
echo -e "${GREEN}All agents started. Ctrl+C to stop.${NC}"
echo ""

# Wait for all agent processes (with MAX_HANDS=0 they run indefinitely)
for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

echo ""
echo -e "${GREEN}=== All agents completed ===${NC}"
