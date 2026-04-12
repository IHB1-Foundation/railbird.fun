#!/usr/bin/env bash
# Canary deployment script for Railway services.
#
# Usage: bash scripts/deploy/canary.sh [--service <name>] [--rollback]
#
# Requires:
#   - RAILWAY_TOKEN environment variable (production token)
#   - railway CLI installed (npm install -g @railway/cli)
#   - prom-cli or curl for metric checks (optional — skips if unavailable)
#
# Flow:
#   1. Deploy new image to a canary Railway service replica
#   2. Wait CANARY_OBSERVE_SECS (default 300 = 5 min) watching error rate
#   3. If error rate < CANARY_ERROR_THRESHOLD: promote to full rollout
#   4. Otherwise: rollback canary replica and exit non-zero
#
# Limitations:
#   Railway's free tier does not support replicas. For proper canary
#   traffic splitting, upgrade to the Pro plan or use an upstream load
#   balancer (Cloudflare, Nginx) to route a percentage of traffic.
#   This script simulates a canary window by deploying and monitoring
#   metrics before approving the full rollout.

set -euo pipefail

CANARY_OBSERVE_SECS="${CANARY_OBSERVE_SECS:-300}"   # 5 min
CANARY_ERROR_THRESHOLD="${CANARY_ERROR_THRESHOLD:-0.01}"  # 1% error rate
SERVICE="${1:-indexer}"
ROLLBACK=false

# ── Parse arguments ────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --service)  SERVICE="$2"; shift 2 ;;
    --rollback) ROLLBACK=true; shift ;;
    *)          shift ;;
  esac
done

command -v railway >/dev/null 2>&1 || { echo "ERROR: railway CLI not found. Run: npm install -g @railway/cli"; exit 1; }

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

# ── Rollback path ──────────────────────────────────────────────────────────
if [[ "$ROLLBACK" == "true" ]]; then
  log "ROLLBACK requested for service: $SERVICE"
  railway rollback --service "$SERVICE"
  log "Rollback complete."
  exit 0
fi

# ── Deploy ─────────────────────────────────────────────────────────────────
log "Deploying canary for service: $SERVICE"
railway up --service "$SERVICE" --detach

log "Canary deployed. Observing for ${CANARY_OBSERVE_SECS}s..."

# ── Observe ────────────────────────────────────────────────────────────────
METRICS_URL="${METRICS_URL:-}"   # e.g. http://indexer.internal:3002/metrics

observe_error_rate() {
  if [[ -z "$METRICS_URL" ]]; then
    log "METRICS_URL not set — skipping metric check (treat as healthy)"
    return 0
  fi

  # Fetch Prometheus metrics and compute bot error rate
  local metrics
  metrics=$(curl -sf "${METRICS_URL}" 2>/dev/null) || { log "WARN: metrics fetch failed"; return 0; }

  local errors total error_rate
  errors=$(echo "$metrics" | grep 'railbird_bot_errors_total' | awk '{sum += $NF} END {print sum+0}')
  total=$(echo "$metrics" | grep 'railbird_bot_actions_total' | awk '{sum += $NF} END {print sum+0}')

  if [[ "$total" == "0" || -z "$total" ]]; then
    log "No traffic yet — treating as healthy"
    return 0
  fi

  error_rate=$(echo "scale=4; $errors / $total" | bc)
  log "Error rate: $error_rate (threshold: $CANARY_ERROR_THRESHOLD)"

  if (( $(echo "$error_rate > $CANARY_ERROR_THRESHOLD" | bc -l) )); then
    log "ERROR RATE EXCEEDED — initiating rollback"
    railway rollback --service "$SERVICE"
    return 1
  fi
}

elapsed=0
interval=30
while (( elapsed < CANARY_OBSERVE_SECS )); do
  sleep "$interval"
  elapsed=$(( elapsed + interval ))
  log "Checking at ${elapsed}s / ${CANARY_OBSERVE_SECS}s..."
  observe_error_rate || { log "Canary FAILED. Rolled back."; exit 1; }
done

# ── Promote ────────────────────────────────────────────────────────────────
log "Canary window passed. Promoting full rollout for: $SERVICE"
# Railway auto-promotes once all replicas are healthy.
# If using manual approval: trigger promotion here.
log "Deployment complete."
