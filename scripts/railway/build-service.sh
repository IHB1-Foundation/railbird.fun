#!/usr/bin/env bash
set -euo pipefail

resolve_role_from_service_name() {
  local name
  name="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$name" in
    ownerview) echo "ownerview" ;;
    indexer) echo "indexer" ;;
    keeper) echo "keeper" ;;
    fleet) echo "fleet" ;;
    vrf-operator|vrf_operator|vrfoperator) echo "vrf-operator" ;;
    agent-[1-9]|agent[1-9]) echo "agent" ;;
    agents|agents-pack|agent-bot|agents-bot) echo "agents-pack" ;;
    web|frontend) echo "web" ;;
    *) echo "" ;;
  esac
}

SERVICE_NAME="${RAILWAY_SERVICE_NAME:-}"
ROLE="${RAILWAY_SERVICE_ROLE:-}"

if [ -z "$ROLE" ] && [ -n "$SERVICE_NAME" ]; then
  ROLE="$(resolve_role_from_service_name "$SERVICE_NAME")"
fi

echo "[railway] build service_name=${SERVICE_NAME:-unset}"
echo "[railway] build resolved_role=${ROLE:-unset}"

case "$ROLE" in
  ownerview)
    exec pnpm --filter @playerco/ownerview... build
    ;;
  indexer)
    exec pnpm --filter @playerco/indexer... build
    ;;
  keeper)
    exec pnpm --filter @playerco/keeper-bot... build
    ;;
  fleet)
    exec pnpm --filter @playerco/fleet... build
    ;;
  vrf-operator)
    exec pnpm --filter @playerco/vrf-operator-bot... build
    ;;
  agent|agents-pack)
    exec pnpm --filter @playerco/agent-bot... build
    ;;
  web)
    exec pnpm --filter @playerco/web... build
    ;;
  *)
    exec pnpm -r --filter=!@playerco/contracts build
    ;;
esac
