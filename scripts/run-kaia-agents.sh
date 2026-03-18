#!/bin/bash
# Run 9-agent tournament configuration for KAIA Testnet (Kairos)
#
# Supports two modes:
#   Tournament mode (default):  1 table × 9 agents (TOURNAMENT_TABLE_ADDRESS)
#   Legacy 2-table mode:        2 tables × 2 agents each (TABLE_1_ADDRESS + TABLE_2_ADDRESS)
#
# Prerequisites:
# - KAIA Testnet (chain ID 1001) node accessible via RPC_URL
# - Contracts deployed with MAX_SEATS=9
# - OwnerView service running
# - Each agent wallet registered as a seat on its table
#
# Usage (tournament):
#   TOURNAMENT_TABLE_ADDRESS=0x... ./scripts/run-kaia-agents.sh
#
# Usage (legacy 2-table):
#   ./scripts/run-kaia-agents.sh <TABLE_1_ADDRESS> <TABLE_2_ADDRESS>
#
# Environment overrides:
#   RPC_URL              - KAIA RPC endpoint (default: https://public-en-kairos.node.real.io)
#   OWNERVIEW_URL        - OwnerView service (default: http://localhost:3001)
#   MAX_HANDS            - Stop after N hands (default: 0, unlimited)
#   POLL_INTERVAL_MS     - Polling interval (default: 2000)
#   TURN_ACTION_DELAY_MS - Delay from turn start to action (default: 0)
#   CHAIN_ID             - Chain ID (default: 1001)
#   AGENT_COUNT          - Number of agents to run in tournament mode (default: 9)

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

# ── Mode detection ──────────────────────────────────────────────────────────
TOURNAMENT_TABLE_ADDRESS=${TOURNAMENT_TABLE_ADDRESS:-}
TABLE_1_ADDRESS=${1:-$TABLE_1_ADDRESS}
TABLE_2_ADDRESS=${2:-$TABLE_2_ADDRESS}
AGENT_COUNT=${AGENT_COUNT:-9}

if [ -n "$TOURNAMENT_TABLE_ADDRESS" ]; then
  MODE="tournament"
elif [ -n "$TABLE_1_ADDRESS" ] && [ -n "$TABLE_2_ADDRESS" ]; then
  MODE="legacy"
  AGENT_COUNT=4
else
  echo -e "${RED}Error: provide either TOURNAMENT_TABLE_ADDRESS or TABLE_1_ADDRESS + TABLE_2_ADDRESS${NC}"
  echo ""
  echo "Tournament mode:"
  echo "  TOURNAMENT_TABLE_ADDRESS=0x... ./scripts/run-kaia-agents.sh"
  echo ""
  echo "Legacy 2-table mode:"
  echo "  ./scripts/run-kaia-agents.sh <TABLE_1_ADDRESS> <TABLE_2_ADDRESS>"
  exit 1
fi

# ── Agent keys (Anvil deterministic defaults; override in production) ────────
# Agents 1-9 private keys
AGENT_1_KEY=${AGENT_1_OPERATOR_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}
AGENT_2_KEY=${AGENT_2_OPERATOR_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}
AGENT_3_KEY=${AGENT_3_OPERATOR_PRIVATE_KEY:-0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}
AGENT_4_KEY=${AGENT_4_OPERATOR_PRIVATE_KEY:-0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6}
AGENT_5_KEY=${AGENT_5_OPERATOR_PRIVATE_KEY:-0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926b}
AGENT_6_KEY=${AGENT_6_OPERATOR_PRIVATE_KEY:-0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba}
AGENT_7_KEY=${AGENT_7_OPERATOR_PRIVATE_KEY:-0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564b}
AGENT_8_KEY=${AGENT_8_OPERATOR_PRIVATE_KEY:-0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356}
AGENT_9_KEY=${AGENT_9_OPERATOR_PRIVATE_KEY:-0xdbda1821b80551c9d65939329250132c444b1a28db6a1c651e7c0e9b2de3a7e6}

# ── Aggression factors (diverse play styles for 9-player tournament) ─────────
# Distribution: 3 tight, 3 medium, 3 loose/aggressive
AGENT_1_AGGRESSION=${AGENT_1_AGGRESSION:-0.10}   # very tight
AGENT_2_AGGRESSION=${AGENT_2_AGGRESSION:-0.20}   # tight
AGENT_3_AGGRESSION=${AGENT_3_AGGRESSION:-0.30}   # semi-tight
AGENT_4_AGGRESSION=${AGENT_4_AGGRESSION:-0.40}   # medium-passive
AGENT_5_AGGRESSION=${AGENT_5_AGGRESSION:-0.50}   # balanced
AGENT_6_AGGRESSION=${AGENT_6_AGGRESSION:-0.60}   # medium-aggressive
AGENT_7_AGGRESSION=${AGENT_7_AGGRESSION:-0.70}   # loose
AGENT_8_AGGRESSION=${AGENT_8_AGGRESSION:-0.80}   # aggressive
AGENT_9_AGGRESSION=${AGENT_9_AGGRESSION:-0.90}   # very aggressive (maniac)

