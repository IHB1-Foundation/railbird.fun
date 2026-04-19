# Railbird — Hackathon Pitch Script (6-minute)

> Target: On-Chain Horizon Hackathon Final Pitch (Apr 22–23, 2026)
> Track: AI
> Format: 슬라이드별 발표 스크립트 — 총 6분
> Tone: 자신감 있게, 왜 되는지 설명, 기술 나열 아닌 서사 중심

---

## Slide 1: Title (15s)

Hi everyone. We're Railbird.

One sentence: **AI agents playing real poker, fully on-chain, with zero trust required.**

Not a concept. Not a whitepaper. Live right now on HashKey Chain at railbird.fun.

---

## Slide 2: Problem (35s)

Let's talk about the elephant in the room.

Crypto poker has been around for years. And it's all fake. Every single platform runs a server-side deck. The house sees every card before you do. They _can_ manipulate outcomes — and you have absolutely no way to prove they didn't. You're just... trusting them. In crypto. The irony writes itself.

And then there's the bigger problem. AI agents are making autonomous decisions everywhere now — managing funds, executing strategies, playing games. But nobody can verify what they're actually thinking. Nobody can audit whether their decisions are honest. It's a black box operating with real assets, and you're just supposed to trust it.

So we asked a simple question: **what if the dealer literally cannot cheat, and every AI decision is permanently recorded on-chain?**

---

## Slide 3: Solution (40s)

That's what we built. Railbird is a fully on-chain poker protocol where AI agents play real Texas Hold'em against each other — and everything is verifiable.

Three pillars. This is what makes it work.

**One — the dealer can't cheat.** We use VRF randomness combined with a dealer pre-commit seed to run a deterministic Fisher-Yates shuffle. The result is hashed and stored on-chain. At showdown, anyone can verify the shuffle was fair. This isn't "trust us" — this is math.

**Two — nobody can see your cards.** Each player's hole cards are encrypted with ECIES using their wallet-derived public key. Only the seat owner can decrypt. Not us. Not the server. Not even the other agents.

**Three — every AI decision is auditable.** When an agent folds, calls, or raises, the reasoning behind that decision is hashed and committed on-chain. You can go to our verify page right now and check any action from any hand. Full transparency, zero trust.

---

## Slide 4: Architecture (35s)

Here's how it all fits together.

On-chain layer: six smart contracts on HashKey Chain. PokerTable runs the full game state machine — betting rounds, timeouts, VRF triggers. SideBetPool is the spectator betting market. VRFAdapter provides provable randomness. ChipToken is our ERC-20. PlayerRegistry maps agents to wallets. PlayerVault handles the treasury.

Off-chain: an Indexer that streams every contract event into Postgres and serves it via REST and WebSocket. And the OwnerView service that handles encrypted hole card delivery with wallet-signature auth.

AI layer: four Gemini 2.0 Flash agents making autonomous decisions in real-time — evaluating hand strength, calculating pot odds, modeling opponents. Every decision hash goes on-chain.

The key insight: **the on-chain layer is the source of truth for everything.** Off-chain services are just read-optimized views. If our servers go down, the game state is still on-chain, still verifiable, still correct.

---

## Slide 5: AI Agents (30s)

Now let's talk about the brains.

We didn't build one generic AI. We built **four distinct personalities**, each powered by Gemini 2.0 Flash.

**Aegis** — the rock. Patient, disciplined, waits for premium hands. You're not bluffing this guy.

**Maverick** — the grinder. Reads opponents, adapts mid-game, mixes value bets and bluffs. Solid fundamentals.

**Nova** — the creative. Plays a lot of hands, finds unconventional lines, keeps opponents guessing.

**Rex** — the maniac. Pure pressure. Relentless aggression. Forces everyone into impossible decisions.

And here's what makes this interesting: each agent tracks opponent behavior in real-time — VPIP, aggression factor, fold-to-bet ratios — and **adapts its strategy dynamically**. These aren't bots running a fixed script. They're learning and adjusting every hand.

---

## Slide 6: HashKey Chain (20s)

Quick note on why we chose HashKey Chain — because this wasn't arbitrary.

We needed four things no other chain bundles together.

**Wallet-based identity** — all authentication through wallet signatures. No emails, no passwords. On-chain ownership equals authorization. Clean.

**OP Stack EVM equivalence** — standard Solidity, standard Foundry. We didn't have to modify a single line for deployment.

**VRF** — on-chain verifiable randomness. This is literally the backbone of our trustless dealer. Without this, the whole protocol doesn't work.

**Blockscout** — all six contracts are source-verified. Anyone can read the code, inspect the state. Nothing is hidden.

---

## Slide 7: Live Demo (30s)

Let me show you what this actually looks like.

At railbird.fun, you see the live table — community cards, pot size, chip stacks for all four agents updating in real-time, and a complete action log with on-chain block numbers. You can verify every single action on Blockscout.

There's a VRF status widget showing exactly when randomness was requested and fulfilled — so you know the deck is fair.

When a hand reaches showdown, you see the card flip, the winner highlight, and pot distribution — all settled and verified on-chain in the same transaction.

The leaderboard ranks agents by ROI, PnL, win rate, and max drawdown. Click into any agent and you see vault metrics, NAV history, and a token trading widget.

**This isn't a mockup. Every pixel maps to an on-chain state.**

---

## Slide 8: AI Prediction Market (40s)

Now this is where it gets really interesting. This is the part that turns spectating into participation.

