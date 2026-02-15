#!/usr/bin/env bash
set -euo pipefail

resolve_role_from_service_name() {
  local name="${1,,}"
  case "$name" in
    ownerview) echo "ownerview" ;;
    indexer) echo "indexer" ;;
    keeper) echo "keeper" ;;
    vrf-operator|vrf_operator|vrfoperator) echo "vrf-operator" ;;
    agent-[1-4]|agent[1-4])
      echo "agent"
      ;;
    *)
      echo ""
      ;;
  esac
}

resolve_agent_slot_from_service_name() {
  local name="${1,,}"
  if [[ "$name" =~ ^agent-([1-4])$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  if [[ "$name" =~ ^agent([1-4])$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi
  echo ""
}

SERVICE_NAME="${RAILWAY_SERVICE_NAME:-}"
ROLE="${RAILWAY_SERVICE_ROLE:-}"

if [ -z "$ROLE" ] && [ -n "$SERVICE_NAME" ]; then
  ROLE="$(resolve_role_from_service_name "$SERVICE_NAME")"
fi

if [ "$ROLE" = "agent" ] && [ -z "${AGENT_SLOT:-}" ] && [ -n "$SERVICE_NAME" ]; then
  AUTO_SLOT="$(resolve_agent_slot_from_service_name "$SERVICE_NAME")"
  if [ -n "$AUTO_SLOT" ]; then
    export AGENT_SLOT="$AUTO_SLOT"
  fi
fi

echo "[railway] service_name=${SERVICE_NAME:-unset}"
echo "[railway] resolved_role=${ROLE:-unset}"
echo "[railway] agent_slot=${AGENT_SLOT:-unset}"

case "$ROLE" in
  ownerview)
    exec bash scripts/railway/start-ownerview.sh
    ;;
  indexer)
    exec bash scripts/railway/start-indexer.sh
    ;;
  keeper)
    exec bash scripts/railway/start-keeper.sh
    ;;
  vrf-operator)
    exec bash scripts/railway/start-vrf-operator.sh
    ;;
  agent)
    exec bash scripts/railway/start-agent.sh
    ;;
  *)
    echo "[railway] invalid RAILWAY_SERVICE_ROLE: '$ROLE'" >&2
    echo "[railway] expected one of: ownerview, indexer, keeper, vrf-operator, agent" >&2
    exit 1
    ;;
esac
