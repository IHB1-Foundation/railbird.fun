#!/usr/bin/env bash
# deploy/initia.sh — Deploy Railbird contracts to an Initia MiniEVM rollup.
#
# Usage:
#   source scripts/load-env.sh initia   # sets RPC_URL, DEPLOYER_PRIVATE_KEY, etc.
#   bash scripts/deploy/initia.sh               # broadcast
#   bash scripts/deploy/initia.sh --simulate    # dry-run (no broadcast)
#
# Outputs:
#   infra/initia/deployments.json — contract addresses + deploy TX hashes

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTRACTS_DIR="$REPO_ROOT/contracts"
OUTPUT_FILE="$REPO_ROOT/infra/initia/deployments.json"
SIMULATE=false

for arg in "$@"; do
  case "$arg" in
    --simulate) SIMULATE=true ;;
  esac
done

# ---------------------------------------------------------------------------
# Require environment
# ---------------------------------------------------------------------------
: "${RPC_URL:?RPC_URL is required. source scripts/load-env.sh initia}"
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is required}"
: "${VRF_OPERATOR_ADDRESS:?VRF_OPERATOR_ADDRESS is required}"
: "${DEALER_ADDRESS:?DEALER_ADDRESS is required}"

echo "==================================================="
echo "  Railbird — Deploy to Initia MiniEVM Rollup"
echo "  RPC_URL   : $RPC_URL"
echo "  Simulate  : $SIMULATE"
echo "==================================================="

cd "$CONTRACTS_DIR"

if [ "$SIMULATE" = true ]; then
  echo "[DRY-RUN] Running forge script without --broadcast..."
  FOUNDRY_PROFILE=deploy forge script script/DeployInitia.s.sol \
    --rpc-url initia-testnet \
    -vvv
  echo "[DRY-RUN] Simulation complete. No transactions broadcast."
  exit 0
fi

# ---------------------------------------------------------------------------
# Broadcast
# ---------------------------------------------------------------------------
echo "[DEPLOY] Broadcasting to Initia rollup..."
FOUNDRY_PROFILE=deploy forge script script/DeployInitia.s.sol \
  --rpc-url initia-testnet \
  --broadcast \
  --private-key "$DEPLOYER_PRIVATE_KEY" \
  -vvv 2>&1 | tee /tmp/railbird-deploy-initia.log

# ---------------------------------------------------------------------------
# Parse output and write deployments.json
# ---------------------------------------------------------------------------
echo "[DEPLOY] Extracting addresses from forge output..."

extract() {
  grep -oP "(?<=${1}=)0x[0-9a-fA-F]{40}" /tmp/railbird-deploy-initia.log | tail -1
}

CHIP_TOKEN="$(extract "CHIP_TOKEN_ADDRESS" || echo "PLACEHOLDER")"
POKER_TABLES="$(grep -oP "(?<=POKER_TABLE_ADDRESSES=)[^\s]+" /tmp/railbird-deploy-initia.log | tail -1 || echo "PLACEHOLDER")"
REGISTRY="$(extract "PLAYER_REGISTRY_ADDRESS" || echo "PLACEHOLDER")"
VAULT="$(extract "PLAYER_VAULT_ADDRESS" || echo "PLACEHOLDER")"
VRF="$(extract "VRF_ADAPTER_ADDRESS" || echo "PLACEHOLDER")"
SIDE_BET="$(extract "SIDE_BET_POOL_ADDRESS" || echo "PLACEHOLDER")"

DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mkdir -p "$(dirname "$OUTPUT_FILE")"
cat > "$OUTPUT_FILE" <<EOF
{
  "network": "initia-testnet",
  "rpcUrl": "${RPC_URL}",
  "deployedAt": "${DEPLOYED_AT}",
  "contracts": {
    "chipToken": "${CHIP_TOKEN}",
    "pokerTables": [${POKER_TABLES}],
    "playerRegistry": "${REGISTRY}",
    "playerVault": "${VAULT}",
    "vrfAdapter": "${VRF}",
    "sideBetPool": "${SIDE_BET}"
  }
}
EOF

echo ""
echo "==================================================="
echo "  Deployment complete!"
echo "  Addresses written to $OUTPUT_FILE"
echo ""
echo "  NEXT STEPS:"
echo "  1. Update POKER_TABLE_ADDRESSES, PLAYER_REGISTRY_ADDRESS,"
echo "     PLAYER_VAULT_ADDRESS, VRF_ADAPTER_ADDRESS in .env.initia"
echo "  2. Run: bash scripts/e2e-smoke.initia.sh"
echo "==================================================="