AGENT_KEYS=("$AGENT_1_KEY" "$AGENT_2_KEY" "$AGENT_3_KEY" "$AGENT_4_KEY" "$AGENT_5_KEY" "$AGENT_6_KEY" "$AGENT_7_KEY" "$AGENT_8_KEY" "$AGENT_9_KEY")
AGENT_AGGRESSIONS=("$AGENT_1_AGGRESSION" "$AGENT_2_AGGRESSION" "$AGENT_3_AGGRESSION" "$AGENT_4_AGGRESSION" "$AGENT_5_AGGRESSION" "$AGENT_6_AGGRESSION" "$AGENT_7_AGGRESSION" "$AGENT_8_AGGRESSION" "$AGENT_9_AGGRESSION")

# ── Print configuration ──────────────────────────────────────────────────────
if [ "$MODE" = "tournament" ]; then
  echo -e "${GREEN}=== Railbird KAIA 9-Player Tournament Runner ===${NC}"
  echo ""
  echo "Configuration:"
  echo "  Table:         $TOURNAMENT_TABLE_ADDRESS"
  echo "  Agents:        $AGENT_COUNT"
else
  echo -e "${GREEN}=== Railbird KAIA 2-Table × 2-Agent Runner ===${NC}"
  echo ""
  echo "Configuration:"
  echo "  Table 1:       $TABLE_1_ADDRESS"
  echo "  Table 2:       $TABLE_2_ADDRESS"
fi
echo "  RPC:           $RPC_URL"
echo "  Chain ID:      $CHAIN_ID"
echo "  OwnerView:     $OWNERVIEW_URL"
echo "  Max hands:     $MAX_HANDS"
echo "  Poll interval: ${POLL_INTERVAL_MS}ms"
echo "  Turn delay:    ${TURN_ACTION_DELAY_MS}ms"
echo "  Engine:        ${AGENT_DECISION_ENGINE}"
echo ""

# ── Cleanup handler ──────────────────────────────────────────────────────────
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

# ── Start agents ─────────────────────────────────────────────────────────────
start_agent() {
  local agent_num=$1        # 1-9
  local table_address=$2
  local key="${AGENT_KEYS[$((agent_num-1))]}"
  local aggression="${AGENT_AGGRESSIONS[$((agent_num-1))]}"
  local engine_var="AGENT_${agent_num}_DECISION_ENGINE"
  local engine="${!engine_var:-$AGENT_DECISION_ENGINE}"
  local gemini_key_var="AGENT_${agent_num}_GEMINI_API_KEY"
  local gemini_key="${!gemini_key_var:-${GEMINI_API_KEY:-}}"
  local gemini_model_var="AGENT_${agent_num}_GEMINI_MODEL"
  local gemini_model="${!gemini_model_var:-$GEMINI_MODEL}"
  local gemini_temp_var="AGENT_${agent_num}_GEMINI_TEMPERATURE"
  local gemini_temp="${!gemini_temp_var:-$GEMINI_TEMPERATURE}"
  local gemini_timeout_var="AGENT_${agent_num}_GEMINI_TIMEOUT_MS"
  local gemini_timeout="${!gemini_timeout_var:-$GEMINI_TIMEOUT_MS}"

  echo -e "${CYAN}Starting Agent ${agent_num} on ${table_address} (aggression=${aggression}, engine=${engine})...${NC}"

  RPC_URL=$RPC_URL \
  OPERATOR_PRIVATE_KEY=$key \
  AGENT_TABLE_ADDRESS=$table_address \
  OWNERVIEW_URL=$OWNERVIEW_URL \
  CHAIN_ID=$CHAIN_ID \
  POLL_INTERVAL_MS=$POLL_INTERVAL_MS \
  MAX_HANDS=$MAX_HANDS \
  AGGRESSION_FACTOR=$aggression \
  TURN_ACTION_DELAY_MS=$TURN_ACTION_DELAY_MS \
  AGENT_DECISION_ENGINE=$engine \
  GEMINI_API_KEY=$gemini_key \
  GEMINI_MODEL=$gemini_model \
  GEMINI_TEMPERATURE=$gemini_temp \
  GEMINI_TIMEOUT_MS=$gemini_timeout \
  node --import tsx bots/agent/src/index.ts &

  local pid=$!
  PIDS+=($pid)
  echo "  Agent ${agent_num} PID: $pid"
}

if [ "$MODE" = "tournament" ]; then
  # 9-player tournament: all agents on one table
  echo "Starting ${AGENT_COUNT} agents on tournament table..."
  echo ""
  for i in $(seq 1 "$AGENT_COUNT"); do
    start_agent "$i" "$TOURNAMENT_TABLE_ADDRESS"
    sleep 0.3  # stagger starts slightly to avoid block collision
  done
else
  # Legacy 2-table mode: agents 1-2 on table 1, agents 3-4 on table 2
  echo "Starting agents in legacy 2-table mode..."
  echo ""
  start_agent 1 "$TABLE_1_ADDRESS"
  start_agent 2 "$TABLE_1_ADDRESS"
  start_agent 3 "$TABLE_2_ADDRESS"
  start_agent 4 "$TABLE_2_ADDRESS"
fi

echo ""
echo -e "${GREEN}All ${#PIDS[@]} agents started. Ctrl+C to stop.${NC}"
echo ""

# Wait for all agent processes
for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

echo ""
echo -e "${GREEN}=== All agents completed ===${NC}"
