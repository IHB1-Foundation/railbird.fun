#!/bin/bash
# Railbird — HashKey Chain Testnet Demo Script
#
# Starts all services and 2-4 agents on Table 1, waits for first hand to complete,
# then outputs explorer links for all on-chain transactions.
#
# Prerequisites:
#   - .env.hashkey filled in with deployed contract addresses and private keys
#   - PostgreSQL running (for indexer)
#   - Dependencies installed: pnpm install
#
# Usage:
#   cp .env.hashkey .env   # fill in keys + addresses first
#   ./scripts/demo-hashkey.sh
#
# Environment overrides:
#   AGENT_COUNT          - Number of agents to start (default: 4)
#   MAX_HANDS            - Stop after N hands (default: 1 for demo)
#   TURN_ACTION_DELAY_MS - Delay from turn start to action, ms (default: 3000)
#   RPC_URL              - HashKey Chain RPC (default: https://testnet.hsk.xyz)
#   CHAIN_ID             - Chain ID (default: 133)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo -e "${BLUE}============================================================${NC}"
echo -e "${BLUE}  Railbird — HashKey Chain Testnet Demo${NC}"
echo -e "${BLUE}============================================================${NC}"
echo ""

# ── Load .env ────────────────────────────────────────────────────────────────
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  . "$ROOT_DIR/.env"
  set +a
  echo -e "${GREEN}✓ Loaded .env${NC}"
else
  echo -e "${RED}✗ .env not found. Run: cp .env.hashkey .env${NC}"
  exit 1
fi

