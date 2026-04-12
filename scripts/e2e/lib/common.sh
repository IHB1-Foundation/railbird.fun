#!/bin/bash
# scripts/e2e/lib/common.sh
# Common setup, teardown, and assertion helpers for Railbird E2E scenarios.
#
# Usage: source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"
#
# Exports:
#   ROOT_DIR, RPC_URL, CHAIN_ID
#   DEPLOYER_KEY, DEPLOYER_ADDR
#   AGENT_KEYS[4], AGENT_ADDRS[4], KEEPER_KEY
#   VRF_ADDR, RCHIP_ADDR, TABLE_ADDR  (set by e2e_deploy_contracts)
#   PIDS[]   (background process IDs for cleanup)
#   PASS_COUNT, FAIL_COUNT
#
# Functions:
#   pass MSG        — log a passing assertion
#   fail MSG        — log a failing assertion
#   e2e_start_anvil [port] — start anvil on given port (default 18545)
#   e2e_deploy_contracts [num_seats] — deploy VRF, ChipToken, PokerTable
#   e2e_register_seats N — register first N seats
#   e2e_start_ownerview [port] — start ownerview service
#   e2e_start_agent IDX [max_hands] — start agent bot for seat IDX
#   e2e_start_keeper — start keeper bot
#   e2e_wait_hands N [max_secs] — wait for N hands to complete
#   e2e_assert_settlements N — assert >= N HandSettled events on-chain
#   e2e_summary — print pass/fail summary and exit with appropriate code

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CHAIN_ID=31337
ANVIL_PORT=${ANVIL_PORT:-18545}
RPC_URL="http://127.0.0.1:${ANVIL_PORT}"
OWNERVIEW_PORT=${OWNERVIEW_PORT:-13099}

# Anvil deterministic accounts
DEPLOYER_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
DEPLOYER_ADDR=0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266

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

VRF_ADDR=""
RCHIP_ADDR=""
TABLE_ADDR=""
ANVIL_PID=""
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

warn() {
  echo -e "  ${YELLOW}WARN${NC}: $1"
}

e2e_cleanup() {
  echo ""
  echo -e "${YELLOW}Cleaning up...${NC}"
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  if [ -n "$ANVIL_PID" ]; then
    kill "$ANVIL_PID" 2>/dev/null || true
  fi
  wait 2>/dev/null || true
}

trap e2e_cleanup EXIT INT TERM

# ── Anvil ──────────────────────────────────────────────────────────────────────

e2e_start_anvil() {
  local port=${1:-$ANVIL_PORT}
  RPC_URL="http://127.0.0.1:${port}"
  anvil --host 127.0.0.1 --port "$port" --block-time 1 > "/tmp/e2e-anvil-${port}.log" 2>&1 &
  ANVIL_PID=$!

  for i in $(seq 1 30); do
    sleep 0.5
    if cast block-number --rpc-url "$RPC_URL" > /dev/null 2>&1; then
      pass "Anvil ready on port $port (PID $ANVIL_PID)"
      return 0
    fi
  done
  fail "Anvil did not start on port $port in 15s"
  exit 1
}

# ── Contract deployment ────────────────────────────────────────────────────────

