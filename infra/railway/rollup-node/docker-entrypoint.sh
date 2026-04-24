#!/usr/bin/env bash
set -euo pipefail

HOME_DIR="${ROLLUP_HOME:-/data}"
PUBLIC_PORT="${PORT:-8545}"
COMET_PORT="${COMET_RPC_PORT:-26657}"
API_PORT="${API_PORT:-1317}"
GRPC_PORT="${GRPC_PORT:-9090}"
WS_PORT="${WS_PORT:-8546}"

mkdir -p "$HOME_DIR"

if [ ! -f "$HOME_DIR/config/genesis.json" ] || [ ! -f "$HOME_DIR/data/priv_validator_state.json" ]; then
  echo "[rollup-node] seeding fresh home into $HOME_DIR"
  rm -rf "$HOME_DIR/config" "$HOME_DIR/data"
  cp -a /seed-home/config "$HOME_DIR/"
  cp -a /seed-home/data "$HOME_DIR/"
fi

chmod -R u+rwX "$HOME_DIR"

exec /usr/local/bin/minitiad start \
  --home "$HOME_DIR" \
  --json-rpc.enable \
  --json-rpc.address "0.0.0.0:${PUBLIC_PORT}" \
  --json-rpc.address-ws "0.0.0.0:${WS_PORT}" \
  --rpc.laddr "tcp://0.0.0.0:${COMET_PORT}" \
  --grpc.address "0.0.0.0:${GRPC_PORT}" \
  --api.enable \
  --api.address "tcp://0.0.0.0:${API_PORT}"
