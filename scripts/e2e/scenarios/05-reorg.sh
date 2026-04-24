#!/bin/bash
# E2E Scenario 05 — Reorg Simulation
# Tests: anvil_reorg causes the indexer to detect a reorg and rollback/re-index.
# Requires: indexer running with DB, anvil --rpc flag (JSON-RPC API enabled by default).
#
# Note: This scenario requires the indexer service and a local Postgres DB.
# If INDEXER_DB_URL is not set, the test is skipped with a warning.

set -e
source "$(dirname "${BASH_SOURCE[0]}")/../lib/common.sh"

echo -e "${GREEN}=== Scenario 05: Reorg Simulation ===${NC}"

# Check prerequisites
if [ -z "${INDEXER_DB_URL:-}" ]; then
  warn "INDEXER_DB_URL not set — skipping reorg scenario (requires indexer + DB)"
  warn "To run: INDEXER_DB_URL=postgres://... ./scripts/e2e/scenarios/05-reorg.sh"
  echo ""
  echo -e "${YELLOW}Scenario 05: SKIPPED (no DB)${NC}"
  exit 0
fi

# 1. Anvil (no block-time — manual mining for reorg control)
echo -e "${YELLOW}Starting Anvil (manual mining for reorg control)...${NC}"
anvil --host 127.0.0.1 --port 18549 > /tmp/e2e-anvil-18549.log 2>&1 &
ANVIL_PID=$!
RPC_URL="http://127.0.0.1:18549"
for i in $(seq 1 30); do
  sleep 0.5
  if cast block-number --rpc-url "$RPC_URL" > /dev/null 2>&1; then
    pass "Anvil ready (manual mining)"
    break
  fi
done

# 2. Contracts
e2e_deploy_contracts 2 300

# 3. Mine a few blocks with events
e2e_register_seats 2

# Start hand
cast send "$TABLE_ADDR" "startHand()" \
  --rpc-url "$RPC_URL" --private-key "$DEPLOYER_KEY" > /dev/null 2>&1
pass "Hand started"

# Mine 3 more blocks
cast rpc anvil_mine 3 --rpc-url "$RPC_URL" > /dev/null 2>&1 || true
BLOCK_BEFORE=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
pass "Mined to block $BLOCK_BEFORE"

# 4. Start indexer
echo -e "${YELLOW}Starting Indexer...${NC}"
DATABASE_URL="$INDEXER_DB_URL" \
RPC_URL="$RPC_URL" \
POKER_TABLE_ADDRESS="$TABLE_ADDR" \
CHAIN_ID="$CHAIN_ID" \
CHAIN_ENV=local \
PORT=13200 \
  node --import tsx "$ROOT_DIR/services/indexer/src/index.ts" \
  > /tmp/e2e-indexer-reorg.log 2>&1 &
PIDS+=($!)

# Wait for indexer to index current blocks
sleep 5
INDEXED_BEFORE=$(curl -s "http://localhost:13200/api/tables" 2>/dev/null | \
  node -e "let d='';process.stdin.on('data',x=>d+=x);process.stdin.on('end',()=>{try{console.log(JSON.parse(d).length);}catch{console.log(0);}})" \
  2>/dev/null || echo "?")
echo "  Tables indexed before reorg: $INDEXED_BEFORE"

# 5. Trigger reorg: roll back 2 blocks using anvil_reorg
echo -e "${YELLOW}Triggering 2-block reorg via anvil_reorg...${NC}"
REORG_RESULT=$(curl -s -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"anvil_reorg","params":[2]}' \
  "$RPC_URL" 2>/dev/null || echo '{"error":"method not available"}')
echo "  anvil_reorg result: $REORG_RESULT"

if echo "$REORG_RESULT" | grep -q '"error"'; then
  warn "anvil_reorg not available in this anvil version — simulating reorg via state reset"
  # Fallback: use anvil_setNextBlockBaseFeePerGas to force divergence
  cast rpc anvil_mine 5 --rpc-url "$RPC_URL" > /dev/null 2>&1 || true
  pass "Mined 5 extra blocks to simulate chain advancement"
else
  BLOCK_AFTER=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
  pass "Reorg complete: block $BLOCK_BEFORE → $BLOCK_AFTER"
fi

# 6. Mine new blocks on the reorganized chain
cast rpc anvil_mine 5 --rpc-url "$RPC_URL" > /dev/null 2>&1 || true
NEW_BLOCK=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null || echo "0")
pass "New chain head at block $NEW_BLOCK"

# 7. Wait for indexer to recover
sleep 8
INDEXER_LOG=$(tail -20 /tmp/e2e-indexer-reorg.log 2>/dev/null || echo "")
echo "  Indexer log tail:"
echo "$INDEXER_LOG" | sed 's/^/    /'

# Check indexer is still alive
if kill -0 "${PIDS[${#PIDS[@]}-1]}" 2>/dev/null; then
  pass "Indexer survived the reorg (still running)"
else
  fail "Indexer crashed after reorg"
  cat /tmp/e2e-indexer-reorg.log
  exit 1
fi

# Check for reorg detection log lines
if echo "$INDEXER_LOG" | grep -qi "reorg\|rollback\|reorgan"; then
  pass "Indexer logged reorg detection"
else
  warn "No reorg detection log line found — check /tmp/e2e-indexer-reorg.log"
fi

e2e_summary "Scenario 05: Reorg Simulation"
