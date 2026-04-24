#!/usr/bin/env bash
# verify-session-revoke.sh — Manual verification: auto-sign session revoke flow.
#
# Scenario: Player revokes their auto-sign session. After revocation, the server
# marks that address as revoked and the client must re-approve for future actions.
#
# Prerequisites:
#   - OwnerView service running (default: http://localhost:3002)
#   - A valid JWT obtained via /auth/nonce → /auth/verify flow
#
# Usage:
#   OWNERVIEW_URL=http://localhost:3002 \
#   JWT=<your-jwt-token> \
#   ADDRESS=<0x-address> \
#   bash scripts/initia/verify-session-revoke.sh

set -euo pipefail

OWNERVIEW_URL="${OWNERVIEW_URL:-http://localhost:3002}"
JWT="${JWT:-}"
ADDRESS="${ADDRESS:-}"

if [[ -z "$JWT" ]]; then
  echo "ERROR: JWT env var is required. Get one via /auth/nonce + /auth/verify." >&2
  exit 1
fi
if [[ -z "$ADDRESS" ]]; then
  echo "ERROR: ADDRESS env var is required (the wallet address whose session to revoke)." >&2
  exit 1
fi

echo "=== [1] Check current session status (before revoke) ==="
curl -s -w "\nHTTP %{http_code}\n" \
  "$OWNERVIEW_URL/session/status?address=$ADDRESS" | tee /tmp/status_before.json
echo ""

echo "=== [2] Revoke the auto-sign session ==="
curl -s -w "\nHTTP %{http_code}\n" \
  -X POST "$OWNERVIEW_URL/session/revoke" \
  -H "Authorization: Bearer $JWT" \
  -H "Content-Type: application/json" \
  -d '{"via":"autosign"}' | tee /tmp/revoke_response.json
echo ""

echo "=== [3] Check session status (after revoke) ==="
AFTER=$(curl -s -w "\nHTTP %{http_code}\n" \
  "$OWNERVIEW_URL/session/status?address=$ADDRESS" | tee /tmp/status_after.json)
echo "$AFTER"
echo ""

echo "=== [4] Verify isRevoked=true in response ==="
IS_REVOKED=$(python3 -c "
import json, sys
with open('/tmp/status_after.json') as f:
    # Strip trailing HTTP status line
    lines = f.read().strip().split('\n')
    payload = '\n'.join(l for l in lines if not l.startswith('HTTP'))
    data = json.loads(payload)
    print(data.get('isRevoked', False))
" 2>/dev/null || echo "false")

if [[ "$IS_REVOKED" == "True" ]]; then
  echo "[PASS] isRevoked=true — session successfully revoked."
else
  echo "[FAIL] isRevoked was not true after revoke call." >&2
  exit 1
fi

echo ""
echo "=== Verification complete ==="
echo "The auto-sign session for $ADDRESS has been revoked server-side."
echo "Any further TX that the client submits via this session will have:"
echo "  - GET /session/status returns isRevoked=true"
echo "  - Audit logs (isSessionRevoked() in session.ts) flag the address"
echo "  - On-chain TX still go through (Initia does not block signed TX server-side)"
echo "  - UX: client's useAutoSignSession.revoke() clears the local session state"
