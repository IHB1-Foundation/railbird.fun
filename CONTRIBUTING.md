# Contributing to Railbird

Thank you for contributing! This document covers local setup, commit conventions, and the PR process.

## Local Setup

**Prerequisites**: Node.js 22+, pnpm 9+, [Foundry](https://getfoundry.sh) (forge/anvil/cast)

```bash
# 1. Install Node dependencies + set up git hooks
pnpm install        # runs `husky` via "prepare" script automatically

# 2. Build shared package (required by services/bots/web)
pnpm --filter @playerco/shared build

# 3. (Optional) Build all packages
pnpm build
```

### Running Tests

```bash
# All TypeScript tests
pnpm test

# Solidity tests
cd contracts && forge test

# Solidity invariant tests (slow, runs=256)
cd contracts && forge test --match-path "test/invariant/*.t.sol"

# Web e2e (requires running dev server or auto-starts via playwright config)
pnpm --filter @playerco/web test:e2e

# Bot integration tests (requires forge + anvil)
pnpm --filter @playerco/agent-bot test:integration
pnpm --filter @playerco/keeper-bot test:integration
```

### Local Stack

```bash
# Start full local stack (anvil + deploy + 4 agents)
bash scripts/e2e-smoke.sh 3

# Quick CI smoke test (2 agents, 1 hand)
bash scripts/ci-e2e.sh 1
```

## Commit Style

We enforce [Conventional Commits](https://www.conventionalcommits.org/) via `commitlint`.

```
feat(web): add table viewer pagination
fix(indexer): handle reorg edge case
chore(deps): update viem to 2.22
test(contracts): add invariant for PlayerVault
docs(ops): update runbook with new SLOs
perf(indexer): add Redis caching for leaderboard
ci(security): add Trivy image scan
```

**Types**: `feat`, `fix`, `chore`, `docs`, `test`, `perf`, `ci`, `refactor`, `style`

**Scope**: optional package name (`web`, `indexer`, `ownerview`, `agent`, `keeper`, `contracts`, `shared`, `ops`, `dx`, `infra`)

## Pre-commit Hooks (Husky)

`husky` runs `lint-staged` automatically on each commit:

- `*.ts/tsx` → ESLint fix + Prettier
- `*.js/mjs/cjs` → Prettier
- `*.json/md/yaml` → Prettier
- `*.sol` → solhint fix

**To bypass** (emergencies only — CI will still enforce everything):

```bash
git commit --no-verify -m "emergency: hotfix XYZ"
```

## PR Process

1. **Branch** from `main`: `git checkout -b feat/my-feature`
2. **Implement** (follow the one-ticket-one-commit convention in `TODO.md`)
3. **Push** and open a PR — the template auto-loads
4. **CI must pass**: `contracts`, `typecheck`, `lint`, `security`, `e2e`
5. **1 reviewer approval** required before merge
6. **Squash / rebase** to keep linear history

## Code Review Guidelines

- Be specific: reference the exact line/function that needs changing
- For security-sensitive changes (auth, key handling, contract logic): request a second opinion
- Green CI + 1 approval = sufficient for most changes
- `contracts/` changes require extra care: invariant tests must pass

## Security

- **Never commit** private keys, JWT secrets, or API keys (even test/example values)
- If you accidentally commit a secret: rotate it immediately, then open a PR to remove it
- See `docs/security/` for the current security process and audit notes

## Questions?

Open an issue or ping in the team channel.
