# Railbird — Initia Demo Video Script

**Target length:** 3 to 4 minutes  
**Format:** screen recording + voiceover  
**Goal:** prove the live product and the live Initia rollup evidence fast

---

## Scene 1 — Landing Page (20s)

1. Open `https://www.railbird.fun`.
2. Show the hero, live stats, and primary CTA.
3. Pause on `SEASON 1 · INITIA TESTNET`.

Voiceover:

> "Railbird is autonomous AI poker running on its own Initia rollup. This is the live product, not a mockup."

---

## Scene 2 — Live Dashboard (35s)

1. Open `https://www.railbird.fun/live`.
2. Show the featured table, active hand state, stacks, and latest actions.
3. Scroll just enough to show the live cards area and stats ticker.

Voiceover:

> "The live dashboard is driven from on-chain game state through the indexer. You can see which agents are seated, what hand is running, and how the table is progressing in real time."

---

## Scene 3 — Table View (45s)

1. Open a real table page from the live view.
2. Show community cards, pot, seat states, and the action log.
3. Expand a recent action if available.
4. If a hand is close to showdown, wait long enough to capture the reveal.

Voiceover:

> "At the table level, every hand is visible as structured state. You can follow cards, betting flow, and settlement. The UI is a spectator surface on top of the chain, so the game keeps existing even if the frontend disappears."

---

## Scene 4 — Verify Surface (30s)

1. Open `/verify` with an existing table or hand if available.
2. Show the audit trail and the verification input.
3. Point out the reasoning hash verification flow.

Voiceover:

> "Railbird is not just about watching AI output. The app includes a verification surface for inspecting the decision trail against on-chain evidence."

---

## Scene 5 — Leaderboard and Agent Page (35s)

1. Open `https://www.railbird.fun/leaderboard`.
2. Show ranking metrics like ROI, PnL, and win rate.
3. Click into one agent page.
4. Show persona summary, recent hands, and strategy-related sections.

Voiceover:

> "Every agent becomes a trackable on-chain competitor. The leaderboard and agent pages make performance legible instead of hiding it inside a bot process."

---

## Scene 6 — Create-Agent Flow (20s)

1. Open `https://www.railbird.fun/create-agent`.
2. Show the persona selection and table selection steps.
3. Stop before any wallet-only step if recording from a spectator environment.

Voiceover:

> "Railbird is not limited to the house bots. The create-agent flow turns the app into an open arena where outside users can deploy their own AI agents into live tables."

---

## Scene 7 — Rollup Evidence (35s)

1. Open the launch transaction:
   `https://scan.testnet.initia.xyz/txs/4B5AF1F67975AF8F0F1BF62B4E5F3859EE1FC48B7667C9BCD4EF4CC2EA52FBE7`
2. Show the public RPC in terminal or Postman:

```json
{ "jsonrpc": "2.0", "method": "eth_chainId", "params": [], "id": 1 }
```

3. Show the result `0xdb574aa8bdb9`.
4. Say that this equals decimal `241167961210297`.

Voiceover:

> "This is the core hackathon proof point. Railbird is running on its own Initia appchain. The live RPC returns chain ID 241167961210297, and the rollup launch transaction is public."

---

## Scene 8 — Closing (15s)

1. Return to `https://www.railbird.fun`.
2. Hold on the hero and CTA.

Voiceover:

> "Railbird combines autonomous AI, live spectatorship, and on-chain poker on a dedicated Initia rollup. Live app, live demo, live chain evidence."

---

## Optional Appendix — Wallet UX Recording

Only record this if the production environment being captured has the Initia wallet path enabled.

1. Show wallet connect through the Initia flow.
2. Show `.init` resolution if visible in the session.
3. Show bridge or deposit surfaces only if they are active in the current build.

Do not make this the main body of the demo. The main proof is the live app plus the live rollup evidence.

---

## Recording Checklist

- [ ] `https://www.railbird.fun` returns `200`
- [ ] `https://www.railbird.fun/live` returns `200`
- [ ] Demo video URL remains `https://www.youtube.com/watch?v=ylTicxzWggQ`
- [ ] Launch tx page loads publicly
- [ ] RPC `eth_chainId` matches decimal `241167961210297`
- [ ] No placeholder links or local URLs appear on screen
