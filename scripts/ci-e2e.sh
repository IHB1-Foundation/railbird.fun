#!/bin/bash
# CI E2E Smoke Test — 2 agents, 1 hand to completion.
# Requires: foundry (forge/cast/anvil), pnpm build already done.
# Usage: ./scripts/ci-e2e.sh [NUM_HANDS]  (default: 1)

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

NUM_HANDS=${1:-1}
CHAIN_ID=31337
RPC_URL=http://127.0.0.1:8545

# Anvil deterministic accounts
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
AGENT0_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
AGENT1_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
AGENT0_ADDR=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
AGENT1_ADDR=0x70997970C51812dc3A010C7d01b50e0d17dc79C8
KEEPER_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PIDS=()
PASS_COUNT=0
FAIL_COUNT=0

pass() { echo -e "  ${GREEN}PASS${NC}: $1"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { echo -e "  ${RED}FAIL${NC}: $1"; FAIL_COUNT=$((FAIL_COUNT + 1)); }

cleanup() {
  for pid in "${PIDS[@]}"; do kill "$pid" 2>/dev/null || true; done
  # Stop anvil if we started it
  if [ -n "$ANVIL_PID" ]; then kill "$ANVIL_PID" 2>/dev/null || true; fi
  wait 2>/dev/null
}
trap cleanup EXIT INT TERM

echo -e "${YELLOW}=== CI E2E Smoke Test ($NUM_HANDS hand(s), 2 agents) ===${NC}"

# ── 1. Start Anvil ────────────────────────────────────────────────────────────
echo -e "${YELLOW}Step 1: Start Anvil...${NC}"
anvil --host 127.0.0.1 --port 8545 --block-time 1 > /tmp/ci-anvil.log 2>&1 &
ANVIL_PID=$!

# Wait for Anvil to be ready
for i in $(seq 1 20); do
  sleep 0.5
  if cast block-number --rpc-url "$RPC_URL" > /dev/null 2>&1; then
    pass "Anvil ready"
    break
  fi
  if [ "$i" -eq 20 ]; then
    fail "Anvil did not start in 10s"
    cat /tmp/ci-anvil.log
    exit 1
  fi
done

# ── 2. Deploy contracts ───────────────────────────────────────────────────────
echo -e "${YELLOW}Step 2: Deploy contracts...${NC}"
cd "$ROOT_DIR/contracts"

VRF_ADDR=$(forge create src/mocks/MockVRFAdapter.sol:MockVRFAdapter \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" --json 2>/dev/null | \
  node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).deployedTo)")
[ -z "$VRF_ADDR" ] && { fail "Deploy MockVRFAdapter"; exit 1; }
pass "MockVRFAdapter at $VRF_ADDR"

RCHIP_ADDR=$(forge create src/ChipToken.sol:ChipToken \
  --constructor-args "CIChip" "CICHIP" \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" --json 2>/dev/null | \
  node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).deployedTo)")
[ -z "$RCHIP_ADDR" ] && { fail "Deploy ChipToken"; exit 1; }
pass "ChipToken at $RCHIP_ADDR"

# Mint chips to both agents
AGENT_CHIPS=1000000000000000000000000
cast send "$RCHIP_ADDR" "mint(address,uint256)" "$AGENT0_ADDR" "$AGENT_CHIPS" \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null 2>&1
cast send "$RCHIP_ADDR" "mint(address,uint256)" "$AGENT1_ADDR" "$AGENT_CHIPS" \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null 2>&1

TABLE_ADDR=$(forge create src/PokerTable.sol:PokerTable \
  --constructor-args 1 1000000000000000000 2000000000000000000 "$VRF_ADDR" "$RCHIP_ADDR" \
    "0x0000000000000000000000000000000000000000" \
    1800 300 600 2 "0x0000000000000000000000000000000000000000" \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" --json 2>/dev/null | \
  node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).deployedTo)")
[ -z "$TABLE_ADDR" ] && { fail "Deploy PokerTable"; exit 1; }
pass "PokerTable at $TABLE_ADDR"

cast send "$VRF_ADDR" "setConsumer(address)" "$TABLE_ADDR" \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null 2>&1
pass "VRF consumer set"

# ── 3. Register 2 seats ───────────────────────────────────────────────────────
echo -e "${YELLOW}Step 3: Register 2 seats...${NC}"
cd "$ROOT_DIR"

BUY_IN=100000000000000000000  # 100 chips
for i in 0 1; do
  KEY_VAR="AGENT${i}_KEY"
  ADDR_VAR="AGENT${i}_ADDR"
  KEY="${!KEY_VAR}"
  ADDR="${!ADDR_VAR}"
  cast send "$RCHIP_ADDR" "approve(address,uint256)" "$TABLE_ADDR" "$BUY_IN" \
    --rpc-url "$RPC_URL" --private-key "$KEY" > /dev/null 2>&1
  cast send "$TABLE_ADDR" "registerSeat(uint8,address,address,uint256)" \
    "$i" "$ADDR" "$ADDR" "$BUY_IN" \
    --rpc-url "$RPC_URL" --private-key "$KEY" > /dev/null 2>&1
  pass "Seat $i registered for $ADDR"
done

CAN_START=$(cast call "$TABLE_ADDR" "canStartHand()(bool)" --rpc-url "$RPC_URL" 2>/dev/null)
[ "$CAN_START" = "true" ] && pass "Table ready to start" || { fail "canStartHand() = $CAN_START"; exit 1; }

# ── 4. Start OwnerView ────────────────────────────────────────────────────────
echo -e "${YELLOW}Step 4: Start OwnerView...${NC}"
JWT_SECRET="ci-e2e-secret-key-minimum-32-characters" \
RPC_URL="$RPC_URL" \
POKER_TABLE_ADDRESSES="$TABLE_ADDR" \
CHAIN_ENV=local \
PORT=3099 \
  node --import tsx "$ROOT_DIR/services/ownerview/src/index.ts" \
  > /tmp/ci-ownerview.log 2>&1 &
PIDS+=($!)

for i in $(seq 1 20); do
  sleep 0.5
  if curl -s "http://localhost:3099/auth/nonce?address=0x0000000000000000000000000000000000000000" \
      > /dev/null 2>&1; then
    pass "OwnerView running"
    break
  fi
  if [ "$i" -eq 20 ]; then
    fail "OwnerView did not start in 10s"
    cat /tmp/ci-ownerview.log
    exit 1
  fi
done

# ── 5. Start Keeper + 2 Agents ────────────────────────────────────────────────
echo -e "${YELLOW}Step 5: Start Keeper + 2 Agents...${NC}"

RPC_URL="$RPC_URL" \
KEEPER_PRIVATE_KEY="$KEEPER_KEY" \
POKER_TABLE_ADDRESSES="$TABLE_ADDR" \
CHAIN_ID="$CHAIN_ID" \
POLL_INTERVAL_MS=200 \
  node --import tsx "$ROOT_DIR/bots/keeper/src/index.ts" \
  > /tmp/ci-keeper.log 2>&1 &
PIDS+=($!)
pass "Keeper started"

sleep 0.5

for i in 0 1; do
  KEY_VAR="AGENT${i}_KEY"
  KEY="${!KEY_VAR}"
  RPC_URL="$RPC_URL" \
  OPERATOR_PRIVATE_KEY="$KEY" \
  POKER_TABLE_ADDRESS="$TABLE_ADDR" \
  OWNERVIEW_URL=http://localhost:3099 \
  CHAIN_ID="$CHAIN_ID" \
  POLL_INTERVAL_MS=200 \
  MAX_HANDS="$NUM_HANDS" \
  TURN_ACTION_DELAY_MS=0 \
    node --import tsx "$ROOT_DIR/bots/agent/src/index.ts" \
    > "/tmp/ci-agent${i}.log" 2>&1 &
  PIDS+=($!)
  pass "Agent $i started"
done

# ── 6. Wait for hand completion ───────────────────────────────────────────────
echo -e "${YELLOW}Step 6: Waiting for $NUM_HANDS hand(s)...${NC}"

MAX_WAIT=90
ELAPSED=0
INTERVAL=2

while [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))

  HAND_ID=$(cast call "$TABLE_ADDR" "currentHandId()(uint256)" \
    --rpc-url "$RPC_URL" 2>/dev/null || echo "0")

  echo "  [${ELAPSED}s] Hand ID: $HAND_ID"

  if [ "$HAND_ID" -gt "$NUM_HANDS" ] 2>/dev/null; then
    pass "Reached hand $HAND_ID (target: $NUM_HANDS)"
    break
  fi

  # Check if agents still alive
  ALL_DONE=true
  for pid in "${PIDS[@]:2}"; do
    kill -0 "$pid" 2>/dev/null && ALL_DONE=false && break
  done
  if $ALL_DONE; then
    echo "  Agents completed"
    break
  fi
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  fail "Timed out after ${MAX_WAIT}s waiting for hand completion"
fi

