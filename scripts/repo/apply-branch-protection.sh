#!/bin/bash
# Apply GitHub branch protection rules for main branch.
# Requires: gh CLI installed and authenticated (gh auth login).
#
# Usage: bash scripts/repo/apply-branch-protection.sh [OWNER/REPO]
# Default repo: auto-detected from git remote.

set -e

REPO="${1:-}"
if [ -z "$REPO" ]; then
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
fi

if [ -z "$REPO" ]; then
  echo "Error: Could not detect repository. Pass OWNER/REPO as argument."
  echo "Usage: bash $0 owner/repo"
  exit 1
fi

echo "Applying branch protection to: $REPO (branch: main)"

gh api \
  --method PUT \
  "repos/${REPO}/branches/main/protection" \
  --field required_status_checks='{"strict":true,"contexts":["contracts","typecheck","lint","security","e2e"]}' \
  --field enforce_admins=false \
  --field required_pull_request_reviews='{"required_approving_review_count":1,"dismiss_stale_reviews":true,"require_code_owner_reviews":true}' \
  --field restrictions=null \
  --field required_linear_history=true \
  --field allow_force_pushes=false \
  --field allow_deletions=false \
  --silent

echo "Branch protection applied successfully."
echo ""
echo "Summary:"
echo "  - Require PR before merging: YES"
echo "  - Required approvals: 1"
echo "  - Dismiss stale approvals: YES"
echo "  - Required status checks: contracts, typecheck, lint, security, e2e"
echo "  - Require linear history: YES"
echo "  - Force pushes: DISABLED"
echo "  - Deletions: DISABLED"