e2e_deploy_contracts() {
  local num_seats=${1:-2}
  local action_timeout=${2:-300}  # 5 min default for e2e

  echo -e "${YELLOW}Deploying contracts (${num_seats} seats)...${NC}"
  cd "$ROOT_DIR/contracts"

  VRF_ADDR=$(forge create src/mocks/MockVRFAdapter.sol:MockVRFAdapter \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" --json 2>/dev/null | \
    node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).deployedTo)")
  [ -z "$VRF_ADDR" ] && { fail "Deploy MockVRFAdapter"; exit 1; }
  pass "MockVRFAdapter at $VRF_ADDR"

  RCHIP_ADDR=$(forge create src/ChipToken.sol:ChipToken \
    --constructor-args "E2EChip" "E2ECHIP" \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" --json 2>/dev/null | \
    node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).deployedTo)")
  [ -z "$RCHIP_ADDR" ] && { fail "Deploy ChipToken"; exit 1; }
  pass "ChipToken at $RCHIP_ADDR"

  local agent_chips=1000000000000000000000000
  for i in 0 1 2 3; do
    cast send "$RCHIP_ADDR" "mint(address,uint256)" "${AGENT_ADDRS[$i]}" "$agent_chips" \
      --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null 2>&1
  done
  pass "Minted chips to all 4 agents"

  TABLE_ADDR=$(forge create src/PokerTable.sol:PokerTable \
    --constructor-args 1 1000000000000000000 2000000000000000000 \
      "$VRF_ADDR" "$RCHIP_ADDR" "0x0000000000000000000000000000000000000000" \
      "$action_timeout" 60 120 "$num_seats" "0x0000000000000000000000000000000000000000" \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" --json 2>/dev/null | \
    node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).deployedTo)")
  [ -z "$TABLE_ADDR" ] && { fail "Deploy PokerTable"; exit 1; }
  pass "PokerTable(${num_seats} seats) at $TABLE_ADDR"

  cast send "$VRF_ADDR" "setConsumer(address)" "$TABLE_ADDR" \
    --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null 2>&1
  pass "VRF consumer configured"

  cd "$ROOT_DIR"
}

# ── Seat registration ──────────────────────────────────────────────────────────

e2e_register_seats() {
  local n=${1:-2}
  local buy_in=${2:-100000000000000000000}  # 100 chips

  echo -e "${YELLOW}Registering ${n} seats...${NC}"
  for i in $(seq 0 $((n - 1))); do
    cast send "$RCHIP_ADDR" "approve(address,uint256)" "$TABLE_ADDR" "$buy_in" \
      --rpc-url "$RPC_URL" --private-key "${AGENT_KEYS[$i]}" > /dev/null 2>&1
    cast send "$TABLE_ADDR" "registerSeat(uint8,address,address,uint256)" \
      "$i" "${AGENT_ADDRS[$i]}" "${AGENT_ADDRS[$i]}" "$buy_in" \
      --rpc-url "$RPC_URL" --private-key "${AGENT_KEYS[$i]}" > /dev/null 2>&1
    pass "Seat $i registered for ${AGENT_ADDRS[$i]}"
  done

  local can_start
  can_start=$(cast call "$TABLE_ADDR" "canStartHand()(bool)" --rpc-url "$RPC_URL" 2>/dev/null || echo "false")
  if [ "$can_start" = "true" ]; then
    pass "Table ready (canStartHand=true)"
  else
    fail "canStartHand() = $can_start after registering $n seats"
    exit 1
  fi
}

# ── Services ───────────────────────────────────────────────────────────────────

e2e_start_ownerview() {
  local port=${1:-$OWNERVIEW_PORT}
  echo -e "${YELLOW}Starting OwnerView on port ${port}...${NC}"

  JWT_SECRET="e2e-test-secret-key-minimum-32-characters" \
  RPC_URL="$RPC_URL" \
  POKER_TABLE_ADDRESSES="$TABLE_ADDR" \
  CHAIN_ENV=local \
  PORT="$port" \
    node --import tsx "$ROOT_DIR/services/ownerview/src/index.ts" \
    > "/tmp/e2e-ownerview-${port}.log" 2>&1 &
  PIDS+=($!)

  for i in $(seq 1 20); do
    sleep 0.5
    if curl -s "http://localhost:${port}/auth/nonce?address=0x0000000000000000000000000000000000000000" \
        > /dev/null 2>&1; then
      pass "OwnerView running on port $port"
      export OWNERVIEW_URL="http://localhost:${port}"
      return 0
    fi
  done
  fail "OwnerView did not start in 10s"
  cat "/tmp/e2e-ownerview-${port}.log"
  exit 1
}

e2e_start_keeper() {
  echo -e "${YELLOW}Starting Keeper...${NC}"
  RPC_URL="$RPC_URL" \
  KEEPER_PRIVATE_KEY="$KEEPER_KEY" \
  POKER_TABLE_ADDRESS="$TABLE_ADDR" \
  CHAIN_ID="$CHAIN_ID" \
  POLL_INTERVAL_MS=300 \
    node --import tsx "$ROOT_DIR/bots/keeper/src/index.ts" \
    > /tmp/e2e-keeper.log 2>&1 &
  PIDS+=($!)
  pass "Keeper started (PID ${PIDS[-1]})"
}

