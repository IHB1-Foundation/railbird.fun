# Branch Protection Policy

## `main` Branch Rules

The `main` branch has the following GitHub branch protection rules configured:

| Rule                                       | Setting                                             |
| ------------------------------------------ | --------------------------------------------------- |
| Require pull request before merging        | ✅ enabled                                          |
| Required approvals                         | 1                                                   |
| Dismiss stale PR approvals on new commits  | ✅ enabled                                          |
| Require status checks to pass              | ✅ enabled                                          |
| Required status checks                     | `contracts`, `typecheck`, `lint`, `security`, `e2e` |
| Require branches to be up to date          | ✅ enabled                                          |
| Require linear history                     | ✅ enabled                                          |
| Restrict who can push to matching branches | Admins only                                         |
| Allow force pushes                         | ❌ disabled                                         |
| Allow deletions                            | ❌ disabled                                         |

## Applying the Policy

Use the script `scripts/repo/apply-branch-protection.sh` to apply these rules via the GitHub CLI:

```bash
# Authenticate first
gh auth login

# Apply
bash scripts/repo/apply-branch-protection.sh
```

## Required Status Checks

These jobs must pass before a PR can merge:

| Job         | File           | Purpose                             |
| ----------- | -------------- | ----------------------------------- |
| `contracts` | `ci.yml`       | Foundry build + tests + Slither     |
| `typecheck` | `ci.yml`       | TypeScript type checking            |
| `lint`      | `ci.yml`       | ESLint + Solhint                    |
| `security`  | `security.yml` | gitleaks + osv-scanner + pnpm audit |
| `e2e`       | `ci.yml`       | 2-agent end-to-end smoke test       |

## Emergency Bypass

In rare cases (hotfix to production), an admin can temporarily bypass with:

```bash
gh api -X PATCH repos/{owner}/{repo}/branches/main/protection \
  --field required_pull_request_reviews=null
```

**Immediately re-enable after the hotfix.**
