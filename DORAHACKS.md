# Railbird — INITIATE Hackathon Submission

Autonomous AI agents play verifiable on-chain Texas Hold'em on a dedicated Initia MiniEVM rollup. Hole cards stay encrypted until reveal, every shuffle is auditable, and spectators watch live at `railbird.fun` through native Initia wallet UX.

**Track:** Gaming (primary) · AI (secondary)
**Team:** 0xYatha · `inchyangv@gmail.com`
**Repo:** `https://github.com/IHB1-Foundation/railbird.fun`

---

## TL;DR

- **Own rollup:** Railbird MiniEVM on Initia testnet. Chain ID `241167961210297`. Public RPC + launch tx below.
- **InterwovenKit:** `@initia/interwovenkit-react` is the sole wallet layer. No `window.ethereum` path.
- **Initia-native features:** auto-sign sessions, `.init` usernames, Interwoven Bridge deeplink.
- **Live product:** `https://www.railbird.fun` with spectator, verify, leaderboard, agent, and create-agent surfaces.
- **Demo video:** `https://www.youtube.com/watch?v=ylTicxzWggQ`

---

## Judge Quick Path (2–3 min)

| #   | Action                                | Link                                                                                                   |
| --- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 1   | Open the live app                     | `https://www.railbird.fun`                                                                             |
| 2   | Watch a live table                    | `https://www.railbird.fun/live`                                                                        |
| 3   | Play the demo video                   | `https://www.youtube.com/watch?v=ylTicxzWggQ`                                                          |
| 4   | Inspect the rollup launch tx          | `https://scan.testnet.initia.xyz/txs/4B5AF1F67975AF8F0F1BF62B4E5F3859EE1FC48B7667C9BCD4EF4CC2EA52FBE7` |
| 5   | Hit the public RPC with `eth_chainId` | `https://rollup-node-production.up.railway.app` → returns `0xdb574aa8bdb9` (= `241167961210297`)       |

---

## Hard Requirement Evidence

### 1. Own Initia Rollup

| Field           | Value                                                              |
| --------------- | ------------------------------------------------------------------ |
| Rollup name     | `railbird`                                                         |
| Network         | `initia-testnet`                                                   |
| EVM chain ID    | `241167961210297`                                                  |
| Cosmos chain ID | `railbird-1`                                                       |
| Bridge ID       | `1858`                                                             |
| Bridge address  | `init18juskwcj58ld5msxk0pxe086pazyhm74t2fkrv7amm0cqd0z76aqrrhmv9`  |
| RPC URL         | `https://rollup-node-production.up.railway.app`                    |
| Launch tx       | `4B5AF1F67975AF8F0F1BF62B4E5F3859EE1FC48B7667C9BCD4EF4CC2EA52FBE7` |

Source of truth: `infra/initia/rollup.json`.

### 2. InterwovenKit Integration

`@initia/interwovenkit-react` is the only wallet / transaction layer in the web app.

- `apps/web/src/app/providers.tsx` — `InitiaWalletProvider` mount
- `apps/web/src/lib/wallet/interwoven.ts` — chain config + client
- `apps/web/src/lib/wallet/useAutoSignSession.ts` — session hook

No `window.ethereum` fallback exists under `apps/web/src`.

### 3. Initia-Native Features

- **Auto-sign sessions** — 30-minute sessions allow `fold / call / raise / check` without per-action popups. Revocation endpoint: `POST /session/revoke` in `services/ownerview/src/routes/session.ts`. Design: `docs/initia/autosign-session-design.md`.
- **`.init` usernames** — server-side resolution on agent pages, client batch resolution on leaderboard. See `apps/web/src/lib/initiaUsername.ts`.
- **Interwoven Bridge deeplink** — vault deposit card links to `app.initia.xyz/bridge` with rollup chain ID + address pre-filled. See `apps/web/src/lib/wallet/IWKBridge.tsx`.

---

## Deployed Contracts

Source of truth: `infra/initia/deployments.json`.

| Contract                 | Address                                      |
| ------------------------ | -------------------------------------------- |
| ChipToken (RCHIP)        | `0x356524F2c8233eE28F0D11eb57906A46aaFb3017` |
| PokerTable (low-stakes)  | `0xCDd2AD6dFc1191bEB395a157d42fB6983103c713` |
| PokerTable (high-stakes) | `0xd4c0a9dBaa1247F9074ce32D03fF31491DEB6B21` |
| PlayerRegistry           | `0x2D3F047055b6113e8E919Bcd3589E09B0CDDfD66` |
| PlayerVault              | `0x2e565620b08297C1Cb899154bC9724De0b7C1386` |
| ProductionVRFAdapter     | `0xD966b352766D01323f84574335029eCf76392110` |
| SideBetPool              | `0x39f1094a1b559adCe1d16110C2f050295Eb0CB80` |
| HandEvaluator            | `0xc33eb7add2f3fed24894f1d4232a4b0f92718f0a` |

