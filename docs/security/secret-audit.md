# Secret Audit Report

**Date**: 2026-04-11  
**Tool**: gitleaks v8 (full history scan)  
**Commits scanned**: 567  
**Total findings**: 52

---

## Summary

| Category | Count | Status |
|----------|-------|--------|
| `.env.hashkey` real keys (testnet) | ~15 | **Key in history — see note** |
| Hardhat/Anvil public test accounts | ~20 | False positive — documented in allowlist |
| Test JWT secrets (`test-secret-key-*`) | ~10 | False positive — test-only strings |
| CI placeholder values | ~5 | False positive — documented |
| Placeholder addresses in tests | ~2 | False positive — fake hex patterns |

---

## Real Secrets Found in History

### Commit `4416f7802ea0b74aeaa81e7ef0c410618980f800` — `.env.hashkey`

The file `.env.hashkey` was committed in this commit and contains live testnet keys:

| Key Name | Masking | Rotation Status |
|----------|---------|-----------------|
| `DEPLOYER_PRIVATE_KEY` | `0xfb7f6e...b7f9d` | **REQUIRES ROTATION** (testnet) |
| `KEEPER_PRIVATE_KEY` | `0xfb7f6e...b7f9d` | **REQUIRES ROTATION** (testnet) |
| `VRF_OPERATOR_PRIVATE_KEY` | `0xfb7f6e...b7f9d` | **REQUIRES ROTATION** (testnet) |
| `DEALER_PRIVATE_KEY` | `0x90a9c8...b433` | **REQUIRES ROTATION** (testnet) |
| `JWT_SECRET` | `ad0ba5...d031` | **REQUIRES ROTATION** |
| `DEALER_API_KEY` | `0733a6...f7` | **REQUIRES ROTATION** |
| `AGENT_1..7_OPERATOR_PRIVATE_KEY` | various | **REQUIRES ROTATION** (testnet) |
| `CHIP_TOKEN_ADDRESS` (contract addr) | `0x2210b7...7865` | Public — not sensitive |
| Various contract addresses | various | Public — on-chain, not sensitive |

**Note on severity**: All private keys are on **HashKey Chain testnet (HSK testnet)**, which holds no real monetary value. However, if the same keys are reused for mainnet, they must be rotated before mainnet launch.

---

## False Positives (Documented in `.gitleaks.toml`)

| Pattern | Files | Why Safe |
|---------|-------|----------|
| `0xac0974bec3...` | test files, ci.yml | Hardhat account #0 — publicly documented test key |
| `0x59c6995e99...` | test files, ci.yml | Hardhat account #1 — publicly documented test key |
| `0x5de4111afa...` | ci.yml | Hardhat account #2 — publicly documented test key |
| `test-secret-key-that-is-at-least-32-char*` | auth test files | Test-only string, never in production |
| `ci-test-secret-*` | ci.yml | CI placeholder — documented |
| `0x1234567890abcdef...` | test files | Fake placeholder address |

---

## Actions Taken

1. **`git rm --cached .env.hashkey`** — removed `.env.hashkey` from git index (file preserved locally).
2. **`.gitleaks.toml`** — created allowlist for confirmed false positives.
3. **`docs/security/gitleaks-report.txt`** — full gitleaks output saved.
4. **`.gitignore`** — `.env.hashkey` is already listed; confirmed entry is correct.

## Remaining Risk

- The commit `4416f7802ea0b74aeaa81e7ef0c410618980f800` remains in git history with the `.env.hashkey` content. **This is public on GitHub**.
- To fully purge: run `git filter-repo` or BFG Repo Cleaner. **Requires explicit user approval and force-push**, which is outside the ticket runner's authority.
- **Action required by operator**: Rotate all keys listed above in Railway secrets before mainnet launch. Use new keys that have never appeared in git history.

## History Rewrite Decision

Per CLAUDE.md ticket runner rules, history rewrite (filter-repo / BFG + force-push) requires **user approval**. Current status: **PENDING APPROVAL**.

If operator approves, run:
```bash
pip install git-filter-repo
git filter-repo --path .env.hashkey --invert-paths --force
# Then operator must force-push and collaborators must re-clone
```
