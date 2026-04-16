# Branch Protection Policy

## `main` Branch Rules

The `main` branch has the following GitHub branch protection rules configured:

| Rule                                       | Setting                                            |
| ------------------------------------------ | -------------------------------------------------- |
| Require pull request before merging        | ✅ enabled                                         |
| Required approvals                         | 1                                                  |
| Dismiss stale PR approvals on new commits  | ✅ enabled                                         |
| Require code owner review                  | ✅ enabled                                         |
| Require status checks to pass              | ✅ enabled                                         |
| Protect admins with same rules             | ✅ enabled                                         |
| Required status checks                     | Exact GitHub job names from CI/security/lighthouse |
| Require branches to be up to date          | ✅ enabled                                         |
| Require linear history                     | ✅ enabled                                         |
| Restrict who can push to matching branches | Not configured by script                           |
| Allow force pushes                         | ❌ disabled                                        |
| Allow deletions                            | ❌ disabled                                        |

## Applying the Policy

Use the script `scripts/repo/apply-branch-protection.sh` to apply these rules via the GitHub CLI:

```bash
# Authenticate first
gh auth login

# Apply
bash scripts/repo/apply-branch-protection.sh
```

## Required Status Checks

These PR-running jobs should be configured as the required checks:

| Check Name                               | File             | Purpose                                       |
| ---------------------------------------- | ---------------- | --------------------------------------------- |
| `Contracts (Foundry)`                    | `ci.yml`         | Forge build + tests + Slither + ABI freshness |
| `Contracts (Invariant Tests)`            | `ci.yml`         | Invariant/property testing                    |
| `TypeScript Type Check`                  | `ci.yml`         | Workspace type safety                         |
| `TypeScript Tests`                       | `ci.yml`         | Workspace TS/unit tests                       |
| `Lint`                                   | `ci.yml`         | ESLint / Next lint / Solhint via workspace    |
| `OpenAPI Spec Validation`                | `ci.yml`         | API surface validity                          |
| `Web Bundle Size Budget`                 | `ci.yml`         | Frontend payload budget                       |
| `Docker Image Builds`                    | `ci.yml`         | Container buildability                        |
| `Service Startup Smoke Test`             | `ci.yml`         | Core service health on local stack            |
| `E2E Smoke Test (1 hand, 2 agents)`      | `ci.yml`         | Short end-to-end hand smoke                   |
| `Web E2E & Accessibility (Playwright)`   | `ci.yml`         | Browser/a11y regression gate                  |
| `Bot Integration Tests (agent + keeper)` | `ci.yml`         | Runtime integration for bots                  |
| `Secret Scanning (gitleaks)`             | `security.yml`   | Secret leakage blocking gate                  |
| `Dependency Audit (pnpm)`                | `security.yml`   | High+ dependency vulnerabilities              |
| `OSV Scanner`                            | `security.yml`   | Lockfile vulnerability scan                   |
| `Solhint (strict)`                       | `security.yml`   | Strict Solidity linting                       |
| `Lighthouse Performance Budget`          | `lighthouse.yml` | Performance budget gate                       |

## Post-Merge Checks

These checks are valuable, but they cannot be configured as PR-required status
checks because they only run on `push` to `main`:

| Check Name                         | File           | Why it is post-merge only                       |
| ---------------------------------- | -------------- | ----------------------------------------------- |
| `Production Smoke (main only)`     | `ci.yml`       | Validates the live deployment after auto-deploy |
| `E2E Full Suite (scenarios 01-05)` | `ci.yml`       | Runs only on `main` to keep PR latency bounded  |
| `Image Vulnerability Scan (Trivy)` | `security.yml` | Runs only on `push` to keep PRs faster          |

## Emergency Bypass

In rare cases (hotfix to production), an admin can temporarily bypass with:

```bash
gh api -X PATCH repos/{owner}/{repo}/branches/main/protection \
  --field enforce_admins=false \
  --field required_pull_request_reviews=null
```

Then immediately re-apply the policy:

```bash
bash scripts/repo/apply-branch-protection.sh
```