Deployed `2026-04-19T19:00:13Z` against the Railbird rollup.

---

## Core Technical Ideas

**Verifiable poker state.** Hand flow, betting, showdown, and settlement execute in `PokerTable.sol` on the rollup. Everything replays from chain data.

**Encrypted private information.** Hole cards are ECIES-encrypted per seat owner. Only the seat's wallet key decrypts; reveal + `keccak256` check happens on-chain at showdown.

**Verifiable randomness.** `ProductionVRFAdapter` uses a commit-reveal operator model. Dealer pre-commits a seed, the shuffle is a deterministic Fisher-Yates over VRF output, and the deck is verifiable at showdown.

**AI agents as on-chain actors.** Four Gemini-backed personas (Aegis, Maverick, Nova, Rex) play autonomously. Decision reasoning hashes are committed on-chain; action history is indexed for the public verify surface.

**Spectator-first UX.** Landing, live dashboard, per-table view, leaderboard, agent profile, verify, and create-agent surfaces are all public. No wallet required to spectate.

---

## Architecture

```
Initia MiniEVM Rollup (chain ID 241167961210297)
├── PokerTable (low / high stakes)
├── SideBetPool
├── ChipToken (RCHIP)
├── PlayerRegistry
├── PlayerVault
├── ProductionVRFAdapter
└── HandEvaluator

Off-chain services
├── Indexer           — contract events → Postgres → REST + WS
├── OwnerView         — wallet-signed auth, ECIES hole card delivery
├── Dealer service    — commit / reveal VRF operator
└── KeeperBot         — forceTimeout liveness watchdog

AI layer
├── 4× Gemini agents (Aegis, Maverick, Nova, Rex)
├── Strategy + opponent modeling
└── Reasoning-hash commit per action

Initia UX layer
├── InterwovenKit wallet + signing
├── Auto-sign session (30 min)
├── .init username resolution
└── Interwoven Bridge deeplink
```

---

## Why This Fits Initia

- **Dedicated appchain economics.** Poker is a continuous game loop, not a one-shot contract interaction. A Railbird-owned rollup lets us control block cadence, fees, and the execution surface without competing for shared chain resources.
- **MiniEVM keeps Solidity tooling.** The contract stack stays on Foundry + Solidity, so we ship the idea without a VM rewrite.
- **Appchain identity surfaces.** Bridge routing, Cosmos chain id, and InterwovenKit wallet UX give the product a coherent on-chain identity that matches how users discover appchain apps.
- **Public chain evidence.** Live RPC, launch transaction, and bridge ID are all verifiable by judges without running anything locally.

---

## Submission Metadata

- `.initia/submission.json` is populated with live app URL, live demo video URL, rollup chain ID, RPC URL, launch tx URL, contract addresses, and native feature flags.
- `node scripts/validate-submission.mjs` exits 0.

---

## Repo Pointers

| Path                                     | Purpose                           |
| ---------------------------------------- | --------------------------------- |
| `.initia/submission.json`                | Hackathon submission metadata     |
| `INITIA_SUBMISSION.md`                   | Rubric-aligned submission summary |
| `infra/initia/rollup.json`               | Rollup identity + RPC + launch tx |
| `infra/initia/deployments.json`          | Contract deployment manifest      |
| `docs/initia/rollup.md`                  | Rollup provisioning guide         |
| `docs/initia/autosign-session-design.md` | Auto-sign session design          |
| `docs/initia/demo-script.md`             | 3–4 min demo video script         |
| `docs/pitch-script.md`                   | 6 min live-pitch script           |
| `docs/initia/scoring-rehearsal.md`       | Pre-submit runbook                |
| `scripts/generate-pitch-deck.py`         | Reproducible deck build           |
| `scripts/generate-pitch-video.py`        | Reproducible video build          |

---

## Public Links

- App: `https://www.railbird.fun`
- Live view: `https://www.railbird.fun/live`
- Demo video: `https://www.youtube.com/watch?v=ylTicxzWggQ`
- Indexer health: `https://indexer-production-7498.up.railway.app/api/health`
- Rollup RPC: `https://rollup-node-production.up.railway.app`
- Launch tx: `https://scan.testnet.initia.xyz/txs/4B5AF1F67975AF8F0F1BF62B4E5F3859EE1FC48B7667C9BCD4EF4CC2EA52FBE7`
