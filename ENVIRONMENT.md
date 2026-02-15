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
- `LOG_BLOCK_RANGE` (Monad RPC-safe `eth_getLogs` chunk, recommend `<=100`, default `90`)
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
- `AGENT_DECISION_ENGINE` (`simple` | `gemini`)
- `GEMINI_API_KEY` (required when using Gemini)
- `GEMINI_MODEL` (default `gemini-2.0-flash`)
- `GEMINI_TEMPERATURE` (default `0.2`)
- `GEMINI_TIMEOUT_MS` (default `8000`)
- `TURN_ACTION_DELAY_MS` (single agent turn-start delay in ms; default 60000)
- `KEEPER_PRIVATE_KEY`
- `VRF_OPERATOR_PRIVATE_KEY` (production VRF fulfill worker key)
- `VRF_OPERATOR_POLL_INTERVAL_MS` (default `1500`)
- `VRF_OPERATOR_MIN_CONFIRMATIONS` (default `1`)
- `VRF_OPERATOR_RESCAN_WINDOW` (default `256`)
- `VRF_OPERATOR_RESCAN_FROM_REQUEST_ID` (optional)
- `VRF_OPERATOR_RANDOM_SALT` (optional)
- `OWNERVIEW_URL`
- `MAX_HANDS`
- `ENABLE_REBALANCING`
- `REBALANCE_BUY_AMOUNT_MON`
- `REBALANCE_SELL_AMOUNT_TOKENS`
- `AGENT_1_OPERATOR_PRIVATE_KEY` ... `AGENT_4_OPERATOR_PRIVATE_KEY` (for 4-agent runner)
- `AGENT_1_AGGRESSION` ... `AGENT_4_AGGRESSION` (for per-seat style in 4-agent runner)
- `AGENT_1_DECISION_ENGINE` ... `AGENT_4_DECISION_ENGINE` (optional per-seat engine override)
- `AGENT_1_GEMINI_API_KEY` ... `AGENT_4_GEMINI_API_KEY` (optional per-seat Gemini key)
- `AGENT_1_GEMINI_MODEL` ... `AGENT_4_GEMINI_MODEL` (optional per-seat model override)
- `AGENT_1_GEMINI_TEMPERATURE` ... `AGENT_4_GEMINI_TEMPERATURE` (optional per-seat sampling override)
- `AGENT_1_GEMINI_TIMEOUT_MS` ... `AGENT_4_GEMINI_TIMEOUT_MS` (optional per-seat timeout override)
- `AGENT_SLOT` (Railway multi-service agent launch: `1~4`)

### Web (`NEXT_PUBLIC_*`)
- `NEXT_PUBLIC_INDEXER_URL`
- `NEXT_PUBLIC_OWNERVIEW_URL`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_CHIP_SYMBOL`
- `NEXT_PUBLIC_TABLE_MAX_SEATS` (default `9`)
- `NEXT_PUBLIC_NADFUN_LENS_ADDRESS`
- `NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS`
- `NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS`
- `NEXT_PUBLIC_WMON_ADDRESS`

### nad.fun-Compatible Monad Testnet Defaults
- `NADFUN_LENS_ADDRESS=0xd2F5843b64329D6A296A4e6BB05BA2a9BD3816F8`
- `NADFUN_BONDING_ROUTER_ADDRESS=0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d`
- `NADFUN_DEX_ROUTER_ADDRESS=0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d`
- `WMON_ADDRESS=0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd`
- Apply same values to `NEXT_PUBLIC_*` for web reads/writes.

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

## 6. Betting UI State

- `/betting` page uses browser `localStorage` for virtual bankroll and ticket history.
- No additional env vars are required for current betting UI scope.
- Clearing browser storage resets betting history/bankroll for that browser profile.
