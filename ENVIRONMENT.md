# Environment Guide (Root Source of Truth)

This repository uses **root-level `.env`** as the canonical configuration source for local/dev operations.

## 1. Setup

```bash
cp .env.example .env
```

Load variables into the current shell:

```bash
set -a; source ./.env; set +a
```

## 2. Scope Policy

- Put shared runtime values in root `.env`.
- Do not create per-service `.env` files unless you have a deployment-specific reason.
- Keep `.env` aligned with `.env.example` whenever new variables are introduced.

## 3. Service Groups

### Chain and Contracts
- `CHAIN_ENV`
- `RPC_URL`
- `CHAIN_ID`
- `POKER_TABLE_ADDRESS`
- `PLAYER_REGISTRY_ADDRESS`
- `PLAYER_VAULT_ADDRESS`
- `VRF_ADAPTER_ADDRESS`
- `RCHIP_TOKEN_ADDRESS`
- `VRF_ADAPTER_TYPE`

### Indexer
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_POOL_SIZE`
- `START_BLOCK` (optional)
- `POLL_INTERVAL_MS`
- `PORT` (set per-process when running multiple services)

### OwnerView
- `JWT_SECRET` (required; min 32 chars)
- `DEALER_API_KEY` (required in non-local)
- `HOLECARD_DATA_DIR` (optional)
- `PORT` (set per-process)

### Bots
- `DEPLOYER_PRIVATE_KEY` (for contract/token deployment scripts)
- `OPERATOR_PRIVATE_KEY` (single agent run)
- `AGGRESSION_FACTOR` (single agent style tuning, 0.0~1.0)
- `KEEPER_PRIVATE_KEY`
- `OWNERVIEW_URL`
- `MAX_HANDS`
- `ENABLE_REBALANCING`
- `REBALANCE_BUY_AMOUNT_MON`
- `REBALANCE_SELL_AMOUNT_TOKENS`
- `AGENT_1_OPERATOR_PRIVATE_KEY` ... `AGENT_4_OPERATOR_PRIVATE_KEY` (for 4-agent runner)
- `AGENT_1_AGGRESSION` ... `AGENT_4_AGGRESSION` (for per-seat style in 4-agent runner)

### Web (`NEXT_PUBLIC_*`)
- `NEXT_PUBLIC_INDEXER_URL`
- `NEXT_PUBLIC_WS_URL`
- `NEXT_PUBLIC_OWNERVIEW_URL`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_CHIP_SYMBOL`
- `NEXT_PUBLIC_NADFUN_LENS_ADDRESS`
- `NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS`
- `NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS`
- `NEXT_PUBLIC_WMON_ADDRESS`

## 4. Root-first Execution

The following scripts now auto-load root `.env` if present:

- `scripts/run-4agents.sh`
- `scripts/demo.sh`
- `scripts/e2e-smoke.sh`

For manual service runs, either export from root `.env` first or inline env vars in each command.

## 5. Multi-service Port Note

`PORT` is consumed by multiple services. Keep it unset in root `.env` and set it per process:

```bash
PORT=3001 pnpm --filter @playerco/ownerview start
PORT=3002 pnpm --filter @playerco/indexer start
```
