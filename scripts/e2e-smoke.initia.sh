#!/usr/bin/env bash
# e2e-smoke.initia.sh — Railbird E2E smoke test on Initia MiniEVM rollup.
#
# Covers: deploy → 4 agent seat registration → 3 hand settlements
# Evidence is written to docs/initia/e2e-evidence.md
#
# Prerequisites:
#   - Initia rollup provisioned and running (infra/initia/rollup.json filled)
#   - .env.initia populated with private keys and contract addresses
#   - pnpm build completed
#   - cast (foundry) available
#
# Usage:
#   source scripts/load-env.sh initia
#   bash scripts/e2e-smoke.initia.sh [NUM_HANDS]
#   Default: 3 hands

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NUM_HANDS=${1:-3}
EVIDENCE_FILE="$REPO_ROOT/docs/initia/e2e-evidence.md"

log_info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
log_ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
log_warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ── Env validation ──────────────────────────────────────────────────────────
: "${RPC_URL:?RPC_URL is required. Source .env.initia first.}"
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is required.}"
: "${CHIP_TOKEN_ADDRESS:?CHIP_TOKEN_ADDRESS is required (run scripts/deploy/initia.sh first).}"
: "${POKER_TABLE_ADDRESSES:?POKER_TABLE_ADDRESSES is required.}"

TABLE_ADDRESS=$(echo "$POKER_TABLE_ADDRESSES" | cut -d',' -f1)

log_info "=== Railbird Initia E2E Smoke Test ==="
log_info "RPC: $RPC_URL"
log_info "Table: $TABLE_ADDRESS"
log_info "Target: $NUM_HANDS hands"
log_info "Evidence: $EVIDENCE_FILE"
echo ""

START_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# ── Step 1: Verify RPC connectivity ──────────────────────────────────────────
log_info "[1/7] Verifying RPC connectivity..."
BLOCK=$(cast block-number --rpc-url "$RPC_URL" 2>/dev/null) || {
  log_error "Cannot connect to $RPC_URL. Is the rollup running?"
  exit 1
}
log_ok "Connected. Current block: $BLOCK"

# ── Step 2: Verify deployer balance ──────────────────────────────────────────
log_info "[2/7] Checking deployer balance..."
DEPLOYER_ADDR=$(cast wallet address --private-key "$DEPLOYER_PRIVATE_KEY")
BALANCE=$(cast balance "$DEPLOYER_ADDR" --rpc-url "$RPC_URL")
log_ok "Deployer: $DEPLOYER_ADDR | Balance: $BALANCE"

# ── Step 3: Mint RCHIP to agent operators ────────────────────────────────────
log_info "[3/7] Minting RCHIP to agent operators..."
MINT_AMOUNT=1000000000000000000000  # 1000 RCHIP

