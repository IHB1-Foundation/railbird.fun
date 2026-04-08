# PlayerCo (Poker Agent Company)
Wallet-based identity • Public spectating • Owner-only hole cards • In-app nad.fun trading • Per-hand non-dilutive (accretive-only) treasury rebalancing

---

## 0) TL;DR
PlayerCo turns a poker-playing AI agent into an on-chain “company”:

- The agent plays on an **on-chain poker table** (timed turns, one action per block per table, VRF-driven community cards).
- The agent has an on-chain **treasury vault** that holds **external assets** (e.g., MON/WMON/AUSD).
- Each agent has a **nad.fun token** that trades on nad.fun AMM, and our web app supports **in-app buy/sell**.
- After each hand is settled, the treasury may **buy/sell its own token** on nad.fun using a strict **accretive-only (non-dilutive)** policy so that **no value is transferred from existing holders to traders** due to treasury trades.
- UI is split into:
    - **Public view**: anyone can always watch table state (community cards, pot, chip stacks, action log, timer, VRF status).
    - **Owner view**: the agent owner can see **their agent’s hole cards** plus the full public table state.
- **All identity is wallet-based**. No email/password accounts.

This repo is intended for a hackathon and will be public, including tickets.

---

## 1) Goals / Non-goals

### 1.1 Goals (must-have)
1) **Wallet = account**
    - All auth via wallet signatures.
    - Authorization derived from on-chain ownership mapping.

2) **Public real-time spectating**
    - Community cards, pot, current bet, per-seat chip stacks/status, action log, next actor, time remaining, VRF status.

3) **Owner-only hole cards**
    - The agent owner sees *their own* hole cards in real time.
    - No other user can view those hole cards before showdown.
    - Hole cards must **not** be stored in plaintext on-chain before showdown.

4) **In-app nad.fun trading**
    - Our UI supports quoting and executing nad.fun buy/sell.
    - Must display token stage (bonding curve vs locked vs graduated/DEX).
    - Must support slippage + deadline controls.
    - Must provide fallback “Open on nad.fun”.

5) **Per-hand rebalancing only**
    - No real-time/continuous rebalancing.
    - Only after a hand is settled (PnL realized).

6) **Accounting cannot break (“no leakage / no dilution due to treasury trades”)**
    - Treasury rebalancing must never reduce NAV per share for existing holders.
    - Enforced at the smart contract level (revert if not satisfied).

### 1.2 Non-goals (for MVP)
- Full privacy tech (ZK/MPC) for hole cards.
- Full-blown Texas Hold’em with all edge cases, multiway pots, side pots, etc. (We can implement a simplified but coherent version first and extend.)
- High-frequency rebalancing.
- Regulatory/financial product compliance. (We must avoid “dividend / guaranteed yield” language.)

---

## 2) Core Principles (hard constraints)

### 2.1 Wallet-based identity only
- No email/password login.
- If we need sessions, use wallet signature challenge/response.

### 2.2 Public vs Owner data separation
- Public: table state always visible.
- Owner: hole cards visible **only** to the seat owner.
- Hole cards must not appear in public APIs, events, logs, or client-side bundles.

### 2.3 Poker execution constraints
- **Turn timeout:** each player must act within **30 minutes** after the previous action.
- **One action per block per table:** only one action can be included in a single block for a given table. A second action in the same block must revert.
- **VRF at betting-round end:** when “no more bets” is reached, the contract calls VRF to reveal next community card(s).

### 2.4 Treasury accounting constraints
- Treasury “assets” are **external assets only**.
- Treasury-held own tokens are **treasury shares** (contra-equity), not assets.
- Rebalancing is **accretive-only**, enforced on-chain.

---

## 3) Roles and Authorization

### 3.1 Roles
- **Spectator**: no wallet required, read-only public table view.
- **Trader**: wallet-connected, can trade agent tokens via in-app nad.fun widget.
- **Agent Owner**: wallet that owns the agent seat (and controls owner-only view).
- **Operator**: wallet allowed to submit actions for a seat (bot key). Can be the owner or a separate address.
- **Keeper**: anyone/bot that advances the game (timeouts, finalize, VRF retries).
- **Admin/Risk Manager**: privileged role (multisig recommended) for emergency pause and parameter changes.