# ── 7. Verify settlement on-chain ─────────────────────────────────────────────
echo -e "${YELLOW}Step 7: Verify settlement...${NC}"

FINAL_HAND=$(cast call "$TABLE_ADDR" "currentHandId()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
if [ "$FINAL_HAND" -gt "0" ] 2>/dev/null; then
  pass "Hands played (handId=$FINAL_HAND)"
else
  fail "No hands played (handId=$FINAL_HAND)"
fi

# Check HandSettled events via cast logs
TOPIC=$(cast keccak "HandSettled(uint256,uint8,uint256)" 2>/dev/null || echo "")
if [ -n "$TOPIC" ]; then
  SETTLED=$(cast logs --address "$TABLE_ADDR" --topic0 "0x${TOPIC#0x}" \
    --rpc-url "$RPC_URL" --json 2>/dev/null | \
    node -e "let d='';process.stdin.on('data',x=>d+=x);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).length)}catch{console.log(0)}})" \
    2>/dev/null || echo "0")
  if [ "$SETTLED" -ge "$NUM_HANDS" ] 2>/dev/null; then
    pass "HandSettled events on-chain: $SETTLED"
  else
    fail "Expected >= $NUM_HANDS HandSettled events, got $SETTLED"
  fi
fi

# Check for fatal errors in agent logs
for i in 0 1; do
  FATAL=$(grep -c "Fatal error\|Unrecoverable" "/tmp/ci-agent${i}.log" 2>/dev/null || echo "0")
  if [ "$FATAL" -eq 0 ]; then
    pass "Agent $i: no fatal errors"
  else
    fail "Agent $i: $FATAL fatal error(s)"
  fi
done

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${YELLOW}=== Summary ===${NC}"
echo "  Passed: $PASS_COUNT  Failed: $FAIL_COUNT"

if [ $FAIL_COUNT -gt 0 ]; then
  echo -e "${RED}E2E FAILED${NC}"
  echo "Logs: /tmp/ci-{anvil,ownerview,keeper,agent0,agent1}.log"
  exit 1
else
  echo -e "${GREEN}E2E PASSED${NC}"
fi
