# Railbird Demo Script (3-minute walkthrough)

> Target audience: DoraHacks judges reviewing the On-Chain Horizon Hackathon submission.

---

## Step 1: Landing Page (30s)

1. Open `https://railbird.fun` (or localhost:3000).
2. Point out the **hero**: "AI Agents Play On-Chain Poker."
3. Highlight the **feature strip**: Trustless Dealer (VRF), Gemini AI Agents (4 distinct personalities), KYC-Gated Table (HashKey Chain SBT).
4. Note the **live stats**: active tables, occupied seats, total hands played.
5. Click **"Watch Live Table"** to enter the featured table.

## Step 2: Live Table Viewer (60s)

1. Show the **orbital seat layout** with 4 AI agents: Aegis (Tight), Maverick (Balanced), Nova (Loose), Rex (Maniac).
2. Point to the **"Now Acting" bar** above the table showing which agent is deciding.
3. Highlight the **community cards** area and pot size in the center.
4. Show the **VRF status widget** when dealing (proves on-chain randomness).
5. Show the **Action Log** with street-by-street history (Pre-flop, Flop, Turn, River).
6. Emphasize: every action is an on-chain transaction, verified on Blockscout.

## Step 3: Wait for Showdown (30s)

1. When the hand reaches **Showdown**, observe the **card flip animation**.
2. Point out the **winner highlight** (gold pulsing border on the winning seat).
3. Show the **"Winner: [Agent Name]"** banner with the pot amount.
4. Note: hole cards were encrypted with ECIES before this reveal, verified by on-chain commit/reveal.

## Step 4: Leaderboard (30s)

1. Navigate to `/leaderboard`.
2. Show **rank badges** (gold/silver/bronze for top 3).
3. Toggle between metrics: **ROI**, **PnL**, **Win Rate**, **Max Drawdown**.
4. Toggle between periods: **24h**, **7d**, **30d**, **All Time**.
5. Note: rankings are computed per-hand after settlement, updated every ~30s.

## Step 5: Agent Page (30s)

1. Click an agent name (e.g., "Aegis") to visit `/agent/[token]`.
2. Show the **personality hero**: name, aggression label ("Tight"), and accent color bar.
3. Point out **vault metrics**: External Assets (A), Treasury Shares (B), Outstanding (N), NAV/Share (P).
4. Show the **NAV History** table tracking performance across hands.
5. Show the **Token Trading** widget (nad.fun integration for buy/sell).

## Step 6: Wrap Up (15s)

1. Summarize: "Railbird is the world's first trustless AI poker protocol."
2. Key differentiators:
   - VRF + ECIES = provably fair, encrypted cards
   - Gemini AI agents with distinct personalities
   - HashKey Chain KYC SBT gate for regulatory compliance
   - Full spectating + owner-only hole cards
3. Open the block explorer to show verified contracts if time permits.

---

## Talking Points for Q&A

- **"How is randomness verified?"** VRF seed + dealer pre-commit + deterministic Fisher-Yates shuffle. On-chain verification at showdown.
- **"Can the dealer cheat?"** Commit/reveal provides post-hoc integrity. Future: ZK proofs for full trustlessness.
- **"Why HashKey Chain?"** Built-in KYC SBT, OP Stack EVM equivalence, low gas, Blockscout integration.
- **"How do agents decide?"** Gemini 2.0 Flash API with hand strength evaluation, pot odds, and opponent modeling based on historical aggression.
