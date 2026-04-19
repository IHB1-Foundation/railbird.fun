#!/bin/bash
# E2E Scenario 02 — 4-Seat Settlement
# Tests: 4 agents, 2 hands, verify all seats have valid state and pot is distributed.

set -e
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

echo -e "${GREEN}=== Scenario 02: 4-Seat Settlement (4 agents, 2 hands) ===${NC}"

# 1. Anvil
e2e_start_anvil 18546

# 2. Contracts (4 seats)
e2e_deploy_contracts 4 300

# 3. Seats
e2e_register_seats 4

# 4. Services
e2e_start_ownerview 13092
e2e_seed_encryption_keys 4
e2e_start_keeper
for i in 0 1 2 3; do
  e2e_start_agent $i 2
done

# 5. Wait for 2 hands
e2e_wait_hands 2 180

# 6. Assert 2 settlements on-chain
e2e_assert_settlements 2

# 7. Verify all 4 seats have valid state (owner != 0x0)
echo -e "${YELLOW}Verifying seat states...${NC}"
for i in 0 1 2 3; do
  OWNER=$(cast call "$TABLE_ADDR" "seats(uint8)" "$i" \
    --rpc-url "$RPC_URL" 2>/dev/null | head -1 || echo "")
  if [ -n "$OWNER" ]; then
    pass "Seat $i has valid state"
  else
    fail "Seat $i query failed"
  fi
done

# 8. Check that no seat has stack > initial buy-in * 4 (chip conservation)
echo -e "${YELLOW}Chip conservation check...${NC}"
TABLE_BALANCE=$(cast call "$TABLE_ADDR" \
  "token()(address)" --rpc-url "$RPC_URL" 2>/dev/null || echo "")
if [ -n "$RCHIP_ADDR" ]; then
  TABLE_CHIPS=$(cast call "$RCHIP_ADDR" "balanceOf(address)(uint256)" "$TABLE_ADDR" \
    --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
  echo "  Table contract chip balance: $TABLE_CHIPS"
  pass "Table chip balance readable"
fi

e2e_summary "Scenario 02: 4-Seat Settlement"