### 3.2 On-chain source of truth
Authorization is derived from:
- `PlayerRegistry` mapping `agentToken => {vault, table, owner, operator, metaURI, riskProfile}`.
- `PokerTable` seat configuration, if needed.

No centralized “user database” should be required for ownership checks.

---

## 4) System Architecture

## 4.1 On-chain contracts (MVP set)
1) **PlayerRegistry**
    - Registers an agent token with its vault, table, owner, operator.
    - Emits events for indexing.
    - Acts as the canonical mapping for “who is the owner”.

2) **PokerTable**
    - Implements hand lifecycle and betting.
    - Enforces:
        - 30-minute action deadline
        - one action per block per table
        - VRF request on betting-round completion
    - Emits rich events for indexing and UI.

3) **VRFAdapter**
    - Pluggable adapter for a VRF provider supported in the chain ecosystem.
    - Exposes `requestRandomness(purpose)` and receives callbacks.

4) **PlayerVault**
    - Holds external assets and interacts with table (buy-in/escrow, settlement transfers).
    - Computes NAV per share and emits snapshots.
    - Executes per-hand treasury rebalancing on nad.fun routers under strict accretive-only constraints.

Optional:
5) **KeeperIncentives**
    - Pays small fees to callers of `forceTimeout`, `finalizeHand`, `reRequestVRF` to keep the system liveness-friendly.

## 4.2 Off-chain services/bots
1) **AgentBot**
    - Submits actions as the `operator`.
    - Reads public table state + its own hole cards (via OwnerView/Dealer service).
    - MVP strategy can be minimal: legal actions + simple heuristics.

2) **KeeperBot**
    - Ensures liveness: calls `forceTimeout`, `finalizeHand`, `reRequestVRF`.
    - Triggers treasury rebalancing *only when allowed*.

3) **Indexer**
    - Subscribes to chain events and stores them into a DB.
    - Provides:
        - public REST API
        - WebSocket for real-time table updates
        - leaderboard computations.

4) **OwnerView / Dealer Service** (critical)
    - Provides owner-only hole cards.
    - Uses wallet-signature auth.
    - Enforces seat-owner ACL so only the correct owner can fetch hole cards.
    - (MVP) Can also be the dealer that generates hole cards for each seat per hand.

5) **Web App**
    - Public spectating pages
    - Owner pages (hole cards)
    - In-app nad.fun trading widget (quote + buy/sell)

---

## 5) Poker Protocol Specification (MVP)

### 5.1 Game format
Start with a coherent simplified format that is feasible on-chain:

- 2-player heads-up Hold’em-like structure
- Fixed blinds
- Betting rounds: preflop → flop → turn → river
- Showdown requires hole card reveal (or fold ends earlier)
- If needed for MVP, skip side pots (heads-up has none)

### 5.2 State machine
Suggested states:
- `WAITING_FOR_SEATS`
- `HAND_INIT`
- `WAITING_FOR_HOLECARDS` (dealer provides hole cards off-chain + commit on-chain)
- `BETTING_PRE`
- `WAITING_VRF_FLOP`
- `BETTING_FLOP`
- `WAITING_VRF_TURN`
- `BETTING_TURN`
- `WAITING_VRF_RIVER`
- `BETTING_RIVER`
- `SHOWDOWN`
- `SETTLED`

### 5.3 Turn timeout (30 minutes)
- After each action: `actionDeadline = block.timestamp + 30 minutes`
- If `block.timestamp > actionDeadline`, any address may call `forceTimeout()`:
    - If a check is legal: auto-check
    - Otherwise: auto-fold

### 5.4 One action per block per table
- Store `lastActionBlock`.
- In any action handler: `require(block.number > lastActionBlock)`.
- Update `lastActionBlock = block.number` after action is accepted.

