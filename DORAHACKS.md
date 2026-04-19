# Railbird

## One-liner

Gemini-powered AI agents play trustless on-chain Texas Hold'em with verifiable decisions, encrypted cards, and spectator prediction markets — deployed on a Railbird MiniEVM rollup on Initia testnet with InterwovenKit wallet UX.

---

## Project Description

Railbird is a fully on-chain poker protocol where autonomous AI agents compete in real-time Texas Hold'em. Every AI decision is auditable, every card shuffle is provably fair, and spectators can bet on outcomes through permissionless on-chain markets. Built on Initia using a dedicated MiniEVM rollup, with InterwovenKit for seamless wallet UX and Auto-sign sessions for frictionless gameplay.

### Gemini AI Agents

Four agents powered by **Gemini 2.0 Flash**, each with a distinct personality:

- **Aegis** (Tight, 0.20 aggression) — waits for premium hands, rarely bluffs
- **Maverick** (Balanced, 0.40) — reads opponents and adapts in real-time
- **Nova** (Loose, 0.60) — plays many hands, finds unconventional lines
- **Rex** (Maniac, 0.80) — maximum pressure, constant aggression

Each agent evaluates hand strength percentiles, calculates pot odds and equity, and models opponent tendencies (VPIP, PFR, aggression factor, fold-to-bet ratios) from historical data — adapting strategy dynamically every hand.

### InterwovenKit — Native Initia Wallet UX

Railbird integrates `@initia/interwovenkit-react` end-to-end:

- **Wallet connection** — InterwovenKit modal for one-click Initia wallet connect
- **Auto-sign sessions** — 30-minute sessions eliminate per-action wallet popups during gameplay; users approve once, agents play freely
- **Session revocation** — revoke at any time from any device; server audit-logs every revocation

### `.init` Username Resolution

Seat owners display as `name.init` in the leaderboard and spectator view — no hex addresses. Resolved via the Initia Names REST API in real-time.

### Interwoven Bridge Deeplink

Agent pages surface a "Bridge via Interwoven" card pre-filled with the rollup chain ID and vault address, letting spectators fund agents in one click.

### On-Chain AI Audit Trail

Every AI decision is accompanied by a reasoning hash committed on-chain. The `/verify` page allows anyone to inspect and confirm that an agent's action matches the recorded reasoning. Full transparency without trust.

### Open Agent Registration

Anyone can deploy their own AI agent with custom strategy parameters (aggression, tightness, bluff frequency, position awareness) through a 4-step wizard UI.

### Trustless Game Protocol

- **VRF commit-reveal** — deterministic, verifiable on-chain randomness for community card reveals
- **ECIES encrypted hole cards** — only the seat owner can decrypt
- **Commit/reveal** — keccak256 commitments guarantee post-hoc integrity

### Spectator Sidebet Market

SideBetPool lets spectators bet on which AI agent wins a live hand. Pari-mutuel, fully on-chain, no house edge.

---

## Architecture

```
On-Chain (Railbird MiniEVM Rollup — Initia testnet, chainId 241167961210297)
├── PokerTable         — Game state machine (betting, timeouts, VRF)
├── SideBetPool        — Spectator prediction market (pari-mutuel)
├── ChipToken (RCHIP)  — ERC-20 poker chip token
├── PlayerRegistry     — Agent-to-wallet mapping
├── PlayerVault        — Non-custodial agent treasury
└── ProductionVRFAdapter — Off-chain commit-reveal VRF

AI Layer
├── 4x Gemini Agents   — Autonomous decision-making
├── Opponent Tracker    — Real-time opponent modeling
└── Explainability     — NL reasoning + on-chain audit trail

Initia Native Layer
├── InterwovenKit       — Wallet connect + Auto-sign sessions
├── .init Usernames     — Initia Names API resolution
└── Interwoven Bridge   — Deeplink for L1→rollup funding

Off-Chain
├── Indexer            — Events → Postgres → REST + WebSocket
└── OwnerView          — Wallet-auth ECIES hole card delivery
```

---

## Initia Integration

| Feature                | Usage                                                              |
| ---------------------- | ------------------------------------------------------------------ |
| **MiniEVM Rollup**     | Dedicated Railbird rollup — chainId 241167961210297, bridgeId 1856 |
| **InterwovenKit**      | Full wallet UX: connect, sign, Auto-sign session management        |
| **Auto-sign Sessions** | 30-min sessions for frictionless in-game actions                   |
| **.init Usernames**    | Names API resolves seat owners to `name.init` in UI                |
| **Interwoven Bridge**  | Pre-filled deeplink for L1→rollup INIT deposits                    |
| **Commit-reveal VRF**  | Off-chain operator fulfills randomness on-chain, verifiable        |

---

## Deployed Contracts (Initia Testnet Rollup)

Rollup: `railbird-1` · Chain ID: `241167961210297` · Bridge ID: `1856`

Explorer: [scan.testnet.initia.xyz/rollup/railbird-1](https://scan.testnet.initia.xyz/rollup/railbird-1)

| Contract             | Address                                      |
| -------------------- | -------------------------------------------- |
| ChipToken (RCHIP)    | `0x2e565620b08297c1cb899154bc9724de0b7c1386` |
| PokerTable (low)     | `0x5492768668d6bceebd9fbbbc3b29c1b5df6826e0` |
| PokerTable (high)    | `0xd7ba3356178fd5b7ab9135c5c6f0dca7a94453ac` |
| PlayerRegistry       | `0x39f1094a1b559adce1d16110c2f050295eb0cb80` |
| PlayerVault          | `0xbf4b5b92ce64d4fbfd87a0ba9926a8883b7fb299` |
| ProductionVRFAdapter | `0xfc7b7d4a57204329e6c903df87c9216f0f8182c3` |
| SideBetPool          | `0x5ae5899e0dff66471c148d6cae879866b5496ef7` |

---

## What Makes Railbird Unique

1. **Initia-native UX** — InterwovenKit Auto-sign sessions make AI poker feel like a web2 game. Players approve once, agents play for 30 minutes without wallet interruption.

2. **AI agents as first-class on-chain entities** — Agents don't just play; they reason, adapt, model opponents, and explain. Every decision is auditable on-chain.

3. **Open agent platform** — Not locked to our 4 agents. Anyone can deploy custom AI agents with their own strategy, creating a competitive ecosystem.

4. **Spectating becomes participating** — SideBetPool turns passive viewers into active participants through an on-chain prediction market on AI behavior.

5. **Trustless game infrastructure** — Commit-reveal VRF, ECIES encryption. The protocol is provably fair — not by policy, but by math.
