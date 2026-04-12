#!/bin/bash
# E2E Scenario 04 — Agent Crash & Recovery
# Tests: one agent is killed mid-hand, restarted, game continues.
# Verifies that after crash + restart the hand eventually resolves.

set -e
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

echo -e "${GREEN}=== Scenario 04: Agent Crash & Recovery ===${NC}"

# 1. Anvil
e2e_start_anvil 18548

# 2. Contracts
e2e_deploy_contracts 2 300

# 3. Seats
e2e_register_seats 2

# 4. Services — start both agents, max 2 hands
e2e_start_ownerview 13094
e2e_start_keeper
e2e_start_agent 0 2
AGENT0_PID="${PIDS[-1]}"
e2e_start_agent 1 2
AGENT1_PID="${PIDS[-1]}"

# 5. Wait a few seconds so the first hand starts
sleep 8
HAND_ID_BEFORE=$(cast call "$TABLE_ADDR" "currentHandId()(uint256)" --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
echo "  Hand ID before crash: $HAND_ID_BEFORE"

# 6. Kill agent 0 (simulate crash)
if kill -0 "$AGENT0_PID" 2>/dev/null; then
  kill -9 "$AGENT0_PID" 2>/dev/null || true
  pass "Killed agent-0 (PID $AGENT0_PID)"
else
  warn "Agent-0 already exited — crash scenario may not be meaningful"
fi

# 7. Let keeper handle the orphaned hand if needed, then restart agent 0
sleep 5

echo -e "${YELLOW}Restarting agent-0...${NC}"
RPC_URL="$RPC_URL" \
OPERATOR_PRIVATE_KEY="${AGENT_KEYS[0]}" \
POKER_TABLE_ADDRESS="$TABLE_ADDR" \
OWNERVIEW_URL="${OWNERVIEW_URL:-http://localhost:13094}" \
CHAIN_ID="$CHAIN_ID" \
POLL_INTERVAL_MS=300 \
MAX_HANDS=2 \
TURN_ACTION_DELAY_MS=0 \
  node --import tsx "$ROOT_DIR/bots/agent/src/index.ts" \
  >> /tmp/e2e-agent0.log 2>&1 &
RESTARTED_PID=$!
PIDS+=($RESTARTED_PID)
pass "Agent-0 restarted (PID $RESTARTED_PID)"

# 8. Wait for hands to eventually complete
e2e_wait_hands 1 150

# 9. Assert at least 1 settlement happened
e2e_assert_settlements 1

# 10. Verify logs: no "Fatal error" that wasn't recovered
CRASH_ERRORS=$(grep -c "Fatal error\|Unrecoverable" /tmp/e2e-agent0.log 2>/dev/null || echo "0")
if [ "$CRASH_ERRORS" = "0" ]; then
  pass "No fatal errors in agent-0 log after restart"
else
  warn "agent-0 had $CRASH_ERRORS fatal error(s) — inspect /tmp/e2e-agent0.log"
fi

e2e_summary "Scenario 04: Agent Crash & Recovery"
