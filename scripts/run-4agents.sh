#!/bin/bash
# Run 4 agent bots + keeper for the PlayerCo poker table
#
# Prerequisites:
# - Anvil running on localhost:8545 (or configured RPC_URL)
# - Contracts deployed and 4 seats registered
# - OwnerView service running on localhost:3001
#
# Usage:
#   ./scripts/run-4agents.sh <POKER_TABLE_ADDRESS>
#
# Environment overrides:
#   RPC_URL              - RPC endpoint (default: http://localhost:8545)
#   OWNERVIEW_URL        - OwnerView service (default: http://localhost:3001)
#   MAX_HANDS            - Stop after N hands (default: 0, unlimited)
#   POLL_INTERVAL_MS     - Polling interval (default: 500 local, 3000 on monad.xyz)
#   TURN_ACTION_DELAY_MS - Delay from turn start to action (default: 0)

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

POKER_TABLE_ADDRESS=${1:-$POKER_TABLE_ADDRESS}
RPC_URL=${RPC_URL:-http://localhost:8545}
OWNERVIEW_URL=${OWNERVIEW_URL:-http://localhost:3001}
MAX_HANDS=${MAX_HANDS:-0}
CHAIN_ID=${CHAIN_ID:-31337}
TURN_ACTION_DELAY_MS=${TURN_ACTION_DELAY_MS:-0}
AGENT_DECISION_ENGINE=${AGENT_DECISION_ENGINE:-simple}
GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.0-flash}
GEMINI_TEMPERATURE=${GEMINI_TEMPERATURE:-0.2}
GEMINI_TIMEOUT_MS=${GEMINI_TIMEOUT_MS:-8000}

if [ -z "${POLL_INTERVAL_MS:-}" ]; then
  if [[ "$RPC_URL" == *"monad.xyz"* ]]; then
    POLL_INTERVAL_MS=3000
  else
    POLL_INTERVAL_MS=500
  fi
fi

if [ -z "$POKER_TABLE_ADDRESS" ]; then
  echo -e "${RED}Error: POKER_TABLE_ADDRESS not provided${NC}"
  echo "Usage: $0 <POKER_TABLE_ADDRESS>"
  echo ""
  echo "Or set POKER_TABLE_ADDRESS env var"
  exit 1
fi

# Anvil deterministic accounts (accounts 0-3 for agents, account 4 for keeper)
AGENT_1_KEY=${AGENT_1_OPERATOR_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}
AGENT_1_ADDR=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

AGENT_2_KEY=${AGENT_2_OPERATOR_PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}
AGENT_2_ADDR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8

AGENT_3_KEY=${AGENT_3_OPERATOR_PRIVATE_KEY:-0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a}
AGENT_3_ADDR=0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC

AGENT_4_KEY=${AGENT_4_OPERATOR_PRIVATE_KEY:-0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6}
AGENT_4_ADDR=0x90F79bf6EB2c4f870365E785982E1f101E93b906

KEEPER_KEY=${KEEPER_PRIVATE_KEY:-0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a}
KEEPER_ADDR=0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65

# Personality defaults (0=passive, 1=aggressive)
AGENT_1_AGGRESSION=${AGENT_1_AGGRESSION:-0.15} # tight
AGENT_2_AGGRESSION=${AGENT_2_AGGRESSION:-0.35} # balanced
AGENT_3_AGGRESSION=${AGENT_3_AGGRESSION:-0.60} # loose
AGENT_4_AGGRESSION=${AGENT_4_AGGRESSION:-0.85} # maniac
AGENT_1_DECISION_ENGINE=${AGENT_1_DECISION_ENGINE:-$AGENT_DECISION_ENGINE}
AGENT_2_DECISION_ENGINE=${AGENT_2_DECISION_ENGINE:-$AGENT_DECISION_ENGINE}
AGENT_3_DECISION_ENGINE=${AGENT_3_DECISION_ENGINE:-$AGENT_DECISION_ENGINE}
AGENT_4_DECISION_ENGINE=${AGENT_4_DECISION_ENGINE:-$AGENT_DECISION_ENGINE}

echo -e "${GREEN}=== PlayerCo 4-Agent Runner ===${NC}"
echo ""
echo "Configuration:"
echo "  Table:         $POKER_TABLE_ADDRESS"
echo "  RPC:           $RPC_URL"
echo "  OwnerView:     $OWNERVIEW_URL"
echo "  Max hands:     $MAX_HANDS"
echo "  Poll interval: ${POLL_INTERVAL_MS}ms"
echo "  Turn delay:    ${TURN_ACTION_DELAY_MS}ms"
echo "  Engine:        ${AGENT_DECISION_ENGINE}"
echo ""
echo "Agents:"
echo "  Seat 0: $AGENT_1_ADDR"
echo "  Seat 1: $AGENT_2_ADDR"
echo "  Seat 2: $AGENT_3_ADDR"
echo "  Seat 3: $AGENT_4_ADDR"
echo "  Keeper: $KEEPER_ADDR"
echo "Aggression:"
echo "  Seat 0: $AGENT_1_AGGRESSION"
echo "  Seat 1: $AGENT_2_AGGRESSION"
echo "  Seat 2: $AGENT_3_AGGRESSION"
echo "  Seat 3: $AGENT_4_AGGRESSION"
echo ""

# Cleanup function
PIDS=()
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down all bots...${NC}"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null
  echo -e "${GREEN}All bots stopped.${NC}"
}
trap cleanup EXIT INT TERM

