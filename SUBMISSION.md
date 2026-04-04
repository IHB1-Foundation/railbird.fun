# Railbird — Hackathon Submission

**Hackathon**: [On-Chain Horizon Hackathon](https://dorahacks.io/hackathon/2045) (Mar 10 – Apr 23, 2026)
**Submission deadline**: Apr 15, 23:59 GMT+8
**Tracks**: DeFi (primary) + AI (secondary)
**Chain**: HashKey Chain Testnet (ID: 133)

---

## One-line Description

> Railbird is the world's first trustless AI poker protocol — Gemini-powered agents play on-chain Texas Hold'em with verifiable shuffles, encrypted hole cards, and HashKey Chain KYC identity gating.

---

## Project Description

Railbird turns a Gemini AI-powered poker agent into a fully transparent on-chain entity:

- **Trustless Dealer**: VRF + dealer seed → deterministic Fisher-Yates shuffle → on-chain verification at showdown. No central party can manipulate cards.
- **ECIES Encryption**: Each player's hole cards are encrypted with their wallet-derived public key. Only the seat owner can decrypt — no trusted middleman.
- **Gemini AI Agents**: 4 autonomous agents with distinct aggression profiles (0.2–0.8) reason about hand strength, pot odds, and opponent tendencies.
- **KYC SBT Gate**: HashKey Chain's Soul Bound Token `isHuman()` check enforced at seat registration — only KYC-verified wallets can play.
- **Real-time Spectating**: Anyone can watch community cards, pot, action log, and AI decisions live via WebSocket.
- **Wallet-based Identity**: MetaMask + HashKey Chain, no email/password accounts.

**DeFi Track**: On-chain poker protocol with ERC-20 token (RCHIP), provably fair VRF randomness, keeper incentive pattern, per-hand treasury rebalancing.
**AI Track**: Gemini-powered decision engine reasoning about poker strategy in real time, 4 distinct AI personalities competing autonomously.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Smart Contracts | Solidity + Foundry |
| Chain | HashKey Chain Testnet (OP Stack, Chain ID 133) |
| Frontend | Next.js + TypeScript + viem |
| Wallet | MetaMask (`window.ethereum`) |
| AI | Google Gemini API (`gemini-2.0-flash`) |
| Backend | Node.js + TypeScript + PostgreSQL |
| Crypto | ECIES encryption, VRF, keccak256 commit/reveal, Fisher-Yates shuffle |
| Services | Indexer (REST + WS), OwnerView (wallet-auth + ACL) |

---

## HashKey Chain Integration

| Feature | How Used |
|---------|----------|
| **KYC SBT** | `IKYCSBTChecker.isHuman()` enforced in `PokerTable.registerSeat()` |
| **OP Stack** | Full EVM equivalence — no contract modifications needed |
| **VRF** | Community card shuffles + hole card seeding via `ProductionVRFAdapter` |
| **Blockscout** | Source-verified contracts at `https://testnet-explorer.hsk.xyz` |
| **Chain ID 133** | Native HSK token for gas, RCHIP ERC-20 for poker chips |

---

## Deployed Contract Addresses (HashKey Chain Testnet)

| Contract | Address |
|----------|---------|
| ChipToken (RCHIP) | TBD |
| PokerTable 1 (low-stakes) | TBD |
| PokerTable 2 (high-stakes) | TBD |
| PlayerRegistry | TBD |
| PlayerVault | TBD |
| ProductionVRFAdapter | TBD |

---

## Links

| | |
|---|---|
| **GitHub** | (this repo) |
| **Demo URL** | TBD (after M3 deployment) |
| **Demo Video** | TBD (3–5 min recording) |
| **Block Explorer** | `https://testnet-explorer.hsk.xyz` |
| **DoraHacks** | `https://dorahacks.io/hackathon/2045` |

---

## On-Chain Evidence (Representative Transactions)

> To be filled after M4 (T4.2)

| Transaction | Description | Explorer URL |
|-------------|-------------|--------------|
| ChipToken deploy | | TBD |
| PokerTable 1 deploy | | TBD |
| PokerTable 2 deploy | | TBD |
| PlayerRegistry deploy | | TBD |
| PlayerVault deploy | | TBD |
| VRFAdapter deploy | | TBD |
| Agent registration | | TBD |
| Encryption key registration | | TBD |
| Hand started | | TBD |
| VRF request | | TBD |
| VRF fulfill | | TBD |
| Fold action | | TBD |
| Call action | | TBD |
| Raise action | | TBD |
| Showdown + seed reveal | | TBD |
| Settlement | | TBD |

---

## Notes

- Originally built on KAIA Kairos (Chain ID: 1001); fully ported to HashKey Chain for this hackathon.
- Old KAIA addresses are preserved in git history but are no longer active.
