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

| Layer           | Technology                                                           |
| --------------- | -------------------------------------------------------------------- |
| Smart Contracts | Solidity + Foundry                                                   |
| Chain           | HashKey Chain Testnet (OP Stack, Chain ID 133)                       |
| Frontend        | Next.js + TypeScript + viem                                          |
| Wallet          | MetaMask (`window.ethereum`)                                         |
| AI              | Google Gemini API (`gemini-2.0-flash`)                               |
| Backend         | Node.js + TypeScript + PostgreSQL                                    |
| Crypto          | ECIES encryption, VRF, keccak256 commit/reveal, Fisher-Yates shuffle |
| Services        | Indexer (REST + WS), OwnerView (wallet-auth + ACL)                   |

---

## HashKey Chain Integration

| Feature          | How Used                                                                                                          |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| **KYC SBT**      | `IKYCSBTChecker.isHuman()` integrated in `PokerTable.registerSeat()` — opt-in gate, ready for mainnet enforcement |
| **OP Stack**     | Full EVM equivalence — no contract modifications needed                                                           |
| **VRF**          | Community card shuffles + hole card seeding via `ProductionVRFAdapter`                                            |
| **Blockscout**   | Source-verified contracts at `https://testnet-explorer.hsk.xyz`                                                   |
| **Chain ID 133** | Native HSK token for gas, RCHIP ERC-20 for poker chips                                                            |

---

## Deployed Contract Addresses (Testnet)

