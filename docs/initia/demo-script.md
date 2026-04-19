# Railbird — Initia Demo Video Script

**Target length:** 3–5 minutes
**Format:** Screen recording + voiceover (OBS / Loom)

---

## Scene-by-Scene Outline

### 00:00 — Hook (15s)

> "What if 4 AI agents played poker on a blockchain — no humans, no trusted server, no cheating
> possible? That's Railbird."

Show the landing page title + animated hero card graphics.

---

### 00:15 — Connect Wallet via InterwovenKit (30s)

1. Click "Connect Wallet" button.
2. **InterwovenKit modal** opens — show the Initia-native wallet list.
3. Select wallet → approve → wallet connected banner shows address (or `.init` name if registered).

> "We use InterwovenKit, Initia's native wallet layer, so players sign in once and the app handles
> everything from there."

**Highlight:** InterwovenKit modal, `.init` username in nav bar.

---

### 00:45 — `.init` Username in Leaderboard (20s)

1. Navigate to `/leaderboard`.
2. Point out that owner column shows `yourname.init` instead of `0xabcd…`.
3. Show podium with `.init` names on top-3 entries.

> "On-chain addresses are resolved to Initia `.init` usernames everywhere in the UI."

---

### 01:05 — Join a Table + Auto-sign Session (60s)

1. Navigate to `/table/<TABLE_ID>`.
2. Click "Add Player" → approve RCHIP → `registerSeat` transaction confirmed.
3. **Auto-sign toggle** appears in the table header. Click "Auto-sign: ON".
4. InterwovenKit auto-sign session activation prompt → approve.
5. Session timer shows "29:58 remaining".

> "Poker has 10–50 actions per hand. Auto-sign sessions let players fold, call, and raise with
> one click — no wallet popup every single time."

6. Simulate 3 consecutive actions (fold → new hand → call → raise) — no popup, instant.
7. Session timer decrements in real time.

**Highlight:** Auto-sign ON/OFF toggle, session countdown, instant action execution.

---

### 02:05 — VRF → Community Cards Reveal (30s)

1. Show hand in progress — hole cards dealt (face-down for opponents).
2. Flop is revealed — community cards animate in.
3. Show explorer TX for the VRF fulfill call.

> "Shuffles are randomized by our VRF adapter — the random value is committed on-chain before
> being used, so nobody, not even the dealer service, can predict the cards."

---

### 02:35 — Hand Settlement (20s)

1. Showdown: hole cards flip → winner announced.
2. Pot transferred on-chain → TX appears in the live feed.
3. Agent profile page shows updated NAV, win rate, and strategy evolution.

---

### 02:55 — Vault Deposit via Interwoven Bridge (20s)

1. Navigate to an agent's profile page.
2. Show the "Bridge via Interwoven" card.
3. Click — Interwoven Bridge opens with destination chain and vault address pre-filled.

> "Players can fund their vault directly from any Initia ecosystem chain in one click."

---

### 03:15 — Explorer Verification (25s)

1. Open `https://scan.testnet.initia.xyz/rollup/<CHAIN_ID>`.
2. Show the most recent PokerTable transactions: `startHand`, `recordAction`, `settle`.
3. Click one TX — show input data decoded.

> "Every hand, every action, every settlement — all verifiable on-chain, right here."

---

### 03:40 — Closing (20s)

> "Railbird: autonomous AI poker, provably fair, powered by Initia. Gaming meets AI on-chain."

Show: landing page + leaderboard + table side by side.

---

## Recording Checklist

- [ ] Screen at 1920×1080, 30fps
- [ ] InterwovenKit wallet modal clearly visible
- [ ] Auto-sign session timer visible during action sequence
- [ ] `.init` username visible in leaderboard
- [ ] Interwoven Bridge pre-filled destination shown
- [ ] Rollup explorer TX list shown (not empty)
- [ ] Total length 3–5 minutes
- [ ] Upload to YouTube (unlisted or public) or Loom
- [ ] Paste URL into `.initia/submission.json` `demoVideo` field and `INITIA_SUBMISSION.md`
