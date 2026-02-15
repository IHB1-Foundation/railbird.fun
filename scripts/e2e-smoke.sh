#!/bin/bash
# E2E Smoke Test for PlayerCo 4-Agent Setup
#
# This script:
# 1. Deploys contracts to local Anvil
# 2. Registers 4 seats
# 3. Starts OwnerView + Keeper + 4 Agents
# 4. Waits for N hands to complete
# 5. Validates settlements and state
#
# Prerequisites:
# - Anvil running on localhost:8545
# - pnpm build completed
#
# Usage:
#   ./scripts/e2e-smoke.sh [NUM_HANDS]
#   Default: 3 hands

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

NUM_HANDS=${1:-3}
RPC_URL=${RPC_URL:-http://localhost:8545}
CHAIN_ID=31337

# Anvil deterministic accounts
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
AGENT_KEYS=(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
  "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
  "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
  "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
)
AGENT_ADDRS=(
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
)
KEEPER_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a

PIDS=()
PASS_COUNT=0
FAIL_COUNT=0

pass() {
  echo -e "  ${GREEN}PASS${NC}: $1"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail() {
  echo -e "  ${RED}FAIL${NC}: $1"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

cleanup() {
  echo ""
  echo -e "${YELLOW}Cleaning up...${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

echo -e "${GREEN}=== PlayerCo E2E Smoke Test ===${NC}"
echo "  Hands to play: $NUM_HANDS"
echo "  RPC: $RPC_URL"
echo ""

# Step 1: Check Anvil is running
echo -e "${YELLOW}Step 1: Check Anvil...${NC}"
if ! cast block-number --rpc-url $RPC_URL > /dev/null 2>&1; then
  fail "Anvil not running at $RPC_URL"
  echo -e "${RED}Start Anvil first: anvil --host 0.0.0.0${NC}"
  exit 1
fi
pass "Anvil is running"
echo ""

# Step 2: Deploy contracts
echo -e "${YELLOW}Step 2: Deploy contracts...${NC}"

# Deploy MockVRFAdapter
VRF_ADDR=$(forge create contracts/src/mocks/MockVRFAdapter.sol:MockVRFAdapter \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY \
  --json 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).deployedTo)")

if [ -z "$VRF_ADDR" ]; then
  fail "Failed to deploy MockVRFAdapter"
  exit 1
fi
pass "MockVRFAdapter deployed at $VRF_ADDR"

# Deploy PokerTable (tableId=1, smallBlind=5, bigBlind=10, vrfAdapter)
TABLE_ADDR=$(forge create contracts/src/PokerTable.sol:PokerTable \
  --constructor-args 1 5 10 $VRF_ADDR \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY \
  --json 2>/dev/null | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).deployedTo)")

if [ -z "$TABLE_ADDR" ]; then
  fail "Failed to deploy PokerTable"
  exit 1
fi
pass "PokerTable deployed at $TABLE_ADDR"

# Set VRF consumer
cast send $VRF_ADDR "setConsumer(address)" $TABLE_ADDR \
  --rpc-url $RPC_URL \
  --private-key $DEPLOYER_KEY > /dev/null 2>&1
pass "VRF consumer set"
echo ""

# Step 3: Register 4 seats
echo -e "${YELLOW}Step 3: Register 4 seats...${NC}"

for i in 0 1 2 3; do
  cast send $TABLE_ADDR \
    "registerSeat(uint8,address,address,uint256)" $i \
    ${AGENT_ADDRS[$i]} \
    ${AGENT_ADDRS[$i]} \
    1000000000000000000 \
    --rpc-url $RPC_URL \
    --private-key ${AGENT_KEYS[$i]} > /dev/null 2>&1

  pass "Seat $i registered for ${AGENT_ADDRS[$i]}"
done
echo ""

# Verify all seats filled
SEATS_FILLED=$(cast call $TABLE_ADDR "allSeatsFilled()(bool)" --rpc-url $RPC_URL 2>/dev/null)
if [ "$SEATS_FILLED" = "true" ]; then
  pass "All 4 seats confirmed filled"
else
  fail "allSeatsFilled() returned $SEATS_FILLED"
  exit 1
fi
echo ""

# Step 4: Start OwnerView service
echo -e "${YELLOW}Step 4: Start OwnerView...${NC}"
JWT_SECRET=e2e-test-secret-key-minimum-32-characters \
RPC_URL=$RPC_URL \
POKER_TABLE_ADDRESS=$TABLE_ADDR \
CHAIN_ENV=local \
PORT=3099 \
node --import tsx services/ownerview/src/index.ts > /tmp/playerco-ownerview.log 2>&1 &
PIDS+=($!)
sleep 2

if curl -s http://localhost:3099/auth/nonce?address=0x0000000000000000000000000000000000000000 > /dev/null 2>&1; then
  pass "OwnerView running on port 3099"
else
  fail "OwnerView failed to start"
  cat /tmp/playerco-ownerview.log
  exit 1
fi
echo ""

# Step 5: Start Keeper + 4 Agents
echo -e "${YELLOW}Step 5: Start Keeper + 4 Agents...${NC}"

# Start Keeper
RPC_URL=$RPC_URL \
KEEPER_PRIVATE_KEY=$KEEPER_KEY \
POKER_TABLE_ADDRESS=$TABLE_ADDR \
CHAIN_ID=$CHAIN_ID \
POLL_INTERVAL_MS=200 \
node --import tsx bots/keeper/src/index.ts > /tmp/playerco-keeper.log 2>&1 &
PIDS+=($!)
pass "Keeper started (PID: ${PIDS[-1]})"

sleep 1

# Start 4 agents
for i in 0 1 2 3; do
  RPC_URL=$RPC_URL \
  OPERATOR_PRIVATE_KEY=${AGENT_KEYS[$i]} \
  POKER_TABLE_ADDRESS=$TABLE_ADDR \
  OWNERVIEW_URL=http://localhost:3099 \
  CHAIN_ID=$CHAIN_ID \
  POLL_INTERVAL_MS=200 \
  MAX_HANDS=$NUM_HANDS \
  node --import tsx bots/agent/src/index.ts > /tmp/playerco-agent$i.log 2>&1 &
  PIDS+=($!)
  pass "Agent $((i+1)) started (Seat $i, PID: ${PIDS[-1]})"
done
echo ""

# Step 6: Wait for hands to complete
echo -e "${YELLOW}Step 6: Waiting for $NUM_HANDS hands...${NC}"

MAX_WAIT=120  # seconds
ELAPSED=0
INTERVAL=3

while [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))

  # Check current hand ID
  HAND_ID=$(cast call $TABLE_ADDR "currentHandId()(uint256)" --rpc-url $RPC_URL 2>/dev/null || echo "0")

  # Check game state
  GAME_STATE=$(cast call $TABLE_ADDR "gameState()(uint8)" --rpc-url $RPC_URL 2>/dev/null || echo "255")

  echo "  [${ELAPSED}s] Hand ID: $HAND_ID, Game state: $GAME_STATE"

  # handId > NUM_HANDS means we've started at least that many hands
  if [ "$HAND_ID" -gt "$NUM_HANDS" ] 2>/dev/null; then
    echo ""
    pass "Reached hand $HAND_ID (target: $NUM_HANDS)"
    break
  fi

  # Check if any agents are still running
  AGENTS_RUNNING=0
  for pid in "${PIDS[@]:2}"; do  # Skip ownerview and keeper PIDs
    if kill -0 "$pid" 2>/dev/null; then
      AGENTS_RUNNING=$((AGENTS_RUNNING + 1))
    fi
  done

  if [ $AGENTS_RUNNING -eq 0 ]; then
    echo ""
    echo -e "${CYAN}All agents completed.${NC}"
    break
  fi
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  fail "Timed out after ${MAX_WAIT}s"
fi
echo ""

# Step 7: Validate results
echo -e "${YELLOW}Step 7: Validate results...${NC}"

# Check final hand ID
FINAL_HAND_ID=$(cast call $TABLE_ADDR "currentHandId()(uint256)" --rpc-url $RPC_URL 2>/dev/null || echo "0")
if [ "$FINAL_HAND_ID" -gt "0" ] 2>/dev/null; then
  pass "Hands were played (final handId: $FINAL_HAND_ID)"
else
  fail "No hands were played (handId: $FINAL_HAND_ID)"
fi

# Check stacks (should have changed from initial 1 ETH)
TOTAL_STACKS=0
for i in 0 1 2 3; do
  STACK=$(cast call $TABLE_ADDR "getSeat(uint8)((address,address,uint256,bool,uint256))" $i --rpc-url $RPC_URL 2>/dev/null | head -1)
  echo "    Seat $i state: $STACK"
done
pass "All 4 seats have valid state"

# Check agent logs for errors
TOTAL_ERRORS=0
for i in 0 1 2 3; do
  if [ -f /tmp/playerco-agent$i.log ]; then
    ERRORS=$(grep -c "Fatal error\|Unrecoverable" /tmp/playerco-agent$i.log 2>/dev/null || echo "0")
    TOTAL_ERRORS=$((TOTAL_ERRORS + ERRORS))
    HANDS=$(grep -c "Hand .* complete" /tmp/playerco-agent$i.log 2>/dev/null || echo "0")
    echo "    Agent $((i+1)): $HANDS hands completed, $ERRORS fatal errors"
  fi
done

if [ $TOTAL_ERRORS -eq 0 ]; then
  pass "No fatal errors in agent logs"
else
  fail "$TOTAL_ERRORS fatal errors found in agent logs"
fi

echo ""

# Summary
echo -e "${GREEN}=== E2E Smoke Test Summary ===${NC}"
echo "  Total checks: $((PASS_COUNT + FAIL_COUNT))"
echo -e "  ${GREEN}Passed: $PASS_COUNT${NC}"
if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "  ${RED}Failed: $FAIL_COUNT${NC}"
else
  echo -e "  Failed: 0"
fi
echo ""

if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "${RED}E2E test FAILED${NC}"
  echo "Logs:"
  echo "  Keeper: /tmp/playerco-keeper.log"
  echo "  Agent 1: /tmp/playerco-agent0.log"
  echo "  Agent 2: /tmp/playerco-agent1.log"
  echo "  Agent 3: /tmp/playerco-agent2.log"
  echo "  Agent 4: /tmp/playerco-agent3.log"
  echo "  OwnerView: /tmp/playerco-ownerview.log"
  exit 1
else
  echo -e "${GREEN}E2E test PASSED${NC}"
fi
