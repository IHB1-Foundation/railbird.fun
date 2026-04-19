# Railbird

![Invariant Tests](https://github.com/0xYatha/railbird/actions/workflows/ci.yml/badge.svg?label=invariant)
[![codecov](https://codecov.io/gh/0xYatha/railbird/branch/main/graph/badge.svg)](https://codecov.io/gh/0xYatha/railbird)

> **INITIATE: The Initia Hackathon (Season 1)** — Gaming (primary) + AI (secondary)
> Deployed on a **Railbird MiniEVM rollup** on Initia testnet · Wallet powered by **InterwovenKit** · Native features: **Auto-sign session UX** + **`.init` Usernames**

---

## What Is Railbird?

Railbird is an on-chain Texas Hold'em platform where **Gemini-powered AI agents** play autonomously. Players deploy agents with custom strategies (aggression, tightness, persona), fund them with RCHIP tokens, and watch them compete in real-time. Every hand is provably fair: VRF-randomized shuffles, ECIES-encrypted hole cards, and on-chain settlement — all running on a self-hosted Railbird MiniEVM rollup on the Initia network.

Railbird integrates **InterwovenKit** (`@initia/interwovenkit-react`) as its wallet and transaction layer, giving users seamless Connect Wallet → sign → play flow without bridging complexity. To eliminate the per-action wallet popup fatigue of fast poker gameplay, Railbird activates **Auto-sign sessions** via InterwovenKit — 30-minute sessions that let players fold, call, raise, and check with one click. On-chain addresses are shown as **`.init` usernames** wherever available, making the leaderboard and seat panel feel native to the Initia ecosystem.

---

## Initia Integration

| Requirement              | Implementation                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| **Own Initia rollup**    | Railbird MiniEVM rollup — Chain ID + RPC in `infra/initia/rollup.json`                                                  |
| **InterwovenKit**        | `@initia/interwovenkit-react` — wallet connect, tx signing, auto-sign (`apps/web/src/lib/wallet/`)                      |
| **Auto-sign session UX** | `useAutoSignSession` hook — 30-min sessions for fold/call/raise/check (`apps/web/src/lib/wallet/useAutoSignSession.ts`) |
| **`.init` Usernames**    | `fetchInitUsername` — resolves addresses to `.init` names in leaderboard + agent pages                                  |
| **Interwoven Bridge**    | Deeplink on agent vault panel — pre-fills destination rollup + address                                                  |
| KYC SBT                  | Disabled (`KYC_SBT_ADDRESS=0x0`) — no equivalent on Initia                                                              |
| Trading widget           | Feature-flagged off (`NEXT_PUBLIC_ENABLE_TRADING_WIDGET=false`) — pending Initia DEX                                    |

---

## Deployed Contract Addresses (Initia Testnet Rollup)

> Run `./scripts/deploy/initia.sh` after rollup provisioning — addresses written to `infra/initia/deployments.json`.

| Contract                   | Address                  |
| -------------------------- | ------------------------ |
| ChipToken (RCHIP)          | _(see deployments.json)_ |
| PokerTable 1 (low-stakes)  | _(see deployments.json)_ |
| PokerTable 2 (high-stakes) | _(see deployments.json)_ |
| PlayerRegistry             | _(see deployments.json)_ |
| PlayerVault                | _(see deployments.json)_ |
| ProductionVRFAdapter       | _(see deployments.json)_ |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│               Railbird MiniEVM Rollup (Initia testnet)            │
│                                                                    │
│  PokerTable ──── VRFAdapter          PlayerRegistry               │
│      │               │                      │                     │
│      │          randomness             agent metadata             │
│      │               │                      │                     │
│  ChipToken       ProductionVRF         PlayerVault                │
│  (RCHIP ERC-20)  (commit-reveal)      (treasury)                 │
└─────────┬─────────────────────────────────────┬───────────────────┘
          │                                     │
    ┌─────▼──────┐  wallet-sign auth  ┌─────────▼──────┐
    │  OwnerView  │◄──────────────────│   Web App       │
    │  (ACL +     │   ECIES hole cards │  (Next.js)      │
    │   Dealer)   │                   │  InterwovenKit  │
    └─────────────┘                   └──────┬──────────┘
                                             │ REST + WS
    ┌────────────────┐               ┌───────▼──────┐
    │  AI Agent Bots │               │   Indexer    │
    │  (Gemini API)  │               │  (Postgres)  │
    └───────┬────────┘               └──────────────┘
            │ operator txs (auto-sign)
    ◄───────▼──────────────────────────────────────►
              Railbird MiniEVM Rollup (Initia)
```

---

## Tech Stack

| Layer           | Technology                                     |
| --------------- | ---------------------------------------------- |
| Smart Contracts | Solidity + Foundry                             |
| Chain           | Railbird MiniEVM rollup on Initia testnet      |
| Frontend        | Next.js 14 + TypeScript                        |
| Wallet          | `@initia/interwovenkit-react` (InterwovenKit)  |
| AI              | Google Gemini API (`gemini-2.0-flash`)         |
| Backend         | Node.js + TypeScript + PostgreSQL              |
| Crypto          | ECIES encryption, VRF commit-reveal, keccak256 |
| Usernames       | Initia `.init` username resolution             |

---

## Quick Start (Initia)

```bash
# 1. Copy Initia env template and fill in private keys + rollup addresses
cp .env.initia .env
# Edit .env: set DEPLOYER_PRIVATE_KEY, VRF_OPERATOR_ADDRESS, etc.

# 2. Install dependencies
pnpm install

# 3. Deploy contracts to Initia rollup
bash scripts/deploy/initia.sh

# 4. Run 4-agent demo
bash scripts/run-4agents.sh
```

### Initia Testnet

- Faucet: `https://faucet.testnet.initia.xyz`
- Explorer: `https://scan.testnet.initia.xyz`
- Rollup RPC: see `infra/initia/rollup.json` after provisioning

---

## Key Features

- **Trustless Dealer** — VRF-randomized shuffle, ECIES per-player hole card encryption, on-chain commit/reveal at showdown.
- **Gemini AI Agents** — Autonomous agents with persona-driven strategy (shark, rock, maniac, adaptive) using real-time opponent modeling.
- **Auto-sign Sessions** — InterwovenKit auto-sign eliminates per-action wallet popups during 10–50 action/hand gameplay.
- **`.init` Usernames** — Leaderboard and agent pages resolve wallet addresses to Initia `.init` names.
- **Interwoven Bridge** — One-click deeplink to bridge assets from any Initia ecosystem chain to the Railbird rollup.
- **On-chain Settlement** — Every pot, fold, and showdown is settled on-chain with full event history indexed for replay.

---

## Repository Structure

```
/contracts        — Solidity contracts (Foundry)
/apps/web         — Next.js web application
/services/indexer — Event indexer + REST API
/services/ownerview — Wallet-auth + hole card ACL + session revocation
/bots/agent       — Poker-playing agent bot (Gemini-powered)
/bots/keeper      — Liveness keeper + hand start/settle bot
/bots/vrf-operator — Production VRF fulfillment worker
/packages/shared  — Shared types, chain config, utilities
/docs/initia/     — Initia-specific design docs and evidence
/infra/initia/    — Rollup metadata and contract addresses
/.initia/         — Hackathon submission artifacts
```

---

## Demo

| Asset           | Link                               |
| --------------- | ---------------------------------- |
| Live App        | `https://railbird.fun`             |
| Demo Video      | _(link after recording — I13-2)_   |
| Rollup Explorer | _(see `infra/initia/rollup.json`)_ |
| E2E Evidence    | `docs/initia/e2e-evidence.md`      |
| Submission      | `.initia/submission.json`          |

---

## Prerequisites

- **Node.js** >= 18 (LTS recommended)
- **pnpm** >= 8 (`npm install -g pnpm`)
- **Foundry** (for contracts): `curl -L https://foundry.paradigm.xyz | bash && foundryup`
- **PostgreSQL** >= 14 (for indexer)

---

## License

MIT

---

## Legacy / Previous Submission (HashKey Chain)

This project was previously submitted to the On-Chain Horizon Hackathon targeting HashKey Chain
(Chain ID 133). The HashKey deployment scripts, env template, and contract addresses are preserved
in git history. The active deployment target is now the Railbird MiniEVM rollup on Initia testnet.

Design decisions are recorded in [`docs/adr/`](./docs/adr/README.md), including
[ADR-020](./docs/adr/ADR-020-initia-stack.md) (Initia stack decision).
