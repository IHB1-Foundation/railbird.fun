#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env}"
RAILWAY_ENV="${RAILWAY_ENV:-production}"
AGENT_DEPLOY_MODE="${AGENT_DEPLOY_MODE:-pack}" # pack | split
RAILWAY_SKIP_DEPLOYS="${RAILWAY_SKIP_DEPLOYS:-true}" # true | false

OWNERVIEW_SERVICE_NAME="${OWNERVIEW_SERVICE_NAME:-ownerview}"
INDEXER_SERVICE_NAME="${INDEXER_SERVICE_NAME:-indexer}"
KEEPER_SERVICE_NAME="${KEEPER_SERVICE_NAME:-keeper}"
VRF_OPERATOR_SERVICE_NAME="${VRF_OPERATOR_SERVICE_NAME:-vrf-operator}"
AGENT_PACK_SERVICE_NAME="${AGENT_PACK_SERVICE_NAME:-agent-bot}"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[railway] missing command: $cmd" >&2
    exit 1
  fi
}

if [ ! -f "$ENV_FILE" ]; then
  echo "[railway] env file not found: $ENV_FILE" >&2
  exit 1
fi

require_cmd railway
require_cmd node

set -a
. "$ENV_FILE"
set +a

# Stable defaults for hosted domains.
export OWNERVIEW_URL="${OWNERVIEW_URL:-https://ownerview.railbird.fun}"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://railbird.fun,https://www.railbird.fun}"

hydrate_db_env_from_common_sources() {
  export DB_HOST="${DB_HOST:-${PGHOST:-}}"
  export DB_PORT="${DB_PORT:-${PGPORT:-5432}}"
  export DB_NAME="${DB_NAME:-${PGDATABASE:-}}"
  export DB_USER="${DB_USER:-${PGUSER:-}}"
  export DB_PASSWORD="${DB_PASSWORD:-${PGPASSWORD:-}}"

  if [ -z "${DB_HOST:-}" ] && [ -n "${DATABASE_URL:-}" ]; then
    eval "$(
      DATABASE_URL="$DATABASE_URL" node -e '
        try {
          const u = new URL(process.env.DATABASE_URL);
          const host = u.hostname || "";
          const port = u.port || "5432";
          const db = (u.pathname || "").replace(/^\//, "");
          const user = decodeURIComponent(u.username || "");
          const pass = decodeURIComponent(u.password || "");
          const out = [
            `export DB_HOST=${JSON.stringify(host)}`,
            `export DB_PORT=${JSON.stringify(port)}`,
            `export DB_NAME=${JSON.stringify(db)}`,
            `export DB_USER=${JSON.stringify(user)}`,
            `export DB_PASSWORD=${JSON.stringify(pass)}`
          ];
          console.log(out.join("\n"));
        } catch {
          process.exit(1);
        }
      ' 2>/dev/null || true
    )"
  fi
}

is_local_db_host() {
  case "${DB_HOST:-}" in
    ""|localhost|127.0.0.1)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

hydrate_db_env_from_common_sources

should_skip_deploys_flag() {
  if [ "$RAILWAY_SKIP_DEPLOYS" = "true" ]; then
    echo "--skip-deploys"
  fi
}

append_pair_if_present() {
  local key="$1"
  if [ -n "${!key:-}" ]; then
    KV_PAIRS+=("${key}=${!key}")
  fi
}

set_service_vars() {
  local service="$1"
  shift
  KV_PAIRS=()
  for key in "$@"; do
    append_pair_if_present "$key"
  done

  if [ "${#KV_PAIRS[@]}" -eq 0 ]; then
    echo "[railway] no variables to set for service=$service (skipped)"
    return 0
  fi

  echo "[railway] setting ${#KV_PAIRS[@]} vars -> service=$service env=$RAILWAY_ENV"
  railway variable set \
    -s "$service" \
    -e "$RAILWAY_ENV" \
    $(should_skip_deploys_flag) \
    "${KV_PAIRS[@]}"
}

COMMON_KEYS=(
  CHAIN_ENV
  CHAIN_ID
  RPC_URL
  POKER_TABLE_ADDRESS
  PLAYER_REGISTRY_ADDRESS
  PLAYER_VAULT_ADDRESS
  VRF_ADAPTER_ADDRESS
  RCHIP_TOKEN_ADDRESS
  NADFUN_LENS_ADDRESS
  NADFUN_BONDING_ROUTER_ADDRESS
  NADFUN_DEX_ROUTER_ADDRESS
  WMON_ADDRESS
)

OWNERVIEW_KEYS=(
  RAILWAY_SERVICE_ROLE
  JWT_SECRET
  DEALER_API_KEY
  HOLECARD_DATA_DIR
  CORS_ALLOWED_ORIGINS
)

INDEXER_KEYS=(
  RAILWAY_SERVICE_ROLE
  DB_HOST
  DB_PORT
  DB_NAME
  DB_USER
  DB_PASSWORD
  START_BLOCK
  POLL_INTERVAL_MS
)

KEEPER_KEYS=(
  RAILWAY_SERVICE_ROLE
  KEEPER_PRIVATE_KEY
  ENABLE_REBALANCING
  REBALANCE_BUY_AMOUNT_MON
  REBALANCE_SELL_AMOUNT_TOKENS
)