### 5.5 Betting-round completion triggers VRF
At the end of the action handler, check if the betting round is complete (“no more bet”):
- All active players have matched `currentBet` and no pending action remains.
- If complete:
    - transition to `WAITING_VRF_{NEXT}` and call `requestVRF(nextStreet)` **within the same transaction**.
- When VRF callback arrives:
    - update community cards for that street
    - transition to the next betting round.

### 5.6 Settlement
A hand ends via:
- Fold: immediate winner
- Showdown: require both players to reveal hole cards (or a dealer reveals) and verify commits, then compute winner and distribute pot.

Settlement emits:
- `HandSettled(handId, winnerSeat, potAmount, ...)`

---

## 6) Owner-only Hole Cards (Security Model)

### 6.1 Requirements
- Owner can see their seat’s hole cards in real time.
- Public cannot see hole cards before showdown.
- Hole cards are not stored in plaintext on-chain pre-showdown.
- There must be a verifiable link between what owner saw and what is revealed at showdown (commit/reveal).

### 6.2 MVP approach: Dealer + Commit/Reveal + OwnerView ACL
**Dealer/OwnerView Service** generates hole cards and stores them privately.

Flow per hand:
1) Dealer generates hole cards for each seat (ensures no duplicates).
2) Dealer stores `(handId, seatId, holeCards, salt)` encrypted-at-rest (or at minimum isolated + access-controlled).
3) On-chain `PokerTable` stores only commitments:
    - `holeCommit[handId][seatId] = keccak256(handId, seatId, holeCards, salt)`
4) Owner UI:
    - owner wallet signs a challenge
    - OwnerView verifies seat ownership (via PlayerRegistry/Table)
    - returns the hole cards for that seat only
5) At showdown:
    - dealer (or operator/owner) reveals `(holeCards, salt)`
    - on-chain verifies commitment matches
    - then hole cards can be publicly displayed as part of the outcome.

### 6.3 Trust and upgrades
MVP includes trust in the dealer for fair dealing, but commit/reveal provides *post-hoc integrity*.
P1 upgrades can reduce dealer cheating by:
- mixing VRF seed + dealer pre-commit + deterministic shuffle, audited after the hand.

### 6.4 Attack surface to explicitly block
- OwnerView must never allow fetching hole cards for a different seat.
- No hole cards in logs, query params, public JSON, websocket streams, or analytics events.

---

## 7) Treasury Accounting and Non-Dilutive (Accretive-only) Rebalancing

### 7.1 Definitions
Let:
- `A` = external assets of the vault (MON/WMON/AUSD + claimable escrow − payables)
- `T` = total token supply (agent token)
- `B` = vault balance of its own token (treasury shares)
- `N` = outstanding shares = `T − B`
- `P` = NAV per share = `A / N`

**Key rule:** `B` is NOT an asset. It only reduces `N`.

### 7.2 Accretive-only constraints (must be enforced on-chain)
Rebalancing uses nad.fun AMM to trade:
- Buy (treasury buys its token using MON): increases `B`, decreases `A`, decreases `N`.
- Sell (treasury sells its token for MON): decreases `B`, increases `A`, increases `N`.

To ensure **no value is transferred away from existing holders**, require:
- For a buy: execution price `q_buy <= P`
- For a sell: execution price `q_sell >= P`

Where:
- `q_buy = monIn / tokenOut`
- `q_sell = monOut / tokenIn`

If these conditions are not met, the transaction must revert.

### 7.3 “Per-hand only” execution policy
- Rebalancing is allowed only after `HandSettled` is recorded.
- At most once per hand (or a configurable small number).
- Use a short randomized delay (block-based) derived from the VRF output to reduce predictability.

### 7.4 Size limits
Per hand, cap rebalancing size:
- `rebalanceMaxMonBps` of `A` for buys
- `rebalanceMaxTokenBps` of `B` for sells

### 7.5 Interaction with nad.fun stages
nad.fun tokens may be:
- bonding curve stage
- locked stage (temporary)
- graduated stage (DEX)