e2e_start_agent() {
  local idx=${1:-0}
  local max_hands=${2:-1}
  RPC_URL="$RPC_URL" \
  OPERATOR_PRIVATE_KEY="${AGENT_KEYS[$idx]}" \
  POKER_TABLE_ADDRESS="$TABLE_ADDR" \
  OWNERVIEW_URL="${OWNERVIEW_URL:-http://localhost:${OWNERVIEW_PORT}}" \
  CHAIN_ID="$CHAIN_ID" \
  POLL_INTERVAL_MS=300 \
  MAX_HANDS="$max_hands" \
  TURN_ACTION_DELAY_MS=0 \
    node --import tsx "$ROOT_DIR/bots/agent/src/index.ts" \
    > "/tmp/e2e-agent${idx}.log" 2>&1 &
  PIDS+=($!)
  pass "Agent seat-${idx} started (PID ${PIDS[-1]}, max_hands=$max_hands)"
}

# ── Waiting & assertions ───────────────────────────────────────────────────────

e2e_wait_hands() {
  local target_hands=${1:-1}
  local max_secs=${2:-120}
  local elapsed=0
  local interval=3

  echo -e "${YELLOW}Waiting for ${target_hands} hands (max ${max_secs}s)...${NC}"
  while [ $elapsed -lt $max_secs ]; do
    sleep $interval
    elapsed=$((elapsed + interval))

    local hand_id
    hand_id=$(cast call "$TABLE_ADDR" "currentHandId()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
    local state
    state=$(cast call "$TABLE_ADDR" "gameState()(uint8)" --rpc-url "$RPC_URL" 2>/dev/null || echo "?")

    echo "  [${elapsed}s] handId=$hand_id state=$state"

    if [ "$hand_id" -gt "$target_hands" ] 2>/dev/null; then
      pass "Reached handId $hand_id (target >$target_hands)"
      return 0
    fi
  done
  fail "Timed out waiting for $target_hands hands after ${max_secs}s"
  return 1
}

e2e_assert_settlements() {
  local expected=${1:-1}
  local topic
  topic="0x$(cast keccak "HandSettled(uint256,uint8,uint256)" 2>/dev/null | sed 's/0x//')"

  if [ -z "$topic" ] || [ "$topic" = "0x" ]; then
    warn "Could not compute HandSettled topic — skipping event assertion"
    return 0
  fi

  local count
  count=$(cast logs \
    --address "$TABLE_ADDR" \
    --topic0 "$topic" \
    --rpc-url "$RPC_URL" \
    --json 2>/dev/null | \
    node -e "let d='';process.stdin.on('data',x=>d+=x);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).length);}catch{console.log(0);}})" \
    2>/dev/null || echo "0")

  echo "  HandSettled events on-chain: $count"
  if [ "$count" -ge "$expected" ] 2>/dev/null; then
    pass "HandSettled events >= $expected (got $count)"
  else
    fail "Expected >= $expected HandSettled events, got $count"
  fi
}

e2e_assert_game_state() {
  local expected_state=$1
  local label=${2:-""}
  local state
  state=$(cast call "$TABLE_ADDR" "gameState()(uint8)" --rpc-url "$RPC_URL" 2>/dev/null || echo "255")
  if [ "$state" = "$expected_state" ]; then
    pass "gameState=$state $label"
  else
    fail "Expected gameState=$expected_state, got $state $label"
  fi
}

e2e_summary() {
  local scenario=${1:-"E2E"}
  echo ""
  echo -e "${GREEN}=== $scenario Summary ===${NC}"
  echo "  Passed: $PASS_COUNT"
  if [ "$FAIL_COUNT" -gt 0 ]; then
    echo -e "  ${RED}Failed: $FAIL_COUNT${NC}"
    exit 1
  else
    echo "  Failed: 0"
    echo -e "${GREEN}SCENARIO PASSED${NC}"
    exit 0
  fi
}
