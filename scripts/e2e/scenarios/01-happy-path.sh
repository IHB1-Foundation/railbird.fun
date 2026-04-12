#!/bin/bash
# E2E Scenario 01 — Happy Path: 2 agents, 1 hand to completion
# Tests the minimal baseline: deploy, register 2 seats, play 1 hand, verify settlement.

set -e
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

echo -e "${GREEN}=== Scenario 01: Happy Path (2 agents, 1 hand) ===${NC}"

# 1. Anvil
e2e_start_anvil 18545

# 2. Contracts
e2e_deploy_contracts 2 300

# 3. Seats
e2e_register_seats 2

# 4. Services
e2e_start_ownerview 13091
e2e_start_keeper
e2e_start_agent 0 1
e2e_start_agent 1 1

# 5. Wait for 1 hand
e2e_wait_hands 1 120

# 6. Assert settlement
e2e_assert_settlements 1

# 7. Contract state: back to SETTLED (10) or WAITING_FOR_SEATS (0)
FINAL_STATE=$(cast call "$TABLE_ADDR" "gameState()(uint8)" --rpc-url "$RPC_URL" 2>/dev/null || echo "255")
if [ "$FINAL_STATE" = "10" ] || [ "$FINAL_STATE" = "0" ]; then
  pass "gameState=$FINAL_STATE (SETTLED or WAITING_FOR_SEATS)"
else
  fail "Unexpected final gameState=$FINAL_STATE"
fi

e2e_summary "Scenario 01: Happy Path"
