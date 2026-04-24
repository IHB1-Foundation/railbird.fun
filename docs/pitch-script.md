# Railbird — Hackathon Pitch Script (6 minutes)

> Target: INITIATE final pitch
> Track: Gaming first, AI second
> Goal: prove this is a live product on its own Initia rollup, not a concept deck

---

## Slide 1: Title (15s)

Hi everyone. We're Railbird.

Railbird is autonomous AI poker running on its own Initia appchain. Four Gemini-powered agents play real Texas Hold'em on-chain, and anyone can watch the game live at `railbird.fun`.

---

## Slide 2: Problem (30s)

Poker and AI both have the same trust problem.

In most online poker, the deck lives on a private server. The operator sees every card before the players do, and users have no way to prove the game was fair.

At the same time, AI agents are now making more real decisions on-chain, but most of them are still black boxes. You can see the output, but you cannot inspect why the agent acted.

We wanted to remove both trust assumptions at the same time.

---

## Slide 3: Solution (35s)

Railbird combines three things into one live protocol.

First, the table is on-chain. Hand state, betting flow, settlement, and table progression all come from smart contracts.

Second, the cards stay private during the hand. Hole cards are encrypted for each seat owner and only revealed later through commit and reveal.

Third, the AI layer is observable. Agents act autonomously, but the game history and decision trail are exposed through the app and indexer so the behavior is inspectable instead of hidden.

---

## Slide 4: Architecture (35s)

The system has four layers.

At the base is our dedicated Initia MiniEVM rollup. Core contracts include `PokerTable`, `SideBetPool`, `ChipToken`, `PlayerRegistry`, `PlayerVault`, and `ProductionVRFAdapter`.

On top of that we run the service layer: the indexer, OwnerView, and fleet services that keep the live product synchronized with on-chain state.

Then the AI layer runs four Gemini agents with different personalities and aggression profiles.

The important point is that the chain is the source of truth. The web app is just the public viewing surface on top of it.

---

## Slide 5: Product (30s)

This is not a dashboard for developers. It is already a public spectator product.

On the live table page you can see the current hand, pot, seats, and action log in real time.

The verify surface lets you inspect action history and reasoning hashes. The leaderboard ranks agents by ROI, PnL, win rate, and drawdown. Agent pages show persona, recent hands, and strategy evolution.

And users can deploy their own agent from the create-agent flow instead of just watching ours.

---

## Slide 6: Why Initia (25s)

This product fits Initia unusually well.

We needed our own appchain because poker is a constant game loop, not a one-off contract interaction. We wanted dedicated execution, our own chain identity, and an experience that feels like a coherent product instead of a contract demo.

MiniEVM let us keep the Solidity stack. Initia also gives us native distribution surfaces like bridge routing, appchain identity, and wallet UX hooks that match how users discover and move into an app-specific chain.

---

## Slide 7: Rollup Evidence (30s)

The key requirement in this hackathon is having your own Initia appchain, so here is the evidence directly.

Railbird is live on rollup chain ID `241167961210297`.

The public RPC is `https://rollup-node-production.up.railway.app`.

The public launch transaction is:
`https://scan.testnet.initia.xyz/txs/4B5AF1F67975AF8F0F1BF62B4E5F3859EE1FC48B7667C9BCD4EF4CC2EA52FBE7`

So judges can verify three things quickly: the live app, the live demo video, and the live rollup evidence.

---

## Slide 8: AI Agents (30s)

We run four distinct personalities, not one generic bot.

Aegis is tight and disciplined. Maverick is balanced and adaptive. Nova plays wider and finds unusual lines. Rex is aggressively pressuring the table.

That personality spread makes the game more interesting to watch, but it also turns Railbird into an open arena for comparing AI behavior under the same on-chain rules.

---

## Slide 9: Security (25s)

The product is designed around verifiability and liveness.

Hole cards use commit and reveal integrity. Turn order is constrained on-chain to reduce ordering games. Timeouts allow the protocol to move forward instead of freezing if one actor stalls. Treasury and vault logic are contract-enforced rather than policy-based.

The result is that the system keeps moving and the trust assumptions stay explicit.

---

## Slide 10: Ecosystem Impact (30s)

Railbird is bigger than a poker table.

It creates a public AI arena on Initia where spectators can follow agent performance, evaluate styles, and move from passive viewing into active participation. The prediction and side-bet layer turns watching into decision-making, and the agent creation flow opens the system to outside builders instead of keeping it closed.

This is a gaming product, but it is also infrastructure for observing and evaluating autonomous on-chain agents.

---

## Slide 11: Traction & Roadmap (25s)

Today, the live stack is already running: contracts deployed, indexer live, fleet live, public app up, public demo video published, and submission metadata validated.

Next, we want to tighten the cryptographic guarantees further, expand into tournament structures, improve mobile spectating, and push the prediction market deeper into the product.

The immediate milestone was proving the full loop on an Initia rollup. That milestone is complete.

---

## Slide 12: Closing (15s)

Railbird shows that autonomous AI gameplay can be public, inspectable, and appchain-native.

Own Initia rollup. Live product. Verifiable on-chain poker.

We're Railbird. Thank you.

---

## Judge Quick Path

If time is short, show these in order:

1. `https://www.railbird.fun`
2. `https://www.railbird.fun/live`
3. `https://www.youtube.com/watch?v=ylTicxzWggQ`
4. `https://scan.testnet.initia.xyz/txs/4B5AF1F67975AF8F0F1BF62B4E5F3859EE1FC48B7667C9BCD4EF4CC2EA52FBE7`
5. RPC `eth_chainId` result `241167961210297`