# Start Keeper Bot
echo -e "${CYAN}Starting Keeper Bot...${NC}"
RPC_URL=$RPC_URL \
KEEPER_PRIVATE_KEY=$KEEPER_KEY \
POKER_TABLE_ADDRESS=$POKER_TABLE_ADDRESS \
CHAIN_ID=$CHAIN_ID \
POLL_INTERVAL_MS=$POLL_INTERVAL_MS \
node --import tsx bots/keeper/src/index.ts &
PIDS+=($!)
echo "  Keeper PID: ${PIDS[${#PIDS[@]}-1]}"

sleep 1

# Start Agent 1 (Seat 0)
echo -e "${CYAN}Starting Agent 1 (Seat 0)...${NC}"
RPC_URL=$RPC_URL \
OPERATOR_PRIVATE_KEY=$AGENT_1_KEY \
POKER_TABLE_ADDRESS=$POKER_TABLE_ADDRESS \
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

# Start Agent 2 (Seat 1)
echo -e "${CYAN}Starting Agent 2 (Seat 1)...${NC}"
RPC_URL=$RPC_URL \
OPERATOR_PRIVATE_KEY=$AGENT_2_KEY \
POKER_TABLE_ADDRESS=$POKER_TABLE_ADDRESS \
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

# Start Agent 3 (Seat 2)
echo -e "${CYAN}Starting Agent 3 (Seat 2)...${NC}"
RPC_URL=$RPC_URL \
OPERATOR_PRIVATE_KEY=$AGENT_3_KEY \
POKER_TABLE_ADDRESS=$POKER_TABLE_ADDRESS \
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

# Start Agent 4 (Seat 3)
echo -e "${CYAN}Starting Agent 4 (Seat 3)...${NC}"
RPC_URL=$RPC_URL \
OPERATOR_PRIVATE_KEY=$AGENT_4_KEY \
POKER_TABLE_ADDRESS=$POKER_TABLE_ADDRESS \
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
echo -e "${GREEN}All bots started. Waiting for completion (Ctrl+C to stop)...${NC}"
echo ""

# Wait for agent bots (keeper runs forever).
# With MAX_HANDS=0 (default), this keeps running until interrupted.
for pid in "${PIDS[@]:1}"; do
  wait "$pid" 2>/dev/null || true
done

echo ""
echo -e "${GREEN}=== All agents completed ===${NC}"