VRF_OPERATOR_KEYS=(
  RAILWAY_SERVICE_ROLE
  VRF_OPERATOR_PRIVATE_KEY
  VRF_OPERATOR_POLL_INTERVAL_MS
  VRF_OPERATOR_MIN_CONFIRMATIONS
  VRF_OPERATOR_RESCAN_WINDOW
  VRF_OPERATOR_RESCAN_FROM_REQUEST_ID
  VRF_OPERATOR_RANDOM_SALT
)

AGENT_COMMON_KEYS=(
  RAILWAY_SERVICE_ROLE
  OWNERVIEW_URL
  POLL_INTERVAL_MS
  MAX_HANDS
  TURN_ACTION_DELAY_MS
  AGENT_DECISION_ENGINE
  GEMINI_API_KEY
  GEMINI_MODEL
  GEMINI_TEMPERATURE
  GEMINI_TIMEOUT_MS
  AGENT_1_OPERATOR_PRIVATE_KEY
  AGENT_2_OPERATOR_PRIVATE_KEY
  AGENT_3_OPERATOR_PRIVATE_KEY
  AGENT_4_OPERATOR_PRIVATE_KEY
  AGENT_1_AGGRESSION
  AGENT_2_AGGRESSION
  AGENT_3_AGGRESSION
  AGENT_4_AGGRESSION
  AGENT_1_TURN_ACTION_DELAY_MS
  AGENT_2_TURN_ACTION_DELAY_MS
  AGENT_3_TURN_ACTION_DELAY_MS
  AGENT_4_TURN_ACTION_DELAY_MS
  AGENT_1_DECISION_ENGINE
  AGENT_2_DECISION_ENGINE
  AGENT_3_DECISION_ENGINE
  AGENT_4_DECISION_ENGINE
  AGENT_1_GEMINI_API_KEY
  AGENT_2_GEMINI_API_KEY
  AGENT_3_GEMINI_API_KEY
  AGENT_4_GEMINI_API_KEY
  AGENT_1_GEMINI_MODEL
  AGENT_2_GEMINI_MODEL
  AGENT_3_GEMINI_MODEL
  AGENT_4_GEMINI_MODEL
  AGENT_1_GEMINI_TEMPERATURE
  AGENT_2_GEMINI_TEMPERATURE
  AGENT_3_GEMINI_TEMPERATURE
  AGENT_4_GEMINI_TEMPERATURE
  AGENT_1_GEMINI_TIMEOUT_MS
  AGENT_2_GEMINI_TIMEOUT_MS
  AGENT_3_GEMINI_TIMEOUT_MS
  AGENT_4_GEMINI_TIMEOUT_MS
)

run_with_role() {
  local role="$1"
  shift
  RAILWAY_SERVICE_ROLE="$role" set_service_vars "$@"
}

set_all_for_service() {
  local service="$1"
  shift
  local keys=("$@")
  # shellcheck disable=SC2068
  set_service_vars "$service" ${COMMON_KEYS[@]} ${keys[@]}
}

echo "[railway] env_file=$ENV_FILE"
echo "[railway] environment=$RAILWAY_ENV"
echo "[railway] agent_deploy_mode=$AGENT_DEPLOY_MODE"
echo "[railway] skip_deploys=$RAILWAY_SKIP_DEPLOYS"
echo

RAILWAY_SERVICE_ROLE="ownerview" set_all_for_service "$OWNERVIEW_SERVICE_NAME" "${OWNERVIEW_KEYS[@]}"

INDEXER_KEYS_EFFECTIVE=("${INDEXER_KEYS[@]}")
if is_local_db_host && [ "${ALLOW_LOCAL_DB_HOST_IN_RAILWAY:-false}" != "true" ]; then
  echo "[railway] warning: DB_HOST is local (${DB_HOST:-unset}), skipping DB_* push to indexer."
  echo "[railway] warning: use Railway Postgres references (PG*) or set non-local DB_* before running this script."
  INDEXER_KEYS_EFFECTIVE=(
    RAILWAY_SERVICE_ROLE
    START_BLOCK
    POLL_INTERVAL_MS
  )
fi

RAILWAY_SERVICE_ROLE="indexer" set_all_for_service "$INDEXER_SERVICE_NAME" "${INDEXER_KEYS_EFFECTIVE[@]}"
RAILWAY_SERVICE_ROLE="keeper" set_all_for_service "$KEEPER_SERVICE_NAME" "${KEEPER_KEYS[@]}"
RAILWAY_SERVICE_ROLE="vrf-operator" set_all_for_service "$VRF_OPERATOR_SERVICE_NAME" "${VRF_OPERATOR_KEYS[@]}"

if [ "$AGENT_DEPLOY_MODE" = "pack" ]; then
  RAILWAY_SERVICE_ROLE="agents-pack" set_all_for_service "$AGENT_PACK_SERVICE_NAME" "${AGENT_COMMON_KEYS[@]}"
elif [ "$AGENT_DEPLOY_MODE" = "split" ]; then
  for slot in 1 2 3 4; do
    service_name="agent-$slot"
    RAILWAY_SERVICE_ROLE="agent" AGENT_SLOT="$slot" set_all_for_service "$service_name" "${AGENT_COMMON_KEYS[@]}" AGENT_SLOT
  done
else
  echo "[railway] invalid AGENT_DEPLOY_MODE=$AGENT_DEPLOY_MODE (expected pack or split)" >&2
  exit 1
fi

echo
echo "[railway] done. Variables staged."
if [ "$RAILWAY_SKIP_DEPLOYS" = "true" ]; then
  echo "[railway] next: deploy each service once in Railway UI (or disable skip with RAILWAY_SKIP_DEPLOYS=false)."
fi