Vault and UI must query nad.fun Lens (or equivalent) to determine stage and router selection.
If locked/untradeable, skip or queue (MVP: skip).

---

## 8) In-app nad.fun Trading (Web App)

### 8.1 UI capabilities
On agent token page:
- show stage (bonding curve / locked / graduated)
- quote buy/sell for user input
- execute buy/sell via wallet transactions
- slippage and deadline controls
- display errors clearly
- fallback button: “Open on nad.fun”

### 8.2 Implementation rules
- Do not hardcode routers. Use a chain config file for Lens and router addresses per network.
- Use Lens to obtain:
    - which router to call (bonding curve vs DEX)
    - amount out / amount in estimates
    - progress/stage information

(Exact ABI function names may vary; implementation must follow the official nad.fun Lens/Router contracts for the target network.)

---

## 9) Indexing, APIs, Real-time Updates

### 9.1 Indexer responsibilities
- Subscribe to contract events:
    - table actions and state
    - VRF requests/fulfills
    - hand settlements
    - vault snapshots and rebalancing events
    - registry updates
- Maintain DB tables for:
    - tables, hands, actions
    - agent profiles
    - vault snapshots
    - leaderboard aggregates

### 9.2 Public APIs (suggested)
- `GET /tables`
- `GET /tables/:id`
- `GET /agents`
- `GET /agents/:token`
- `GET /leaderboard?metric=roi&period=7d`
- WebSocket: `/ws/tables/:id`

### 9.3 OwnerView APIs (suggested)
- `GET /auth/nonce`
- `POST /auth/verify` (signature verification)
- `GET /owner/holecards?tableId=&handId=` (owner-only)

---

## 10) Web App UX Requirements

### 10.1 Public pages
- Lobby (`/`): live tables list, filter by activity and top agents.
- Table Viewer (`/table/:id`):
    - community cards, pot, current bet
    - seat panels: stack, status, last action
    - action log with timestamps and block numbers
    - next actor + countdown timer (30 min)
    - VRF status widget
    - settlement results and replay
- Agent Page (`/agent/:token`):
    - A/B/N/P
    - recent PnL
    - rebalancing history
    - in-app nad.fun trading widget
- Leaderboard (`/leaderboard`):
    - ROI, cumulative PnL, winrate, MDD
    - time ranges: 24h / 7d / 30d / all

### 10.2 Owner pages (wallet connected)
- My Agents (`/me`):
    - list owned agents with current table/hand state
- Owner Table View:
    - all public table view data
    - plus hole cards for owner’s seat
    - must never show other seats’ hole cards

---

## 11) Recommended Repo Layout
- `/contracts` (Solidity, Foundry)
- `/apps/web` (Next.js + TS)
- `/services/indexer` (Node/TS + Postgres + WS)
- `/services/ownerview` (Node/TS + wallet-sign auth + ACL + hole card store)
- `/bots/agent` (Node/TS)
- `/bots/keeper` (Node/TS)
- `/packages/shared` (types, config, ABI loading, utilities)

---

## 12) Milestones (high-level)
- M0: repo scaffolding + config system
- M1: PokerTable MVP (timeouts, one-action-per-block, VRF streets, settlement)
- M2: Owner hole cards MVP (OwnerView auth + ACL + dealer + commit/reveal)
- M3: Indexer + real-time Table Viewer + leaderboard
- M4: Web app public/owner pages
- M5: In-app nad.fun trading widget
- M6: Vault + per-hand accretive-only rebalancing
- M7: bots + end-to-end demo script

---

## 13) Definition of Done (global)
A ticket is DONE only if:
- code is implemented
- test or reproducible run steps exist
- security/authorization checks are explicitly validated (especially hole card ACL)
- UI or API shows the expected state
- TICKET.md updated with notes and verification steps

---

## 14) Public Repo Notes (hackathon-safe)
- Avoid “equity/dividend/guaranteed return” language in UI copy.
- Frame tokens as experimental agent-associated assets.
- Ensure no private data is committed (keys, salts, hole cards, DB dumps).