You're watching AI agents play poker. You've been observing their patterns — Aegis plays tight, Rex bluffs constantly, Nova finds creative lines. You think you know who's going to win this hand. So you put your RCHIP on it. The bet goes through our SideBetPool smart contract. When the hand settles on-chain, the contract reads the winner directly from PokerTable. If you called it right, you claim your proportional share of the entire pool.

**Why this matters for AI.**

**First — it creates a real evaluation layer for AI agents.** People aren't just watching — they're actively assessing which AI strategy performs best. This is crowd-sourced AI evaluation with real stakes.

**Second — it's fully transparent.** Pari-mutuel, on-chain. No house edge. No manipulation. Odds are dynamic, payouts are purely proportional. The math is in the contract.

**Third — it's an open platform.** SideBetPool is a permissionless contract. Anyone can build prediction interfaces, analysis bots, or strategy trackers on top. **We're not just building a game — we're building infrastructure for evaluating autonomous AI agents.**

---

## Slide 9: Security (25s)

Security isn't a feature we added. It's the design principle everything was built on.

**Commit-reveal for hole cards** — keccak256 commitments on-chain, verified at showdown. Post-hoc integrity is mathematically guaranteed.

**One action per block per table** — this prevents front-running and MEV. Period. Deterministic ordering enforced at the contract level.

**Thirty-minute turn timeouts with keeper incentives** — any address can call forceTimeout to advance the game. The protocol never gets stuck. There's no single point of failure.

**Non-dilutive treasury** — the vault reverts if any trade would reduce NAV per share. Existing holders cannot be diluted. It's not a policy. It's a require statement.

---

## Slide 10: Ecosystem Impact (35s)

Let me tell you what Railbird brings to HashKey Chain — because this is bigger than poker.

**An open AI arena.** Anyone can deploy their own AI agent with custom strategy through our web wizard. That means this isn't locked to our four agents. It's a competitive ecosystem where different AI strategies compete, adapt, and evolve — all on-chain, all verifiable.

**Natural user onboarding.** Spectating is free — no wallet needed. But the moment you want to predict outcomes or deploy an agent, you need a wallet. You go from "this is fun to watch" to "I'm an on-chain user" in one click.

**Composable AI infrastructure.** Everything is permissionless. The agent registry, the prediction market, the game protocol — any team can build on top. Strategy analyzers, agent performance dashboards, AI tournament platforms. **We're building the rails for on-chain AI competition.**

---

## Slide 11: Traction & Roadmap (25s)

Where we are right now.

**Six contracts** deployed and source-verified on HashKey Chain Testnet. **Four AI agents** playing autonomously. Full spectating and sidebet UI live at railbird.fun. Real-time indexer with WebSocket streaming. Built in five weeks.

Where we're going.

**ZK proofs** — fully trustless dealing. Remove the dealer trust assumption entirely. **Multi-table tournaments** with progressive elimination. **Mobile-optimized spectating** with push notifications. And **mainnet deployment** — where sidebet markets create real economic activity on HashKey Chain.

---

## Slide 12: Closing (15s)

Railbird proves that autonomous AI can operate transparently — every decision verifiable, every action auditable, fully on-chain.

Every card is provably fair. Every AI decision is recorded. Every prediction settles on-chain.

Built on HashKey Chain. Live at railbird.fun.

We're Railbird. Thank you.

---

## Q&A Cheat Sheet

| Question                                      | Answer                                                                                                                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "How is randomness verified?"                 | VRF seed + dealer pre-commit + deterministic Fisher-Yates shuffle. On-chain verification at showdown. Anyone can replay the shuffle.                                                                                                               |
| "Can the dealer cheat?"                       | Current model: commit/reveal provides post-hoc integrity — the dealer commits before reveal, so manipulation is detectable. Roadmap: ZK proofs for full trustlessness with no trust assumption at all.                                             |
| "Why HashKey Chain?"                          | Only chain that bundles OP Stack EVM, VRF, Blockscout, and wallet-based identity together. We needed all four.                                                                                                                                     |
| "How do agents decide?"                       | Gemini 2.0 Flash evaluates hand strength percentile, pot odds, equity, and opponent modeling from historical aggression data. Outputs structured JSON with full reasoning.                                                                         |
| "How does sidebet payout work?"               | Pari-mutuel: (your bet × total pool) / total bets on winner seat. Fully proportional, no house edge. Settlement reads winner directly from PokerTable contract.                                                                                    |
| "What drives transaction volume?"             | Poker lifecycle (~20+ txs/hand) + sidebet lifecycle (bet + settle + claim per bettor). AI plays 24/7. No idle periods.                                                                                                                             |
| "Can humans play?"                            | Architecture supports it — the contracts are player-agnostic. MVP focuses on AI-vs-AI to demonstrate the protocol. Human seats are a roadmap item.                                                                                                 |
| "Why is this an AI project, not just gaming?" | The core innovation is verifiable autonomous AI decision-making. Poker is the proving ground — four AI agents reasoning, adapting, and competing with full on-chain auditability. The prediction market evaluates AI performance with real stakes. |
| "What about regulatory risk?"                 | No yield/dividend language. Tokens framed as experimental agent-associated assets. Wallet-based identity only. No custodial model.                                                                                                                 |
| "What if an agent disconnects?"               | 30-minute turn timeout. Any address can call forceTimeout() with keeper incentives. Auto-check/fold on timeout. The game always progresses.                                                                                                        |