# ── Config ───────────────────────────────────────────────────────────────────
RPC_URL=${RPC_URL:-https://testnet.hsk.xyz}
CHAIN_ID=${CHAIN_ID:-133}
EXPLORER=${NEXT_PUBLIC_BLOCK_EXPLORER:-https://testnet-explorer.hsk.xyz}
OWNERVIEW_URL=${OWNERVIEW_URL:-http://localhost:3001}
INDEXER_URL=${NEXT_PUBLIC_INDEXER_URL:-http://localhost:3002}
AGENT_COUNT=${AGENT_COUNT:-4}
MAX_HANDS=${MAX_HANDS:-1}
TURN_ACTION_DELAY_MS=${TURN_ACTION_DELAY_MS:-3000}
AGENT_DECISION_ENGINE=${AGENT_DECISION_ENGINE:-gemini}
GEMINI_MODEL=${GEMINI_MODEL:-gemini-2.0-flash}
GEMINI_TEMPERATURE=${GEMINI_TEMPERATURE:-0.2}
GEMINI_TIMEOUT_MS=${GEMINI_TIMEOUT_MS:-8000}
POLL_INTERVAL_MS=${POLL_INTERVAL_MS:-2000}

# Required addresses
if [ -z "$POKER_TABLE_ADDRESSES" ]; then
  echo -e "${RED}✗ POKER_TABLE_ADDRESSES not set in .env${NC}"
  exit 1
fi
# Use first table address for demo
TABLE_ADDRESS=$(echo "$POKER_TABLE_ADDRESSES" | cut -d',' -f1)

if [ -z "$VRF_ADAPTER_ADDRESS" ]; then
  echo -e "${RED}✗ VRF_ADAPTER_ADDRESS not set in .env${NC}"
  exit 1
fi

echo ""
echo "Configuration:"
echo "  Chain ID:      $CHAIN_ID"
echo "  RPC:           $RPC_URL"
echo "  Table:         $TABLE_ADDRESS"
echo "  VRF Adapter:   $VRF_ADAPTER_ADDRESS"
echo "  Explorer:      $EXPLORER"
echo "  Agents:        $AGENT_COUNT"
echo "  Max hands:     $MAX_HANDS"
echo "  Turn delay:    ${TURN_ACTION_DELAY_MS}ms"
echo "  Engine:        $AGENT_DECISION_ENGINE"
echo ""

# ── Process tracking ─────────────────────────────────────────────────────────
PIDS=()
cleanup() {
  echo ""
  echo -e "${YELLOW}Shutting down all services...${NC}"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  echo -e "${GREEN}All services stopped.${NC}"
}
trap cleanup EXIT INT TERM

# ── Start OwnerView service ───────────────────────────────────────────────────
echo -e "${CYAN}[1/4] Starting OwnerView service...${NC}"
PORT=3001 \
RPC_URL=$RPC_URL \
CHAIN_ID=$CHAIN_ID \
POKER_TABLE_ADDRESSES=$POKER_TABLE_ADDRESSES \
PLAYER_REGISTRY_ADDRESS=${PLAYER_REGISTRY_ADDRESS:-} \
JWT_SECRET=${JWT_SECRET:-demo-secret-replace-in-production} \
DEALER_API_KEY=${DEALER_API_KEY:-demo-dealer-key} \
VRF_ADAPTER_ADDRESS=$VRF_ADAPTER_ADDRESS \
VRF_ADAPTER_TYPE=production \
node --import tsx services/ownerview/src/index.ts >> /tmp/demo-ownerview.log 2>&1 &
PIDS+=($!)
echo "  PID: ${PIDS[-1]} | Log: /tmp/demo-ownerview.log"
sleep 1

# ── Start Indexer service ─────────────────────────────────────────────────────
echo -e "${CYAN}[2/4] Starting Indexer service...${NC}"
PORT=3002 \
RPC_URL=$RPC_URL \
CHAIN_ID=$CHAIN_ID \
POKER_TABLE_ADDRESSES=$POKER_TABLE_ADDRESSES \
PLAYER_REGISTRY_ADDRESS=${PLAYER_REGISTRY_ADDRESS:-} \
PLAYER_VAULT_ADDRESS=${PLAYER_VAULT_ADDRESS:-} \
VRF_ADAPTER_ADDRESS=$VRF_ADAPTER_ADDRESS \
VRF_ADAPTER_TYPE=production \
CHAIN_ENV=testnet \
LOG_BLOCK_RANGE=500 \
POLL_INTERVAL_MS=2000 \
node --import tsx services/indexer/src/index.ts >> /tmp/demo-indexer.log 2>&1 &
PIDS+=($!)
echo "  PID: ${PIDS[-1]} | Log: /tmp/demo-indexer.log"
sleep 1

# ── Start VRF Operator bot ────────────────────────────────────────────────────
echo -e "${CYAN}[3/4] Starting VRF Operator bot...${NC}"
if [ -z "$VRF_OPERATOR_PRIVATE_KEY" ] || [ "$VRF_OPERATOR_PRIVATE_KEY" = "0x" ]; then
  echo -e "${YELLOW}  ⚠ VRF_OPERATOR_PRIVATE_KEY not set — skipping VRF operator${NC}"
else
  RPC_URL=$RPC_URL \
  CHAIN_ID=$CHAIN_ID \
  VRF_OPERATOR_PRIVATE_KEY=$VRF_OPERATOR_PRIVATE_KEY \
  VRF_ADAPTER_ADDRESS=$VRF_ADAPTER_ADDRESS \
  POKER_TABLE_ADDRESSES=$POKER_TABLE_ADDRESSES \
  VRF_OPERATOR_POLL_INTERVAL_MS=${VRF_OPERATOR_POLL_INTERVAL_MS:-1500} \
  node --import tsx bots/vrf-operator/src/index.ts >> /tmp/demo-vrf.log 2>&1 &
  PIDS+=($!)
  echo "  PID: ${PIDS[-1]} | Log: /tmp/demo-vrf.log"
fi

# ── Start Keeper bot ─────────────────────────────────────────────────────────
echo -e "${CYAN}[3/4] Starting Keeper bot...${NC}"
if [ -z "$KEEPER_PRIVATE_KEY" ] || [ "$KEEPER_PRIVATE_KEY" = "0x" ]; then
  echo -e "${YELLOW}  ⚠ KEEPER_PRIVATE_KEY not set — skipping keeper${NC}"
else
  RPC_URL=$RPC_URL \
  CHAIN_ID=$CHAIN_ID \
  KEEPER_PRIVATE_KEY=$KEEPER_PRIVATE_KEY \
  POKER_TABLE_ADDRESSES=$POKER_TABLE_ADDRESSES \
  OWNERVIEW_URL=$OWNERVIEW_URL \
  DEALER_API_KEY=${DEALER_API_KEY:-demo-dealer-key} \
  POLL_INTERVAL_MS=$POLL_INTERVAL_MS \
  node --import tsx bots/keeper/src/index.ts >> /tmp/demo-keeper.log 2>&1 &
  PIDS+=($!)
  echo "  PID: ${PIDS[-1]} | Log: /tmp/demo-keeper.log"
fi
sleep 2

# ── Agent keys and personas ───────────────────────────────────────────────────
AGENT_KEYS=(
  "${AGENT_1_OPERATOR_PRIVATE_KEY:-}"
  "${AGENT_2_OPERATOR_PRIVATE_KEY:-}"
  "${AGENT_3_OPERATOR_PRIVATE_KEY:-}"
  "${AGENT_4_OPERATOR_PRIVATE_KEY:-}"
)
AGENT_AGGRESSIONS=(
  "${AGENT_1_AGGRESSION:-0.70}"
  "${AGENT_2_AGGRESSION:-0.90}"
  "${AGENT_3_AGGRESSION:-0.30}"
  "${AGENT_4_AGGRESSION:-0.50}"
)
# Each agent gets a distinct persona: shark / maniac / rock / adaptive
AGENT_PERSONAS=(
  "shark"
  "maniac"
  "rock"
  "adaptive"
)
AGENT_PERSONA_EMOJIS=(
  "🦈"
  "🔥"
  "🪨"
  "🧠"
)

# ── Start Agent bots ──────────────────────────────────────────────────────────
echo -e "${CYAN}[4/4] Starting ${AGENT_COUNT} agent bot(s) with distinct personas...${NC}"
for i in $(seq 1 "$AGENT_COUNT"); do
  key="${AGENT_KEYS[$((i-1))]}"
  aggression="${AGENT_AGGRESSIONS[$((i-1))]}"
  persona="${AGENT_PERSONAS[$((i-1))]}"
  emoji="${AGENT_PERSONA_EMOJIS[$((i-1))]}"

  if [ -z "$key" ] || [ "$key" = "0x" ]; then
    echo -e "${YELLOW}  ⚠ Agent ${i}: AGENT_${i}_OPERATOR_PRIVATE_KEY not set — skipping${NC}"
    continue
  fi

  health_port=$((9099 + i))
  echo -e "  Starting Agent ${i} ${emoji} (persona=${persona}, aggression=${aggression}, health=:${health_port})..."
  RPC_URL=$RPC_URL \
  CHAIN_ID=$CHAIN_ID \
  OPERATOR_PRIVATE_KEY=$key \
  POKER_TABLE_ADDRESS=$TABLE_ADDRESS \
  OWNERVIEW_URL=$OWNERVIEW_URL \
  POLL_INTERVAL_MS=$POLL_INTERVAL_MS \
  MAX_HANDS=$MAX_HANDS \
  AGGRESSION_FACTOR=$aggression \
  AGENT_PERSONA=$persona \
  TURN_ACTION_DELAY_MS=$TURN_ACTION_DELAY_MS \
  AGENT_DECISION_ENGINE=$AGENT_DECISION_ENGINE \
  GEMINI_API_KEY=${GEMINI_API_KEY:-} \
  GEMINI_MODEL=$GEMINI_MODEL \
  GEMINI_TEMPERATURE=$GEMINI_TEMPERATURE \
  GEMINI_TIMEOUT_MS=$GEMINI_TIMEOUT_MS \
  HEALTH_PORT=$health_port \
  node --import tsx bots/agent/src/index.ts >> "/tmp/demo-agent${i}.log" 2>&1 &
  PIDS+=($!)
  echo "    PID: ${PIDS[-1]} | Log: /tmp/demo-agent${i}.log"
  sleep 0.5
done

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  All services started — waiting for demo to complete...${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "  Explorer:       ${EXPLORER}/address/${TABLE_ADDRESS}"
echo "  Indexer API:    ${INDEXER_URL}/tables"
echo "  Logs:           /tmp/demo-*.log"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop the demo.${NC}"
echo ""

# Wait for agents to finish (MAX_HANDS=1 means they exit after 1 hand)
for pid in "${PIDS[@]}"; do
  wait "$pid" 2>/dev/null || true
done

echo ""
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN}  Demo complete!${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "Explorer links:"
echo "  Table:       ${EXPLORER}/address/${TABLE_ADDRESS}"
echo "  VRF Adapter: ${EXPLORER}/address/${VRF_ADAPTER_ADDRESS}"
echo ""
echo "Logs saved to /tmp/demo-*.log"
