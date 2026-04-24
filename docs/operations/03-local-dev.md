# 03 — Local development

> See also [`LOCAL.md`](../../LOCAL.md) for the full step-by-step.

## One-shot setup

```bash
pnpm install
pnpm --filter @playerco/shared build
docker compose up -d postgres anvil
```

For a full local stack including indexer, ownerview, keeper, agents and a
deployed contract set:

```bash
bash scripts/demo.sh
```

Or open the repo in VS Code and use **Reopen in Container** (T-1706 devcontainer).

## Common loops

| Task                      | Command                                                            |
| ------------------------- | ------------------------------------------------------------------ |
| Build all packages        | `pnpm build`                                                       |
| Type check                | `pnpm typecheck`                                                   |
| Test all packages         | `pnpm test`                                                        |
| Lint                      | `pnpm lint`                                                        |
| Pre-deploy verification   | `pnpm verify:predeploy`                                            |
| Post-deploy verification  | `pnpm verify:postdeploy`                                           |
| Forge tests (contracts)   | `cd contracts && forge test -vvv`                                  |
| Forge invariant tests     | `cd contracts && forge test --match-path 'test/invariant/*.t.sol'` |
| Run a single E2E scenario | `bash scripts/e2e/scenarios/01-happy-path.sh`                      |
| Validate OpenAPI specs    | `node scripts/openapi/validate.mjs` (build first)                  |
| k6 load test (auth)       | `k6 run scripts/load/k6-auth.js`                                   |

## Resetting local state

```bash
docker compose down -v             # nuke postgres + anvil
pnpm --filter @playerco/indexer run db:flush  # truncate indexer tables only
```

## Troubleshooting

| Symptom                                   | Likely cause                                       |
| ----------------------------------------- | -------------------------------------------------- |
| `getNonce` returns 429 in tests           | shared rate-limit bucket not reset                 |
| `ABIs are out of sync`                    | run `pnpm --filter @playerco/shared generate-abis` |
| `connect ECONNREFUSED 5432`               | `docker compose up -d postgres`                    |
| `eth_chainId returned 31337 (expected …)` | wrong RPC_URL or anvil not running                 |
