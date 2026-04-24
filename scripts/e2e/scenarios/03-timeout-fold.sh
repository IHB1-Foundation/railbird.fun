#!/bin/bash
# E2E Scenario 03 — Timeout Fold
# Tests: keeper calls forceTimeout when action deadline expires.
# Setup: 2 seats registered, NO agents started → hand starts, player times out.
# Keeper should call forceTimeout → hand settles.

set -e
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

echo -e "${GREEN}=== Scenario 03: Timeout Fold (keeper forceTimeout) ===${NC}"

# 1. Anvil
e2e_start_anvil 18547

# 2. Contracts — short action timeout so timeout fires quickly (60s)
e2e_deploy_contracts 2 60

# 3. Seats
e2e_register_seats 2

# 4. Start keeper (will call forceTimeout when deadline passes)
e2e_start_ownerview 13093
e2e_seed_encryption_keys 2
e2e_start_keeper

# 5. Manually start the hand (no agents, so nobody acts → timeout fires)
echo -e "${YELLOW}Starting hand manually (no agents)...${NC}"
cast send "$TABLE_ADDR" "startHand()" \
  --rpc-url "$RPC_URL" \
  --private-key "$DEPLOYER_KEY" > /dev/null 2>&1
pass "Hand started"

# Wait for keeper + dealer to move the hand into preflop, then fast-forward Anvil time.
echo -e "${YELLOW}Waiting for BETTING_PRE before forcing the timeout...${NC}"
MAX_WAIT=20
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  STATE=$(cast call "$TABLE_ADDR" "gameState()(uint8)" --rpc-url "$RPC_URL" 2>/dev/null || echo "255")
  echo "  [${ELAPSED}s] state=$STATE"
  if [ "$STATE" = "2" ]; then
    pass "Hand reached BETTING_PRE"
    break
  fi
done

if [ "$STATE" != "2" ]; then
  fail "Hand did not reach BETTING_PRE within ${MAX_WAIT}s"
  echo "  Keeper log tail:"
  tail -20 /tmp/e2e-keeper.log 2>/dev/null || true
  exit 1
fi

cast rpc --rpc-url "$RPC_URL" evm_increaseTime 61 > /dev/null
cast rpc --rpc-url "$RPC_URL" evm_mine > /dev/null
pass "Fast-forwarded Anvil past the 60s action timeout"

# 6. Wait for keeper to detect timeout and call forceTimeout
echo -e "${YELLOW}Waiting up to 20s for keeper to call forceTimeout...${NC}"
MAX_WAIT=20
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))

  HAND_ID=$(cast call "$TABLE_ADDR" "currentHandId()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
  STATE=$(cast call "$TABLE_ADDR" "gameState()(uint8)" --rpc-url "$RPC_URL" 2>/dev/null || echo "255")
  echo "  [${ELAPSED}s] handId=$HAND_ID state=$STATE"

  if [ "$STATE" = "10" ] || [ "$STATE" = "0" ] || [ "$STATE" = "11" ]; then
    pass "Hand settled via timeout (state=$STATE)"
    break
  fi
done

if [ "$STATE" != "10" ] && [ "$STATE" != "0" ] && [ "$STATE" != "11" ]; then
  fail "Keeper did not call forceTimeout within ${MAX_WAIT}s"
  echo "  Keeper log tail:"
  tail -20 /tmp/e2e-keeper.log 2>/dev/null || true
  exit 1
fi

# 7. Verify HandSettled or HandAborted event fired
echo -e "${YELLOW}Checking on-chain events...${NC}"
HAND_SETTLED_TOPIC="0x$(cast keccak "HandSettled(uint256,uint8,uint256)" 2>/dev/null | sed 's/0x//')"
HAND_ABORTED_TOPIC="0x$(cast keccak "HandAborted(uint256,uint8,bytes32)" 2>/dev/null | sed 's/0x//')"

SETTLED=$(cast logs --address "$TABLE_ADDR" --topic0 "$HAND_SETTLED_TOPIC" \
  --rpc-url "$RPC_URL" --json 2>/dev/null | \
  node -e "let d='';process.stdin.on('data',x=>d+=x);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).length);}catch{console.log(0);}})" \
  2>/dev/null || echo "0")
ABORTED=$(cast logs --address "$TABLE_ADDR" --topic0 "$HAND_ABORTED_TOPIC" \
  --rpc-url "$RPC_URL" --json 2>/dev/null | \
  node -e "let d='';process.stdin.on('data',x=>d+=x);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).length);}catch{console.log(0);}})" \
  2>/dev/null || echo "0")

echo "  HandSettled events: $SETTLED"
echo "  HandAborted events: $ABORTED"

if [ "$SETTLED" -ge "1" ] 2>/dev/null || [ "$ABORTED" -ge "1" ] 2>/dev/null; then
  pass "Hand resolved via timeout (settled=$SETTLED, aborted=$ABORTED)"
else
  FINAL_STATE=$(cast call "$TABLE_ADDR" "gameState()(uint8)" --rpc-url "$RPC_URL" 2>/dev/null || echo "255")
  if [ "$FINAL_STATE" = "10" ] || [ "$FINAL_STATE" = "0" ] || [ "$FINAL_STATE" = "11" ]; then
    warn "Timeout resolution logs missing; inferring success from final state=$FINAL_STATE"
    pass "Hand resolved via timeout state transition"
  else
    fail "No HandSettled or HandAborted event found"
  fi
fi

e2e_summary "Scenario 03: Timeout Fold"
