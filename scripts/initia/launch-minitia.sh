#!/usr/bin/env bash
# launch-minitia.sh — Provision a Railbird MiniEVM rollup on Initia testnet.
#
# Prerequisites:
#   - initiad CLI installed (https://github.com/initia-labs/initia)
#   - minitia-evm binary available in PATH (https://github.com/initia-labs/minitia-artifacts)
#   - A funded Initia testnet account (use https://faucet.testnet.initia.xyz)
#   - DEPLOYER_MNEMONIC or DEPLOYER_PRIVATE_KEY set in environment
#
# Usage:
#   source scripts/load-env.sh initia
#   bash scripts/initia/launch-minitia.sh
#
# Outputs:
#   infra/initia/rollup.json  — chainID, rpcUrl, explorerUrl, createdAt

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
OUTPUT_FILE="$REPO_ROOT/infra/initia/rollup.json"

# ---------------------------------------------------------------------------
# Configuration — override via environment
# ---------------------------------------------------------------------------
ROLLUP_NAME="${ROLLUP_NAME:-railbird}"
ROLLUP_CHAIN_ID="${ROLLUP_CHAIN_ID:-railbird-1}"
L1_RPC="${L1_RPC:-https://rpc.testnet.initia.xyz}"
L1_REST="${L1_REST:-https://lcd.testnet.initia.xyz}"
# MiniEVM gas denom (use L1 native or bridged INIT)
GAS_DENOM="${GAS_DENOM:-uinit}"

echo "==================================================="
echo "  Railbird MiniEVM Rollup Launcher"
echo "  Rollup name : $ROLLUP_NAME"
echo "  Chain ID    : $ROLLUP_CHAIN_ID"
echo "  L1 RPC      : $L1_RPC"
echo "==================================================="

# ---------------------------------------------------------------------------
# Step 1: Verify tooling
# ---------------------------------------------------------------------------
if ! command -v initiad &>/dev/null; then
  echo "ERROR: initiad not found. Install from https://github.com/initia-labs/initia"
  exit 1
fi

echo "[1/5] initiad version: $(initiad version 2>/dev/null || echo 'unknown')"

# ---------------------------------------------------------------------------
# Step 2: Generate genesis / rollup config
# ---------------------------------------------------------------------------
echo "[2/5] Generating MiniEVM rollup config..."
WORK_DIR="$(mktemp -d /tmp/railbird-minitia.XXXXXX)"
echo "  Working dir: $WORK_DIR"

# The minitia launcher creates a rollup config JSON.
# Command varies by minitia-artifacts version; adjust as needed.
# initiad minitia launch \
#   --name "$ROLLUP_NAME" \
#   --chain-id "$ROLLUP_CHAIN_ID" \
#   --runtime evm \
#   --l1-rpc "$L1_RPC" \
#   --output "$WORK_DIR/rollup-config.json"
#
# PLACEHOLDER: actual command depends on initia-labs/minitia-artifacts version.
# Run the above and inspect the output for chainId, rpcUrl, explorerUrl.

cat > "$WORK_DIR/rollup-config.json" <<'EOF_PLACEHOLDER'
{
  "_note": "PLACEHOLDER — run actual minitia launcher and replace this file",
  "chainId": "YOUR_ROLLUP_CHAIN_ID",
  "rpcUrl": "https://rpc.YOUR-ROLLUP.initia.xyz",
  "wsUrl": "wss://rpc.YOUR-ROLLUP.initia.xyz/websocket",
  "evmRpcUrl": "https://evm-rpc.YOUR-ROLLUP.initia.xyz",
  "explorerUrl": "https://scan.testnet.initia.xyz/rollup/YOUR-ROLLUP-CHAIN-ID",
  "faucetUrl": "https://faucet.testnet.initia.xyz",
  "bridgeUrl": "https://bridge.testnet.initia.xyz",
  "genesisHash": "0x",
  "launchTxHash": "0x"
}
EOF_PLACEHOLDER

echo "[2/5] Config written to $WORK_DIR/rollup-config.json"

# ---------------------------------------------------------------------------
# Step 3: (Manual) Broadcast rollup launch transaction on L1
# ---------------------------------------------------------------------------
echo "[3/5] *** MANUAL STEP ***"
echo "  Submit rollup launch TX on L1 Initia testnet."
echo "  Use the Initia dashboard or initiad tx rollup create-rollup"
echo "  After launch, update $WORK_DIR/rollup-config.json with:"
echo "    - chainId (EVM chain ID integer)"
echo "    - evmRpcUrl"
echo "    - launchTxHash"

# ---------------------------------------------------------------------------
# Step 4: Verify account funded on rollup
# ---------------------------------------------------------------------------
echo "[4/5] To verify gas balance after rollup is live:"
echo "  cast balance --rpc-url \$EVM_RPC_URL \$DEPLOYER_ADDRESS"
echo "  (requires cast from https://getfoundry.sh)"

# ---------------------------------------------------------------------------
# Step 5: Write output JSON
# ---------------------------------------------------------------------------
echo "[5/5] Writing rollup metadata to $OUTPUT_FILE..."
mkdir -p "$(dirname "$OUTPUT_FILE")"

CREATED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Read values from rollup-config.json if it was populated
CHAIN_ID="$(jq -r '.chainId // "PLACEHOLDER"' "$WORK_DIR/rollup-config.json")"
RPC_URL="$(jq -r '.evmRpcUrl // "PLACEHOLDER"' "$WORK_DIR/rollup-config.json")"
EXPLORER_URL="$(jq -r '.explorerUrl // "PLACEHOLDER"' "$WORK_DIR/rollup-config.json")"
LAUNCH_TX="$(jq -r '.launchTxHash // "PLACEHOLDER"' "$WORK_DIR/rollup-config.json")"

cat > "$OUTPUT_FILE" <<EOF
{
  "network": "initia-testnet",
  "rollupName": "$ROLLUP_NAME",
  "chainId": "$CHAIN_ID",
  "rpcUrl": "$RPC_URL",
  "explorerUrl": "$EXPLORER_URL",
  "launchTxHash": "$LAUNCH_TX",
  "createdAt": "$CREATED_AT"
}
EOF

echo "  Written: $OUTPUT_FILE"
echo ""
echo "==================================================="
echo "  NEXT STEPS:"
echo "  1. Update infra/initia/rollup.json with real values."
echo "  2. Set INITIA_CHAIN_ID and RPC_URL in .env.initia"
echo "  3. Run: ./scripts/deploy/initia.sh --simulate"
echo "==================================================="

rm -rf "$WORK_DIR"