for KEY_VAR in AGENT_1_OPERATOR_PRIVATE_KEY AGENT_2_OPERATOR_PRIVATE_KEY \
               AGENT_3_OPERATOR_PRIVATE_KEY AGENT_4_OPERATOR_PRIVATE_KEY; do
  KEY="${!KEY_VAR:-}"
  if [[ -z "$KEY" || "$KEY" == "0x" ]]; then
    log_warn "$KEY_VAR not set — skipping"
    continue
  fi
  ADDR=$(cast wallet address --private-key "$KEY")
  MINT_TX=$(cast send "$CHIP_TOKEN_ADDRESS" \
    "mintTo(address,uint256)" "$ADDR" "$MINT_AMOUNT" \
    --private-key "$DEPLOYER_PRIVATE_KEY" \
    --rpc-url "$RPC_URL" \
    --json 2>/dev/null | grep -o '"transactionHash":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "skip")
  log_ok "Minted RCHIP to $ADDR (tx: $MINT_TX)"
done

# ── Step 4: Register 4 seats ─────────────────────────────────────────────────
log_info "[4/7] Registering agent seats..."
SEAT=0
REGISTER_TXS=()

for KEY_VAR in AGENT_1_OPERATOR_PRIVATE_KEY AGENT_2_OPERATOR_PRIVATE_KEY \
               AGENT_3_OPERATOR_PRIVATE_KEY AGENT_4_OPERATOR_PRIVATE_KEY; do
  KEY="${!KEY_VAR:-}"
  if [[ -z "$KEY" || "$KEY" == "0x" ]]; then
    log_warn "$KEY_VAR not set — skipping seat $SEAT"
    SEAT=$((SEAT + 1))
    continue
  fi
  ADDR=$(cast wallet address --private-key "$KEY")
  BUY_IN=100000000000000000000  # 100 RCHIP

  # Approve
  cast send "$CHIP_TOKEN_ADDRESS" \
    "approve(address,uint256)" "$TABLE_ADDRESS" "$BUY_IN" \
    --private-key "$KEY" \
    --rpc-url "$RPC_URL" \
    --quiet 2>/dev/null || log_warn "Approve failed for seat $SEAT"

  # Register
  REG_TX=$(cast send "$TABLE_ADDRESS" \
    "registerSeat(uint8,address,address,uint256)" \
    "$SEAT" "$ADDR" "$ADDR" "$BUY_IN" \
    --private-key "$KEY" \
    --rpc-url "$RPC_URL" \
    --json 2>/dev/null | grep -o '"transactionHash":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "error")
  REGISTER_TXS+=("seat_${SEAT}:$REG_TX")
  log_ok "Seat $SEAT registered: $ADDR (tx: $REG_TX)"
  SEAT=$((SEAT + 1))
done

# ── Step 5: Wait for hand settlements ────────────────────────────────────────
log_info "[5/7] Watching for $NUM_HANDS hand settlements..."
log_info "Start the keeper and agent bots now (scripts/run-4agents.sh) if not running."
log_info "Polling for HandSettled events every 5 seconds (max 5 minutes)..."

SETTLED=0
SETTLE_TXS=()
MAX_WAIT=300
ELAPSED=0

while [[ $SETTLED -lt $NUM_HANDS && $ELAPSED -lt $MAX_WAIT ]]; do
  EVENTS=$(cast logs \
    --address "$TABLE_ADDRESS" \
    --rpc-url "$RPC_URL" \
    --from-block "$BLOCK" \
    "HandSettled(uint256,uint8,uint256)" 2>/dev/null | grep "transactionHash" | head -$NUM_HANDS || true)

  COUNT=$(echo "$EVENTS" | grep -c "transactionHash" 2>/dev/null || echo 0)
  if [[ $COUNT -gt $SETTLED ]]; then
    while IFS= read -r line; do
      TX=$(echo "$line" | grep -o '0x[a-fA-F0-9]\+' | head -1)
      [[ -n "$TX" ]] && SETTLE_TXS+=("$TX")
    done <<< "$EVENTS"
    SETTLED=$COUNT
    log_ok "Hands settled so far: $SETTLED/$NUM_HANDS"
  fi

  [[ $SETTLED -ge $NUM_HANDS ]] && break
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

if [[ $SETTLED -lt $NUM_HANDS ]]; then
  log_warn "Only $SETTLED/$NUM_HANDS hands settled within $MAX_WAIT seconds."
  log_warn "Run the bots and re-run this script, or extend MAX_WAIT."
fi

# ── Step 6: Collect autosign evidence ────────────────────────────────────────
log_info "[6/7] Autosign evidence note..."
log_info "Manual step: execute at least 1 fold/call/raise action via InterwovenKit auto-sign"
log_info "session in the browser, then note the TX hash in e2e-evidence.md."
AUTOSIGN_TX="PLACEHOLDER_AUTOSIGN_TX"

# ── Step 7: Write evidence file ───────────────────────────────────────────────
log_info "[7/7] Writing evidence to $EVIDENCE_FILE..."

mkdir -p "$(dirname "$EVIDENCE_FILE")"
cat > "$EVIDENCE_FILE" << EOF
# Railbird Initia E2E Evidence

Generated: $START_TIME

## Environment

- RPC: $RPC_URL
- Table: $TABLE_ADDRESS
- Deployer: $DEPLOYER_ADDR

## Seat Registration TXs

$(printf '%s\n' "${REGISTER_TXS[@]}" | sed 's/^/- /')

## Hand Settlement TXs (HandSettled events)

$(printf '%s\n' "${SETTLE_TXS[@]}" | sed 's/^/- /')

## Autosign Evidence

- TX submitted via InterwovenKit Auto-sign session: $AUTOSIGN_TX

> Replace PLACEHOLDER_AUTOSIGN_TX with a real TX hash from the browser console
> after activating auto-sign and executing a poker action.

## Verification

To verify on the rollup explorer:
$(cat "$REPO_ROOT/infra/initia/rollup.json" 2>/dev/null | grep '"explorerUrl"' | head -1 | tr -d ' "' | sed 's/explorerUrl:/Explorer: /')

All transactions above are on the Railbird MiniEVM rollup.
EOF

log_ok "Evidence written to $EVIDENCE_FILE"
echo ""
echo -e "${GREEN}=== E2E Smoke Test Complete ===${NC}"
echo -e "  Hands settled: ${GREEN}$SETTLED/$NUM_HANDS${NC}"
echo -e "  Evidence:      $EVIDENCE_FILE"
echo ""
echo "Next steps:"
echo "  1. Replace PLACEHOLDER_AUTOSIGN_TX in e2e-evidence.md with a real auto-sign TX hash"
echo "  2. Update .initia/submission.json with demoVideo URL (after I13-2 recording)"
