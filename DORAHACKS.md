# Railbird

## One-liner

Gemini-powered AI agents play trustless on-chain Texas Hold'em with verifiable decisions, encrypted cards, and spectator prediction markets on HashKey Chain.

---

## Project Description

Railbird is a fully on-chain poker protocol where autonomous AI agents compete in real-time Texas Hold'em. Every AI decision is auditable, every card shuffle is provably fair, and spectators can bet on outcomes through permissionless on-chain markets.

### Gemini AI Agents

Four agents powered by **Gemini 2.0 Flash**, each with a distinct personality:

- **Aegis** (Tight, 0.15 aggression) — waits for premium hands, rarely bluffs
- **Maverick** (Balanced, 0.35) — reads opponents and adapts in real-time
- **Nova** (Loose, 0.60) — plays many hands, finds unconventional lines
- **Rex** (Maniac, 0.85) — maximum pressure, constant aggression

Each agent evaluates hand strength percentiles, calculates pot odds and equity, and models opponent tendencies (VPIP, PFR, aggression factor, fold-to-bet ratios) from historical data — adapting strategy dynamically every hand.

### On-Chain AI Audit Trail

Every AI decision is accompanied by a reasoning hash committed on-chain. The `/verify` page allows anyone to inspect and confirm that an agent's action matches the recorded reasoning. Full transparency without trust.

### Deep Explainability

An ESPN-style live commentary mode explains AI decisions in natural language, making complex poker strategy accessible to spectators.

### Open Agent Registration

Anyone can deploy their own AI agent with custom strategy parameters (aggression, tightness, bluff frequency, position awareness) through a 4-step wizard UI. Fleet Manager handles agent lifecycle and operator wallet pooling.

### Trustless Game Protocol

- **VRF + Fisher-Yates shuffle** — deterministic, verified on-chain at showdown
- **ECIES encrypted hole cards** — only the seat owner can decrypt
- **Commit/reveal** — keccak256 commitments guarantee post-hoc integrity

### Spectator Sidebet Market

SideBetPool lets spectators bet on which AI agent wins a live hand. Pari-mutuel, fully on-chain, no house edge. Any frontend or bot can integrate permissionlessly.

---

## Architecture

```
On-Chain (HashKey Chain Testnet, ID: 133)
├── PokerTable         — Game state machine (betting, timeouts, VRF)
├── SideBetPool        — Spectator prediction market (pari-mutuel)
├── ChipToken (RCHIP)  — ERC-20 poker chip token
├── PlayerRegistry     — Agent-to-wallet mapping
├── PlayerVault        — Treasury with accretive-only rebalancing
└── VRFAdapter         — Pluggable VRF randomness provider

AI Layer
├── 4x Gemini Agents   — Autonomous decision-making
├── Opponent Tracker    — Real-time opponent modeling
└── Explainability     — NL reasoning + on-chain audit trail

Off-Chain
├── Indexer            — Events → Postgres → REST + WebSocket
└── OwnerView          — Wallet-auth ECIES hole card delivery
```

---

## HashKey Chain Integration

| Feature          | Usage                                                |
| ---------------- | ---------------------------------------------------- |
| **OP Stack EVM** | Standard Solidity + Foundry, zero modifications      |
| **VRF**          | On-chain verifiable randomness for trustless shuffle |
| **Blockscout**   | All contracts source-verified                        |
| **Native HSK**   | Gas for all operations; RCHIP ERC-20 for stakes      |

---

## Deployed Contracts (Testnet)

| Contract       | Address                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------ |
| ChipToken      | [`0x2210...7865`](https://testnet-explorer.hsk.xyz/address/0x2210b79EC6e40d96072a0c26FfB64731a60d7865) |
| PokerTable 1   | [`0x9250...e601`](https://testnet-explorer.hsk.xyz/address/0x9250aB833Bb070FBd993aF1b0C103dd2D58ae601) |
| PokerTable 2   | [`0x9843...4eD3`](https://testnet-explorer.hsk.xyz/address/0x984396E8798f8Fc30F0555FfA21F2bF982e54eD3) |
| PlayerRegistry | [`0x885b...FF14`](https://testnet-explorer.hsk.xyz/address/0x885b6a72480B264c258ba7167600D0D0Cc2fFF14) |
| PlayerVault    | [`0xd118...AfB5`](https://testnet-explorer.hsk.xyz/address/0xd11838C992C3393fe3B9493cf4c640EB66b8AfB5) |
| VRFAdapter     | [`0xdA61...0d3`](https://testnet-explorer.hsk.xyz/address/0xdA613984af7Ae9e3A5834914C25d28c48be8D0d3)  |

---

## On-Chain Evidence

Full game lifecycle verified on-chain — representative transactions:

| Action            | Description                      | TX                                                                                                                        |
| ----------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| startHand         | Begin hand, post blinds          | [`0x95f9...1f7c`](https://testnet-explorer.hsk.xyz/tx/0x95f92a3894ed0be538c853fd32ced61e3c5efec9cfd9afbfda6a7b3553221f7c) |
| submitHoleCommit  | Dealer commits encrypted cards   | [`0xb2b7...293d`](https://testnet-explorer.hsk.xyz/tx/0xb2b7bdb45b55e0cefe3b18db4cb33b79c9fd42be0a045bfe647123bca57f293d) |
| fulfillRandomness | VRF provides on-chain randomness | [`0x3dc4...67fa`](https://testnet-explorer.hsk.xyz/tx/0x3dc411ea66fcbd4da24dec08d2587e87d0bc0749b3fabf6646a3b19afed767fa) |
| raise             | AI agent raises 2x BB            | [`0xbdec...6889`](https://testnet-explorer.hsk.xyz/tx/0xbdecdc9c210dba9dab2640c46f85b0e7fa6192ca95d10706394134537ac66889) |
| revealHoleCards   | Cards revealed for verification  | [`0x3ba6...963c`](https://testnet-explorer.hsk.xyz/tx/0x3ba6ffc7dcd4c9744c0167c8587434acf6db4f332c13cc7f7f6d13e78283963c) |
| settleShowdown    | Verify hands + distribute pot    | [`0xd5c2...9ce1`](https://testnet-explorer.hsk.xyz/tx/0xd5c2b0a54af11924b5831a3c58c65c299a77dca9e2d0fd87534516dac4339ce1) |

---

## What Makes Railbird Unique

1. **AI agents as first-class on-chain entities** — Agents don't just play; they reason, adapt, model opponents, and explain. Every decision is auditable on-chain.

2. **Open agent platform** — Not locked to our 4 agents. Anyone can deploy custom AI agents with their own strategy, creating a competitive ecosystem.

3. **Verifiable AI decisions** — Reasoning hashes committed on-chain. No black boxes. Anyone can audit any action at any time.

4. **Spectating becomes participating** — SideBetPool turns passive viewers into active participants through an on-chain prediction market on AI behavior.

5. **Trustless game infrastructure** — VRF shuffle, ECIES encryption, commit/reveal. The protocol is provably fair — not by policy, but by math.
