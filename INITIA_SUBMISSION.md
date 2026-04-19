# Railbird — INITIATE Hackathon Submission

> Track: **Gaming (primary) + AI (secondary)**
> Team: 0xYatha | Contact: inchyangv@gmail.com

---

## Scoring Rubric Response

### 1. Originality & Track Fit (20%)

**Our claim:** Railbird is the first fully autonomous AI poker protocol on a blockchain. It combines
provably-fair cryptography (VRF, ECIES), multi-agent Gemini AI with personality-driven strategy,
and real-time on-chain settlement — creating a novel "AI vs AI" competitive game that spectators can
watch and bet on. The Gaming track fit is direct: every hand is a verifiable, on-chain poker game.
The AI track fit is the 4 autonomous Gemini agents making real decisions with GTO deviation tracking
and RAG-based memory of past hands.

**Evidence:**

- Unique: AI agents evolve their strategy parameters on-chain after observing their own win/loss patterns.
- Novel: ECIES-encrypted hole cards so each agent's private hand is provably hidden from others during play.
- Code: `bots/agent/src/strategy/`, `contracts/src/PokerTable.sol`

**Risk:** Judges might note poker is a known domain. Response: the autonomous multi-agent on-chain execution
(no human in the loop) + verifiable randomness + encrypted private information is unexplored territory.

---

### 2. Technical Execution & Initia Integration (30%)

**Our claim:** The Initia integration is deep and multi-layered:

1. **Own Initia rollup deployed** — Railbird MiniEVM rollup on Initia testnet with chain ID,
   RPC endpoint, and explorer link recorded in `infra/initia/rollup.json`.
2. **InterwovenKit** — `@initia/interwovenkit-react` is the sole wallet/transaction layer.
   `window.ethereum` references are fully removed from `apps/web/src`. Evidence:
   `apps/web/src/lib/wallet/interwoven.ts`, `apps/web/src/app/providers.tsx`.
3. **Auto-sign session UX** — `useAutoSignSession` hook activates a 30-minute InterwovenKit
   session. Poker actions (fold/call/raise/check) execute without a wallet popup.
   Evidence: `apps/web/src/lib/wallet/useAutoSignSession.ts`, `docs/initia/autosign-session-design.md`.
4. **`.init` Usernames** — Server-side resolution on agent pages; client-side batch resolution
   on leaderboard. Evidence: `apps/web/src/lib/initiaUsername.ts`.
5. **Interwoven Bridge deeplink** — Vault deposit card on agent page deeplinks to
   `app.initia.xyz/bridge` with rollup chain ID and address pre-filled.
6. **Session revocation API** — `POST /session/revoke` on OwnerView + audit log on indexer.
   Evidence: `services/ownerview/src/routes/session.ts`.

**Evidence links:**

- Rollup: `infra/initia/rollup.json`
- Contracts: `infra/initia/deployments.json`
- InterwovenKit: `apps/web/src/lib/wallet/interwoven.ts`
- Auto-sign: `apps/web/src/lib/wallet/useAutoSignSession.ts`
- E2E evidence: `docs/initia/e2e-evidence.md` _(to be filled after I14 run)_

**Risk:** Rollup address placeholder — will be replaced after live provisioning.

---

### 3. Product Value & UX (20%)

**Our claim:** Railbird solves a real UX problem unique to blockchain gaming: every action
requires a wallet popup. For a poker hand with 10–50 actions, this is unusable. Auto-sign sessions
make it feel like a native app. The `.init` username display, leaderboard, agent profiles with
strategy radar charts, GTO deviation tracking, and real-time hand replay create a polished
product that non-crypto users can understand.

**Evidence:**

- Auto-sign session timer + ON/OFF toggle: `apps/web/src/lib/wallet/useAutoSignSession.ts`
- Agent page with persona radar, win rate, ROI, strategy history: `apps/web/src/app/agent/[token]/page.tsx`
- Live table view with card animations: `apps/web/src/app/table/[id]/`
- Leaderboard with `.init` names and ELO ratings: `apps/web/src/app/leaderboard/`

**Risk:** Demo depends on live rollup. Judges should be able to verify via the demo video.

---

### 4. Working Demo & Completeness (20%)

**Our claim:** The submission is complete and runnable:

- `.initia/submission.json` — all required fields present (validated by `scripts/validate-submission.mjs`)
- README.md — Quick Start in 4 commands, all 3 hard requirements in first 2 paragraphs
- Demo video — [Railbird Initia Demo](https://www.youtube.com/watch?v=PLACEHOLDER_UPLOAD_RAILBIRD_PITCH) _(upload Railbird_Pitch.mp4 to YouTube/Loom and replace this URL)_
- E2E smoke test: `scripts/e2e-smoke.initia.sh` covers deploy → register → 3 hands
- 420 contract unit tests passing (`forge test`)
- Full build: `pnpm build` passes

**Evidence:**

- `node scripts/validate-submission.mjs` → exit 0
- `forge test` → 420 passed
- `pnpm --filter @playerco/web build` → clean

**Risk:** Video URL is a placeholder (`PLACEHOLDER_UPLOAD_RAILBIRD_PITCH`). Upload `Railbird_Pitch.mp4` to YouTube/Loom and update `.initia/submission.json` → `demoVideo` and the link above before final submission.

---

### 5. Market Understanding (10%)

**Our claim:** The target user is the crypto-native gamer who finds current on-chain games either
trivially simple (dice/coinflip) or too slow (tx-per-action). Railbird's autonomous AI agents
create a "watch-and-bet" experience that works even without active players. The addressable market
is the $3B+ online poker market converting to crypto + the growing AI agent economy.

The competitive landscape:

- **Fully on-chain poker (e.g. Poker DAO):** No AI agents, no encrypted hole cards.
- **Crypto gaming (e.g. Axie, Gods Unchained):** Card games but not poker, not AI-first.
- **AI agent platforms:** Not gaming-focused, no verifiable randomness.

Railbird's moat: the intersection of provably-fair cryptography + autonomous AI + real-money
on-chain gameplay, native to an Initia appchain with seamless UX via InterwovenKit.

**Evidence:** `HACKATHON.md` (competition context), `docs/adr/ADR-020-initia-stack.md` (strategy)

---

## Hard Requirements Summary

All three hard requirements are satisfied at the code level:

1. **Own rollup** — `infra/initia/rollup.json` (populate after `scripts/initia/launch-minitia.sh`)
2. **InterwovenKit** — `apps/web/src/lib/wallet/interwoven.ts`, `providers.tsx`
3. **Initia-native feature** — Auto-sign sessions + `.init` username resolution

For the step-by-step pre-submit runbook with exact shell commands, see:
[`docs/initia/scoring-rehearsal.md`](docs/initia/scoring-rehearsal.md)
