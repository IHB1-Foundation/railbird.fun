#!/usr/bin/env bash
# load-env.sh — Load a named env file into the current shell session.
#
# Usage:
#   source scripts/load-env.sh [TARGET]
#
# TARGET options:
#   (empty)         — load root .env (default)
#   initia          — load .env.initia  (Initia testnet rollup)
#   hashkey         — load .env.hashkey (HashKey Chain testnet)
#   hashkey-example — load .env.hashkey.example (dry-run / review)
#
# Example:
#   source scripts/load-env.sh initia
#   echo $CHAIN_ENV   # → initia-testnet

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
TARGET="${1:-}"

case "$TARGET" in
  ""|default)
    ENV_FILE="$REPO_ROOT/.env"
    ;;
  initia)
    ENV_FILE="$REPO_ROOT/.env.initia"
    ;;
  hashkey)
    ENV_FILE="$REPO_ROOT/.env.hashkey"
    ;;
  hashkey-example)
    ENV_FILE="$REPO_ROOT/.env.hashkey.example"
    ;;
  *)
    echo "load-env.sh: unknown target '$TARGET'" >&2
    echo "  Valid: (empty) | initia | hashkey | hashkey-example" >&2
    return 1 2>/dev/null || exit 1
    ;;
esac

if [[ ! -f "$ENV_FILE" ]]; then
  echo "load-env.sh: env file not found: $ENV_FILE" >&2
  return 1 2>/dev/null || exit 1
fi

echo "load-env.sh: loading $ENV_FILE"
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a
echo "load-env.sh: CHAIN_ENV=$CHAIN_ENV"
