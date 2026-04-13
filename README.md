# Railbird

![Invariant Tests](https://github.com/0xYatha/railbird/actions/workflows/ci.yml/badge.svg?label=invariant)
[![codecov](https://codecov.io/gh/0xYatha/railbird/branch/main/graph/badge.svg)](https://codecov.io/gh/0xYatha/railbird)

> **Hackathon Submission — [On-Chain Horizon Hackathon](https://dorahacks.io/hackathon/2045)**
> DeFi (primary) + AI (secondary) tracks | Deadline: Apr 15, 2026 | HashKey Chain Testnet (ID: 133)

---

## Hackathon Submission

**Railbird: The World's First Trustless AI Poker Protocol on HashKey Chain**

AI agents play on-chain Texas Hold'em — with verifiable shuffles, encrypted hole cards, and Gemini-powered decisions — all on HashKey Chain.

### Key Features

- **Trustless Dealer** — Verifiable shuffle (VRF + dealer seed + Fisher-Yates), ECIES per-player encryption, on-chain commit/reveal. No central entity can cheat.
- **Gemini AI Agents** — 4 autonomous AI agents with distinct aggression profiles, making real-time poker decisions using hand strength, pot odds, and opponent modeling.
- **KYC SBT Gate** — HashKey Chain's on-chain KYC (Soul Bound Token) ready for seat registration. Opt-in design — enforced when `KYC_SBT_ADDRESS` is set at deploy time.
- **Owner-Only Hole Cards** — Wallet-signature auth + ACL: only the seat owner can decrypt their own cards via ECIES.
- **Provably Fair Randomness** — VRF-driven community cards and hole card shuffles, verified on-chain at showdown.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     HashKey Chain (ID: 133)                      │
│                                                                   │
│  PokerTable ──── VRFAdapter          PlayerRegistry              │
│      │               │                      │                    │
│      │          randomness             agent metadata            │
│      │               │                      │                    │
│  ChipToken       ShuffleVerifier       PlayerVault               │
│  (RCHIP ERC-20)  (on-chain verify)    (treasury)                │
└─────────┬────────────────────────��─────────┬────────────────────┘
          │                                  │
    ┌─────▼──────┐  wallet-sign auth  ┌──────▼──────┐
    │  OwnerView  │◄──────────────────│   Web App   │
    │  (ACL +     │   ECIES hole cards │  (Next.js)  │
    │   Dealer)   │                   │  MetaMask   │
    └─────────────┘                   └──────┬──────┘
                                             │ REST + WS
    ┌────────────────┐               ┌───────▼──────┐
    │  AI Agent Bots │               │   Indexer    │
    │  (Gemini API)  │               │  (Postgres)  │
    └───────┬────────┘               └──────────────┘
            │ operator txs
    ◄───────▼──────────────────────────────────────►
                  HashKey Chain Testnet
```

### HashKey Chain Integration

| Feature        | Usage                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------- |
| **KYC SBT**    | `isHuman()` check ready on seat registration — opt-in enforcement via `KYC_SBT_ADDRESS` at deploy |
| **OP Stack**   | Full EVM equivalence, low gas, standard Solidity tooling (Foundry)                                |
| **VRF**        | On-chain randomness for community card shuffles and hole card seeding                             |
| **Blockscout** | Source-verified contracts on `https://testnet-explorer.hsk.xyz`                                   |

### Demo & Links

|                    |                                           |
| ------------------ | ----------------------------------------- |
| **Demo URL**       | `https://railbird.fun`                    |
| **Demo Video**     | See `docs/demo-script.md` for walkthrough |
| **Block Explorer** | `https://testnet-explorer.hsk.xyz`        |
| **DoraHacks**      | `https://dorahacks.io/hackathon/2045`     |

### Deployed Contract Addresses (Testnet)

| Contract                   | Address                                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| ChipToken (RCHIP)          | [`0x2210b79EC6e40d96072a0c26FfB64731a60d7865`](https://testnet-explorer.hsk.xyz/address/0x2210b79EC6e40d96072a0c26FfB64731a60d7865) |
| PokerTable 1 (low-stakes)  | [`0x9250aB833Bb070FBd993aF1b0C103dd2D58ae601`](https://testnet-explorer.hsk.xyz/address/0x9250aB833Bb070FBd993aF1b0C103dd2D58ae601) |
| PokerTable 2 (high-stakes) | [`0x984396E8798f8Fc30F0555FfA21F2bF982e54eD3`](https://testnet-explorer.hsk.xyz/address/0x984396E8798f8Fc30F0555FfA21F2bF982e54eD3) |
| PlayerRegistry             | [`0x885b6a72480B264c258ba7167600D0D0Cc2fFF14`](https://testnet-explorer.hsk.xyz/address/0x885b6a72480B264c258ba7167600D0D0Cc2fFF14) |
| PlayerVault                | [`0xd11838C992C3393fe3B9493cf4c640EB66b8AfB5`](https://testnet-explorer.hsk.xyz/address/0xd11838C992C3393fe3B9493cf4c640EB66b8AfB5) |
| ProductionVRFAdapter       | [`0xdA613984af7Ae9e3A5834914C25d28c48be8D0d3`](https://testnet-explorer.hsk.xyz/address/0xdA613984af7Ae9e3A5834914C25d28c48be8D0d3) |

### Tech Stack

| Layer           | Technology                                     |
| --------------- | ---------------------------------------------- |
| Smart Contracts | Solidity + Foundry                             |
| Chain           | HashKey Chain Testnet (OP Stack, Chain ID 133) |
| Frontend        | Next.js + TypeScript + viem                    |
| Wallet          | MetaMask (`window.ethereum`)                   |
| AI              | Google Gemini API (`gemini-2.0-flash`)         |
| Backend         | Node.js + TypeScript + PostgreSQL              |
| Crypto          | ECIES encryption, VRF, keccak256 commit/reveal |

### Quick Start (3 lines)

```bash
cp .env.hashkey .env          # fill in private keys + contract addresses
pnpm install                  # install all dependencies
./scripts/demo-hashkey.sh     # start all services + 4 AI agents
```

---

**AI-Powered On-Chain Poker Agents on HashKey Chain**

Wallet-based identity | Public spectating | Owner-only hole cards | Gemini AI decisions | VRF randomness | HashKey Chain testnet

## HashKey Chain Quick Start

```bash
# 1. Copy and fill in the HashKey Chain env template
cp .env.hashkey .env
# Edit .env: add private keys + deployed contract addresses

# 2. Install dependencies
pnpm install

# 3. Run the demo (starts all services + 4 agents)
./scripts/demo-hashkey.sh
```

**HashKey Chain Testnet:**

- RPC: `https://testnet.hsk.xyz`
- Explorer: `https://testnet-explorer.hsk.xyz`
- Faucet: `https://faucet.hsk.xyz/faucet`
- Chain ID: `133`

## Rail Bets (Spectator Betting UI)

- Route: `/betting`
- Purpose: 4개 에이전트 프로필(성향/공격성) 기반으로 핸드 승자 베팅 UX 제공
- Settlement source: 테이블의 실제 `winnerSeat`를 사용해 자동 정산
- Current scope: 베팅 지갑/티켓은 브라우저 `localStorage` 기반 가상 장부(온체인 escrow/payout 아님)

## Table Capacity

- Poker table supports **up to 9 seats**.
- New hand start condition: **at least 2 funded seats** (full table not required).
- Empty seats are skipped in blind/action rotation.
- Seats with zero stack are evicted automatically between hands.

## Quick Start

```bash
# Prerequisites: Node.js >= 18, pnpm >= 8, Foundry

# 1. Install dependencies
pnpm install

# 2. Build all packages
pnpm build

# 3. Run tests
pnpm test
```

## Prerequisites

- **Node.js** >= 18 (recommend LTS)
- **pnpm** >= 8 (`npm install -g pnpm`)
- **Foundry** (for contracts): `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- **PostgreSQL** >= 14 (for indexer)

## Repository Structure

```
/contracts        - Solidity contracts (Foundry)
/apps/web         - Next.js web application
/services/indexer - Event indexer + REST API (polling-compatible, WS optional)
/services/ownerview - Wallet-auth + hole card ACL service
/bots/agent       - Poker-playing agent bot
/bots/keeper      - Liveness keeper bot
/bots/vrf-operator - Production VRF fulfillment worker bot
/packages/shared  - Shared types, config, and utilities
```

Railway monorepo 배포는 `RAILWAY.md`를 참고.

Major design decisions are recorded in [`docs/adr/`](./docs/adr/README.md).

## License

MIT

## Local Development Setup

### 1. Start Local Blockchain (Anvil)

```bash
# Terminal 1: Start Anvil with deterministic accounts
anvil --host 0.0.0.0 --chain-id 31337

# Default accounts (first 2 used for testing):
# Account 0: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
# Private Key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
# Account 1: 0x70997970C51812dc3A010C7d01b50e0d17dc79C8
# Private Key: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d
```

### 2. Deploy Contracts

```bash
cd contracts

# Deploy MockVRFAdapter
forge create src/mocks/MockVRFAdapter.sol:MockVRFAdapter \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Deploy ChipToken (rCHIP)
forge create src/ChipToken.sol:ChipToken \
  --constructor-args 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Mint chips to players (1,000,000 rCHIP each)
cast send <RCHIP_TOKEN_ADDRESS> \
  "mintBatch(address[],uint256)" \
  "[0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266,0x70997970C51812dc3A010C7d01b50e0d17dc79C8,0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,0x90F79bf6EB2c4f870365E785982E1f101E93b906]" \
  1000000000000000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Note the deployed addresses, then deploy PokerTable:
forge create src/PokerTable.sol:PokerTable \
  --constructor-args 1 1000000000000000000 2000000000000000000 <VRF_ADAPTER_ADDRESS> <RCHIP_TOKEN_ADDRESS> \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Deploy PlayerRegistry
forge create src/PlayerRegistry.sol:PlayerRegistry \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Deploy PlayerVault (constructor args vary based on setup)
# See contracts/src/PlayerVault.sol for required constructor arguments
```

### 3. Register Seats on Table (min 2, max 9)

```bash
# Approve buy-in first (100 rCHIP)
cast send <RCHIP_TOKEN_ADDRESS> \
  "approve(address,uint256)" <POKER_TABLE_ADDRESS> 100000000000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Register seat 0 (Account 0)
cast send <POKER_TABLE_ADDRESS> \
  "registerSeat(uint8,address,address,uint256)" 0 \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 \
  100000000000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# Approve buy-in for seat 1
cast send <RCHIP_TOKEN_ADDRESS> \
  "approve(address,uint256)" <POKER_TABLE_ADDRESS> 100000000000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Register seat 1 (Account 1)
cast send <POKER_TABLE_ADDRESS> \
  "registerSeat(uint8,address,address,uint256)" 1 \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  0x70997970C51812dc3A010C7d01b50e0d17dc79C8 \
  100000000000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d

# Approve buy-in for seat 2
cast send <RCHIP_TOKEN_ADDRESS> \
  "approve(address,uint256)" <POKER_TABLE_ADDRESS> 100000000000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

# Register seat 2 (Account 2)
cast send <POKER_TABLE_ADDRESS> \
  "registerSeat(uint8,address,address,uint256)" 2 \
  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
  0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC \
  100000000000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a

# Approve buy-in for seat 3
cast send <RCHIP_TOKEN_ADDRESS> \
  "approve(address,uint256)" <POKER_TABLE_ADDRESS> 100000000000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6

# Register seat 3 (Account 3)
cast send <POKER_TABLE_ADDRESS> \
  "registerSeat(uint8,address,address,uint256)" 3 \
  0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
  0x90F79bf6EB2c4f870365E785982E1f101E93b906 \
  100000000000000000000 \
  --rpc-url http://localhost:8545 \
  --private-key 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6
```

### Add Another Player/Agent in Demo

- Open `http://localhost:3000/table/<TABLE_ID>`.
- Use **Add Player / Agent** panel:
  - choose an empty seat,
  - input buy-in (`rCHIP`),
  - optional operator address (set this to agent wallet if owner/operator 분리 운영).

### 4. Set Up PostgreSQL (for Indexer)

```bash
# Create database
createdb playerco

# Apply schema
psql -d playerco -f services/indexer/src/db/schema.sql
```

### 5. Configure Environment Variables

Use root `.env` as the single source of truth:

```bash
cp .env.example .env
set -a; source ./.env; set +a
```

Then override service-specific `PORT` per process when running multiple services.

Core variables:

```bash
# Common variables
export CHAIN_ENV=local
export RPC_URL=http://localhost:8545
export POKER_TABLE_ADDRESS=<deployed_address>
export PLAYER_REGISTRY_ADDRESS=<deployed_address>
export PLAYER_VAULT_ADDRESS=<deployed_address>
export VRF_ADAPTER_ADDRESS=<deployed_address>
export RCHIP_TOKEN_ADDRESS=<deployed_address>

# nad.fun-compatible addresses (KAIA testnet)
export NADFUN_LENS_ADDRESS=0xff457F28decB5c7B9fC9BB5Bc6d6c0da50BA902D
export NADFUN_BONDING_ROUTER_ADDRESS=0xd8ab63E839b81306e05D70F63ca07c1C5233805B
export NADFUN_DEX_ROUTER_ADDRESS=0xd8ab63E839b81306e05D70F63ca07c1C5233805B
export WMON_ADDRESS=0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd
```

### 6. Start Services

**Terminal 2: OwnerView Service**

```bash
cd services/ownerview
JWT_SECRET=your-secret-key-at-least-32-characters \
RPC_URL=http://localhost:8545 \
POKER_TABLE_ADDRESS=<address> \
PORT=3001 \
pnpm start
```

**Terminal 3: Indexer Service**

```bash
cd services/indexer
DB_HOST=localhost \
DB_PORT=5432 \
DB_NAME=playerco \
DB_USER=postgres \
DB_PASSWORD=postgres \
RPC_URL=http://localhost:8545 \
POKER_TABLE_ADDRESS=<address> \
PLAYER_REGISTRY_ADDRESS=<address> \
CHAIN_ENV=local \
PORT=3002 \
pnpm start
```

**Terminal 4: Web App**

```bash
cd apps/web
NEXT_PUBLIC_INDEXER_URL=https://indexer.railbird.fun \
NEXT_PUBLIC_OWNERVIEW_URL=https://ownerview.railbird.fun \
pnpm dev
```

**Option A: Quick Start (all 4 agents + keeper in one command)**

```bash
# From repo root:
POKER_TABLE_ADDRESS=<address> ./scripts/run-4agents.sh
```

Default 4-agent personalities use different aggression values:

- Seat 0: `0.15` (tight)
- Seat 1: `0.35` (balanced)
- Seat 2: `0.60` (loose)
- Seat 3: `0.85` (aggressive)

**Option B: Individual terminals**

**Terminal 5: Agent Bot (Seat 0)**

```bash
cd bots/agent
RPC_URL=http://localhost:8545 \
OPERATOR_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
POKER_TABLE_ADDRESS=<address> \
OWNERVIEW_URL=http://localhost:3001 \
MAX_HANDS=0 \
pnpm start
```

**Terminal 6: Agent Bot (Seat 1)**

```bash
cd bots/agent
RPC_URL=http://localhost:8545 \
OPERATOR_PRIVATE_KEY=0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d \
POKER_TABLE_ADDRESS=<address> \
OWNERVIEW_URL=http://localhost:3001 \
MAX_HANDS=0 \
pnpm start
```

**Terminal 7: Agent Bot (Seat 2)**

```bash
cd bots/agent
RPC_URL=http://localhost:8545 \
OPERATOR_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a \
POKER_TABLE_ADDRESS=<address> \
OWNERVIEW_URL=http://localhost:3001 \
MAX_HANDS=0 \
pnpm start
```

**Terminal 8: Agent Bot (Seat 3)**

```bash
cd bots/agent
RPC_URL=http://localhost:8545 \
OPERATOR_PRIVATE_KEY=0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6 \
POKER_TABLE_ADDRESS=<address> \
OWNERVIEW_URL=http://localhost:3001 \
MAX_HANDS=0 \
pnpm start
```

**Terminal 9: Keeper Bot**

```bash
cd bots/keeper
RPC_URL=http://localhost:8545 \
KEEPER_PRIVATE_KEY=0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a \
POKER_TABLE_ADDRESS=<address> \
POLL_INTERVAL_MS=2000 \
pnpm start
```

## Environment Variables Reference

### Common (All Services)

| Variable                  | Required | Description                        |
| ------------------------- | -------- | ---------------------------------- |
| `CHAIN_ENV`               | Yes      | `local`, `testnet`, or `mainnet`   |
| `RPC_URL`                 | Yes      | Ethereum RPC endpoint URL          |
| `POKER_TABLE_ADDRESS`     | Yes      | Deployed PokerTable contract       |
| `PLAYER_REGISTRY_ADDRESS` | Yes      | Deployed PlayerRegistry contract   |
| `PLAYER_VAULT_ADDRESS`    | Yes      | Deployed PlayerVault contract      |
| `VRF_ADAPTER_ADDRESS`     | Yes      | Deployed VRF adapter contract      |
| `RCHIP_TOKEN_ADDRESS`     | Yes      | Deployed ChipToken (`rCHIP`) token |

### OwnerView Service

| Variable            | Required  | Default            | Description                          |
| ------------------- | --------- | ------------------ | ------------------------------------ |
| `JWT_SECRET`        | Yes       | -                  | Secret for JWT signing (32+ chars)   |
| `DEALER_API_KEY`    | Non-local | -                  | API key for /dealer/\* endpoint auth |
| `HOLECARD_DATA_DIR` | No        | `./data/holecards` | Persistent hole card storage dir     |
| `PORT`              | No        | 3001               | HTTP server port                     |

### Indexer Service

| Variable      | Required | Default | Description       |
| ------------- | -------- | ------- | ----------------- |
| `DB_HOST`     | Yes      | -       | PostgreSQL host   |
| `DB_PORT`     | No       | 5432    | PostgreSQL port   |
| `DB_NAME`     | Yes      | -       | Database name     |
| `DB_USER`     | Yes      | -       | Database user     |
| `DB_PASSWORD` | Yes      | -       | Database password |
| `PORT`        | No       | 3002    | HTTP server port  |

### Agent Bot

| Variable               | Required | Default                          | Description                          |
| ---------------------- | -------- | -------------------------------- | ------------------------------------ |
| `OPERATOR_PRIVATE_KEY` | Yes      | -                                | Private key for seat operator        |
| `OWNERVIEW_URL`        | No       | `https://ownerview.railbird.fun` | OwnerView service URL                |
| `AGGRESSION_FACTOR`    | No       | 0.3                              | Strategy aggression (`0.0~1.0`)      |
| `TURN_ACTION_DELAY_MS` | No       | 60000                            | Delay from turn start to action (ms) |
| `MAX_HANDS`            | No       | 0 (unlimited)                    | Stop after N hands                   |
| `POLL_INTERVAL_MS`     | No       | 1000                             | State polling interval               |

### Keeper Bot

| Variable               | Required | Default | Description                 |
| ---------------------- | -------- | ------- | --------------------------- |
| `KEEPER_PRIVATE_KEY`   | Yes      | -       | Private key for keeper      |
| `PLAYER_VAULT_ADDRESS` | No       | -       | For rebalancing support     |
| `ENABLE_REBALANCING`   | No       | false   | Enable treasury rebalancing |
| `POLL_INTERVAL_MS`     | No       | 2000    | State polling interval      |

### Web App

| Variable                                    | Required | Default                                      | Description                       |
| ------------------------------------------- | -------- | -------------------------------------------- | --------------------------------- |
| `NEXT_PUBLIC_INDEXER_URL`                   | No       | `https://indexer.railbird.fun`               | Indexer API URL                   |
| `NEXT_PUBLIC_OWNERVIEW_URL`                 | No       | `https://ownerview.railbird.fun`             | OwnerView URL                     |
| `NEXT_PUBLIC_NADFUN_LENS_ADDRESS`           | No       | `0xd2F5843b64329D6A296A4e6BB05BA2a9BD3816F8` | nad.fun-compatible Lens contract  |
| `NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS` | No       | `0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d` | nad.fun-compatible bonding router |
| `NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS`     | No       | `0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d` | nad.fun-compatible DEX router     |
| `NEXT_PUBLIC_WMON_ADDRESS`                  | No       | `0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd` | Wrapped MON address               |
| `NEXT_PUBLIC_RPC_URL`                       | No       | -                                            | RPC for client-side calls         |
| `NEXT_PUBLIC_CHIP_SYMBOL`                   | No       | `rCHIP`                                      | UI label for poker chips          |

## Running Tests

```bash
# Run all tests
pnpm test

# Run specific package tests
cd contracts && forge test -vv
cd packages/shared && pnpm test
cd services/ownerview && pnpm test
cd services/indexer && pnpm test
cd bots/agent && pnpm test
cd bots/keeper && pnpm test

# E2E smoke test (requires Anvil running)
# Deploys contracts, registers 4 seats, runs 4 agents + keeper, validates settlements
./scripts/e2e-smoke.sh [NUM_HANDS]   # default: 3 hands
```

## API Endpoints

Each HTTP service ships an OpenAPI 3.0.3 spec at `/openapi.json` and a Swagger UI at `/docs`:

| Service   | Spec URL                             | Swagger UI                   |
| --------- | ------------------------------------ | ---------------------------- |
| Indexer   | `http://localhost:3002/openapi.json` | `http://localhost:3002/docs` |
| OwnerView | `http://localhost:3001/openapi.json` | `http://localhost:3001/docs` |
| Fleet     | `http://localhost:3003/openapi.json` | `http://localhost:3003/docs` |

CI runs `node scripts/openapi/validate.mjs` to enforce structural validity on every PR.

### Indexer REST API (default: http://localhost:3002)

- `GET /api/health` - Health check
- `GET /api/tables` - List all tables
- `GET /api/tables/:id` - Get table by ID
- `GET /api/agents` - List all agents
- `GET /api/agents/:token` - Get agent by token
- `GET /api/leaderboard?metric=roi&period=7d` - Leaderboard

### OwnerView REST API (default: http://localhost:3001)

- `GET /auth/nonce?address=0x...` - Get nonce for signing
- `POST /auth/verify` - Verify signature, get JWT
- `GET /owner/holecards?tableId=&handId=` - Get hole cards (authenticated)
- `POST /dealer/deal` - Deal cards for hand
- `GET /dealer/commitments?tableId=&handId=` - Get commitments

## Troubleshooting

### Contract deployment fails

- Ensure Anvil is running: `anvil --host 0.0.0.0`
- Check RPC URL is correct
- Verify private key has funds

### Indexer can't connect to database

- Ensure PostgreSQL is running: `pg_isready`
- Verify database exists: `psql -l | grep playerco`
- Check connection credentials

### Bot can't find seat

- Verify seat is registered on table
- Check operator address matches private key
- Ensure seats are filled before starting hand

### Table polling lag

- Check indexer health and response time (`/api/health`)
- Reduce frontend polling interval only if indexer can handle it
- Verify CORS settings for `https://railbird.fun`

### Hole cards not returned

- Verify JWT is valid and not expired
- Check address is seat owner (not just operator)
- Ensure dealer has dealt cards for the hand

## Documentation

- [PROJECT.md](./PROJECT.md) - Full project specification
- [TICKET.md](./TICKET.md) - Implementation tickets and status
- [ENVIRONMENT.md](./ENVIRONMENT.md) - Root `.env` policy and variable guide
- [AGENT_INTERFACE.md](./AGENT_INTERFACE.md) - Agent integration API/WS/interface contract

## License

MIT
