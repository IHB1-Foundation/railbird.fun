#!/usr/bin/env bash
set -euo pipefail

resolve_role_from_service_name() {
  local name
  name="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
  case "$name" in
    ownerview) echo "ownerview" ;;
    indexer) echo "indexer" ;;
    keeper) echo "keeper" ;;
    vrf-operator|vrf_operator|vrfoperator) echo "vrf-operator" ;;
    agent-[1-4]|agent[1-4])
      echo "agent"
      ;;
    agents|agents-pack|agent-bot|agents-bot)
      echo "agents-pack"
      ;;
    *)
      echo ""
      ;;
  esac
}

resolve_agent_slot_from_service_name() {
  local name
  name="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
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

# Safety: if service is named as pack-style but role was manually left as `agent`,
# force pack mode to avoid accidentally running only one agent.
if [ "$ROLE" = "agent" ] && [ -n "$SERVICE_NAME" ]; then
  lowered_service_name="$(printf '%s' "$SERVICE_NAME" | tr '[:upper:]' '[:lower:]')"
  if [ "$lowered_service_name" = "agent-bot" ] || [ "$lowered_service_name" = "agents-pack" ] || [ "$lowered_service_name" = "agents" ]; then
    ROLE="agents-pack"
  fi
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
  agents|agents-pack)
    exec bash scripts/railway/start-agents-pack.sh
    ;;
  *)
    echo "[railway] invalid RAILWAY_SERVICE_ROLE: '$ROLE'" >&2
    echo "[railway] expected one of: ownerview, indexer, keeper, vrf-operator, agent, agents-pack" >&2
    exit 1
    ;;
esac
