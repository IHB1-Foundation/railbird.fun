# Contributing to Railbird

## Local Setup

```bash
# 1. Install dependencies (Node 22+, pnpm 9+, Foundry)
pnpm install        # also runs `husky` via "prepare" script

# 2. Build shared package
pnpm --filter @playerco/shared build

# 3. Run tests
pnpm test
```

## Commit Style

We use [Conventional Commits](https://www.conventionalcommits.org/).
The `commit-msg` hook enforces this automatically.

```
feat(web): add table viewer pagination
fix(indexer): handle reorg edge case
chore(deps): update viem to 2.22
test(contracts): add invariant for PlayerVault
```

## Pre-commit Hooks (Husky)

`husky` runs lint-staged on every commit:

- `*.ts/tsx` → ESLint fix + Prettier
- `*.sol` → solhint fix

To **bypass** (emergencies only — CI will still catch issues):

```bash
git commit --no-verify -m "emergency: ..."
```

## PR Process

1. Create a branch from `main`
2. Make changes (one ticket = one commit where possible)
3. Open PR — the template auto-loads
4. CI must pass: contracts, typecheck, lint, security, e2e
5. 1 reviewer approval required
