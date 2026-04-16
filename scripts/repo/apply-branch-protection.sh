#!/bin/bash
# Apply GitHub branch protection rules for main branch.
# Requires: gh CLI installed and authenticated (gh auth login).
#
# Usage: bash scripts/repo/apply-branch-protection.sh [OWNER/REPO]
# Default repo: auto-detected from git remote.

set -e

REQUIRED_CHECKS=(
  "Contracts (Foundry)"
  "Contracts (Invariant Tests)"
  "TypeScript Type Check"
  "TypeScript Tests"
  "Lint"
  "OpenAPI Spec Validation"
  "Web Bundle Size Budget"
  "Docker Image Builds"
  "Service Startup Smoke Test"
  "E2E Smoke Test (1 hand, 2 agents)"
  "Web E2E & Accessibility (Playwright)"
  "Bot Integration Tests (agent + keeper)"
  "Secret Scanning (gitleaks)"
  "Dependency Audit (pnpm)"
  "OSV Scanner"
  "Solhint (strict)"
  "Lighthouse Performance Budget"
)

contexts_json="["
for check in "${REQUIRED_CHECKS[@]}"; do
  escaped="${check//\\/\\\\}"
  escaped="${escaped//\"/\\\"}"
  contexts_json+="\"${escaped}\","
done
contexts_json="${contexts_json%,}]"

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

payload=$(cat <<EOF
{
  "required_status_checks": {
    "strict": true,
    "contexts": ${contexts_json}
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "required_approving_review_count": 1,
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
EOF
)

TOKEN=$(gh auth token)

curl -fsSL \
  -X PUT \
  -H "Accept: application/vnd.github+json" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "X-GitHub-Api-Version: 2026-03-10" \
  "https://api.github.com/repos/${REPO}/branches/main/protection" \
  --data-binary @- \
  >/dev/null <<<"$payload"

echo "Branch protection applied successfully."
echo ""
echo "Summary:"
echo "  - Require PR before merging: YES"
echo "  - Required approvals: 1"
echo "  - Dismiss stale approvals: YES"
echo "  - Code owner reviews: REQUIRED"
echo "  - Protect admins with same rules: YES"
echo "  - Required status checks:"
for check in "${REQUIRED_CHECKS[@]}"; do
  echo "      - ${check}"
done
echo "  - Require linear history: YES"
echo "  - Force pushes: DISABLED"
echo "  - Deletions: DISABLED"