| Contract                   | Address                                                                                                                             | Deploy TX                                                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| ChipToken (RCHIP)          | [`0x2210b79EC6e40d96072a0c26FfB64731a60d7865`](https://testnet-explorer.hsk.xyz/address/0x2210b79EC6e40d96072a0c26FfB64731a60d7865) | [`0x2165...`](https://testnet-explorer.hsk.xyz/tx/0x216518f9d4510e9e2a368b0bd18aa0666ef9f75921af4b39e632aa42baa516b0) |
| PokerTable 1 (low-stakes)  | [`0x9250aB833Bb070FBd993aF1b0C103dd2D58ae601`](https://testnet-explorer.hsk.xyz/address/0x9250aB833Bb070FBd993aF1b0C103dd2D58ae601) | [`0x3da2...`](https://testnet-explorer.hsk.xyz/tx/0x3da29053197f7cdd58de51af4695e278166592974336f7831f518a10981ec71c) |
| PokerTable 2 (high-stakes) | [`0x984396E8798f8Fc30F0555FfA21F2bF982e54eD3`](https://testnet-explorer.hsk.xyz/address/0x984396E8798f8Fc30F0555FfA21F2bF982e54eD3) | [`0x79e4...`](https://testnet-explorer.hsk.xyz/tx/0x79e440685d4e5bd3a2b61205d9306946d0732bf158965de044e127a9c7b169bd) |
| PlayerRegistry             | [`0x885b6a72480B264c258ba7167600D0D0Cc2fFF14`](https://testnet-explorer.hsk.xyz/address/0x885b6a72480B264c258ba7167600D0D0Cc2fFF14) | [`0xfe63...`](https://testnet-explorer.hsk.xyz/tx/0xfe63813adae9f33062d9727a4eb4c659ea54b16972088c7b63195f44595cc0b2) |
| PlayerVault                | [`0xd11838C992C3393fe3B9493cf4c640EB66b8AfB5`](https://testnet-explorer.hsk.xyz/address/0xd11838C992C3393fe3B9493cf4c640EB66b8AfB5) | [`0x8871...`](https://testnet-explorer.hsk.xyz/tx/0x88717014e08f306d7a87a26e3b9a76e721fc02d3dd49893ed153bbf5c5a539d6) |
| ProductionVRFAdapter       | [`0xdA613984af7Ae9e3A5834914C25d28c48be8D0d3`](https://testnet-explorer.hsk.xyz/address/0xdA613984af7Ae9e3A5834914C25d28c48be8D0d3) | [`0x22bb...`](https://testnet-explorer.hsk.xyz/tx/0x22bbc5f9f8d3961a1f7d5686c8fcf3d47759eda3d48f15e2dcc3611b120438ce) |

---

## Links

|                    |                                       |
| ------------------ | ------------------------------------- |
| **GitHub**         | (this repo)                           |
| **Demo URL**       | `https://railbird.fun`                |
| **Demo Video**     | See `docs/demo-script.md`             |
| **Block Explorer** | `https://testnet-explorer.hsk.xyz`    |
| **DoraHacks**      | `https://dorahacks.io/hackathon/2045` |

---

## On-Chain Evidence (Representative Transactions)

All transactions on HashKey Chain Testnet (Chain ID: 133). Deployer: `0x23EB3128d46727BC4587CE0CCC900D06486b862b`.

### Contract Deployments

| Transaction            | TX Hash                                                              | Explorer                                                                                                       |
| ---------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| ChipToken deploy       | `0x216518f9d4510e9e2a368b0bd18aa0666ef9f75921af4b39e632aa42baa516b0` | [View](https://testnet-explorer.hsk.xyz/tx/0x216518f9d4510e9e2a368b0bd18aa0666ef9f75921af4b39e632aa42baa516b0) |
| PokerTable 1 deploy    | `0x3da29053197f7cdd58de51af4695e278166592974336f7831f518a10981ec71c` | [View](https://testnet-explorer.hsk.xyz/tx/0x3da29053197f7cdd58de51af4695e278166592974336f7831f518a10981ec71c) |
| PokerTable 2 deploy    | `0x79e440685d4e5bd3a2b61205d9306946d0732bf158965de044e127a9c7b169bd` | [View](https://testnet-explorer.hsk.xyz/tx/0x79e440685d4e5bd3a2b61205d9306946d0732bf158965de044e127a9c7b169bd) |
| PlayerRegistry deploy  | `0xfe63813adae9f33062d9727a4eb4c659ea54b16972088c7b63195f44595cc0b2` | [View](https://testnet-explorer.hsk.xyz/tx/0xfe63813adae9f33062d9727a4eb4c659ea54b16972088c7b63195f44595cc0b2) |
| PlayerVault deploy     | `0x88717014e08f306d7a87a26e3b9a76e721fc02d3dd49893ed153bbf5c5a539d6` | [View](https://testnet-explorer.hsk.xyz/tx/0x88717014e08f306d7a87a26e3b9a76e721fc02d3dd49893ed153bbf5c5a539d6) |
| VRFAdapter deploy      | `0x22bbc5f9f8d3961a1f7d5686c8fcf3d47759eda3d48f15e2dcc3611b120438ce` | [View](https://testnet-explorer.hsk.xyz/tx/0x22bbc5f9f8d3961a1f7d5686c8fcf3d47759eda3d48f15e2dcc3611b120438ce) |
| Vault authorizeTable 1 | `0xac51f0e8957b4d145316f532e7e2345f0d985843cddb8cf133ef84cc76b7ab07` | [View](https://testnet-explorer.hsk.xyz/tx/0xac51f0e8957b4d145316f532e7e2345f0d985843cddb8cf133ef84cc76b7ab07) |
| Vault authorizeTable 2 | `0x17d69f56e0551f5caa8a643b1df763d11755bd21981a112f0aaab4f5f9fe3258` | [View](https://testnet-explorer.hsk.xyz/tx/0x17d69f56e0551f5caa8a643b1df763d11755bd21981a112f0aaab4f5f9fe3258) |
| Vault initialize       | `0xde40b3e0176bdddb1316c097e6434938161075fbc10d3c032b9b47c72997dae5` | [View](https://testnet-explorer.hsk.xyz/tx/0xde40b3e0176bdddb1316c097e6434938161075fbc10d3c032b9b47c72997dae5) |

### Seat Registration (PokerTable 2)

| Transaction                 | Description                                                  | TX Hash                                                              | Explorer                                                                                                       |
| --------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Agent registration (seat 0) | `registerSeat()` — approve RCHIP + register seat with buy-in | `0xb3115d64fb4da0afaffb3bda01dd7d88c0e264a6ca06320fce6d48665c3a4232` | [View](https://testnet-explorer.hsk.xyz/tx/0xb3115d64fb4da0afaffb3bda01dd7d88c0e264a6ca06320fce6d48665c3a4232) |
| Agent registration (seat 1) | `registerSeat()` — second agent joins table                  | `0x79593d1b0a6d97dd4a2cdea97663a042320f6f3f988c191eaae840475873130c` | [View](https://testnet-explorer.hsk.xyz/tx/0x79593d1b0a6d97dd4a2cdea97663a042320f6f3f988c191eaae840475873130c) |

### Game Lifecycle (PokerTable 1)

| Transaction           | Description                                                 | TX Hash                                                              | Explorer                                                                                                       |
| --------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Hand started          | `startHand()` — begins a new hand, posts blinds             | `0x95f92a3894ed0be538c853fd32ced61e3c5efec9cfd9afbfda6a7b3553221f7c` | [View](https://testnet-explorer.hsk.xyz/tx/0x95f92a3894ed0be538c853fd32ced61e3c5efec9cfd9afbfda6a7b3553221f7c) |
| Hole card commit      | `submitHoleCommit()` — dealer commits encrypted cards       | `0xb2b7bdb45b55e0cefe3b18db4cb33b79c9fd42be0a045bfe647123bca57f293d` | [View](https://testnet-explorer.hsk.xyz/tx/0xb2b7bdb45b55e0cefe3b18db4cb33b79c9fd42be0a045bfe647123bca57f293d) |
| Advance to preflop    | `advanceToPreflop()` — transition after hole card deals     | `0xd5912ffe9e6879f01e7e90951a3394a8eb4a5e27a0b2e72102d6e5d1af747299` | [View](https://testnet-explorer.hsk.xyz/tx/0xd5912ffe9e6879f01e7e90951a3394a8eb4a5e27a0b2e72102d6e5d1af747299) |
| VRF fulfill           | `fulfillRandomness()` — VRF operator provides randomness    | `0x3dc411ea66fcbd4da24dec08d2587e87d0bc0749b3fabf6646a3b19afed767fa` | [View](https://testnet-explorer.hsk.xyz/tx/0x3dc411ea66fcbd4da24dec08d2587e87d0bc0749b3fabf6646a3b19afed767fa) |
| Fold action           | `fold()` — agent folds hand                                 | `0x1559954af9cd4c8702440986c4ba24b17ba0a027dcf8338ea8c0cb2f02b75041` | [View](https://testnet-explorer.hsk.xyz/tx/0x1559954af9cd4c8702440986c4ba24b17ba0a027dcf8338ea8c0cb2f02b75041) |
| Check action          | `check()` — agent checks                                    | `0x98fd02422ad47d5d6bfe96f9845f722a91e071a6fb46dca1cff0df6d88f3af79` | [View](https://testnet-explorer.hsk.xyz/tx/0x98fd02422ad47d5d6bfe96f9845f722a91e071a6fb46dca1cff0df6d88f3af79) |
| Call action           | `call()` — agent calls current bet                          | `0x7950bac8f9890b2245e83c2c627476077b972a792b251666faf678826fec4704` | [View](https://testnet-explorer.hsk.xyz/tx/0x7950bac8f9890b2245e83c2c627476077b972a792b251666faf678826fec4704) |
| Raise action          | `raise()` — agent raises to 0.4 RCHIP (2x big blind)        | `0xbdecdc9c210dba9dab2640c46f85b0e7fa6192ca95d10706394134537ac66889` | [View](https://testnet-explorer.hsk.xyz/tx/0xbdecdc9c210dba9dab2640c46f85b0e7fa6192ca95d10706394134537ac66889) |
| Hole card reveal      | `revealHoleCards()` — reveal at showdown for verification   | `0x3ba6ffc7dcd4c9744c0167c8587434acf6db4f332c13cc7f7f6d13e78283963c` | [View](https://testnet-explorer.hsk.xyz/tx/0x3ba6ffc7dcd4c9744c0167c8587434acf6db4f332c13cc7f7f6d13e78283963c) |
| Showdown + settlement | `settleShowdown()` — verify hands, distribute pot           | `0xd5c2b0a54af11924b5831a3c58c65c299a77dca9e2d0fd87534516dac4339ce1` | [View](https://testnet-explorer.hsk.xyz/tx/0xd5c2b0a54af11924b5831a3c58c65c299a77dca9e2d0fd87534516dac4339ce1) |
| Settlement by fold    | Last active player wins pot after all others fold (hand 46) | `0x52ef56b30a82cafe5c006c41c5d3bb2480337653d1a24630ecea3657d0ff544e` | [View](https://testnet-explorer.hsk.xyz/tx/0x52ef56b30a82cafe5c006c41c5d3bb2480337653d1a24630ecea3657d0ff544e) |

---

## Notes

- Originally built on KAIA Kairos (Chain ID: 1001); fully ported to HashKey Chain for this hackathon.
- Old KAIA addresses are preserved in git history but are no longer active.
- PokerTable 1 has completed 46 hands with 6 active AI agents as of submission.
- `registerEncryptionKey()` exists in source code but was added after this deployment; ECIES key exchange is handled off-chain via the OwnerView service for this testnet deployment.
- All deploy transactions originate from a single Foundry broadcast (`DeployHashKey.s.sol`).
