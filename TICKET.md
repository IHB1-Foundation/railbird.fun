# TICKET.md — Public Execution Plan (Sequential Tickets)

## Status legend
- [ ] TODO
- [~] IN PROGRESS
- [x] DONE

## Rules
- Execute tickets strictly top-to-bottom.
- One ticket at a time.
- A ticket is DONE only if its Acceptance Criteria are satisfied.
- When completing a ticket, append:
    1) Key files changed
    2) How to run/tests
    3) How to manually verify (demo steps)

---

# M0 — Scaffolding & Config

## T-0001 Monorepo scaffolding + basic tooling
- Status: [x] DONE
- Goal: Create repo layout and build commands.
- Tasks:
    - Create folders: `/contracts`, `/apps/web`, `/services/indexer`, `/services/ownerview`, `/bots/agent`, `/bots/keeper`, `/packages/shared`
    - Basic package manager setup (pnpm recommended)
    - TS base config shared
    - (Optional) Docker compose for local Postgres
    - Minimal README with commands
- Acceptance:
    - `pnpm -r install` and `pnpm -r build` (or equivalent) succeeds
    - Each package has a minimal `package.json` and build script

### DONE Notes (T-0001)
**Key files changed:**
- `package.json` - root workspace config
- `pnpm-workspace.yaml` - workspace definitions
- `tsconfig.base.json` - shared TypeScript config
- `README.md` - project overview and commands
- `packages/shared/` - shared types package with build
- `services/indexer/` - indexer service scaffold
- `services/ownerview/` - ownerview service scaffold
- `bots/agent/` - agent bot scaffold
- `bots/keeper/` - keeper bot scaffold
- `apps/web/` - web app scaffold
- `contracts/` - Foundry project scaffold

**How to run/test:**
```bash
pnpm install      # installs all workspace dependencies
pnpm build        # builds all packages (TS compilation + forge build)
```

**Manual verification:**
1. Run `pnpm install` - should complete without errors
2. Run `pnpm build` - all 7 packages should build successfully
3. Check `packages/shared/dist/index.js` exists after build
4. Check `services/indexer/dist/index.js` exists after build

## T-0002 Chain config + ABI/address injection system
- Status: [ ] TODO
- Depends on: T-0001
- Goal: No hardcoded chain addresses/ABIs across codebase.
- Tasks:
    - Implement `/packages/shared/src/chainConfig.ts`
    - Support environments: local / testnet / mainnet (even if only testnet used now)
    - Provide env template `.env.example`
    - Web/services import from shared config
- Acceptance:
    - Web and services can read Lens/router addresses from config
    - Missing config throws clear errors

---

# M1 — PokerTable MVP (Public spectating foundation)

## T-0101 PokerTable contract: seats, stacks, pot, actions (P0)
- Status: [ ] TODO
- Depends on: T-0001
- Goal: Table core state with events suitable for indexing.
- Tasks:
    - Implement seat registration (MVP: 2 seats)
    - Implement stack accounting, blinds, pot accounting
    - Emit events:
        - `SeatUpdated`, `PotUpdated`, `ActionTaken`, `HandStarted`
- Acceptance:
    - Foundry tests can start a hand and process at least one action
    - Events contain enough data to render public table view

## T-0102 Turn deadline (30 minutes) + forceTimeout (P0)
- Status: [ ] TODO
- Depends on: T-0101
- Goal: Enforce timed turns and allow public advancement.
- Tasks:
    - Maintain `actionDeadline`
    - Reject actions after deadline
    - Implement `forceTimeout()`:
        - if check is legal => auto-check
        - else => auto-fold
- Acceptance:
    - Tests prove late actions revert
    - Tests prove `forceTimeout()` advances state correctly

## T-0103 One action per block per table (P0)
- Status: [ ] TODO
- Depends on: T-0101
- Goal: Prevent multiple actions in same block for the same table.
- Tasks:
    - Add `lastActionBlock`
    - Action handlers require `block.number > lastActionBlock`
- Acceptance:
    - Tests attempt two actions in same block: second reverts

## T-0104 Betting-round completion => VRF request (P0)
- Status: [ ] TODO
- Depends on: T-0101, T-0102, T-0103
- Goal: On “no more bets” completion, request VRF for next street.
- Tasks:
    - Implement minimal betting-round completion check
    - In the SAME TX as final action, emit `VRFRequested(street, handId)` and call adapter
    - Add placeholder/mock fulfill function in adapter for local tests
- Acceptance:
    - Tests show: final action triggers VRF request event in same tx
    - Fulfill updates community card state and transitions to next betting round

## T-0105 Hand end + settlement event (P0)
- Status: [ ] TODO
- Depends on: T-0101..T-0104
- Goal: End a hand (fold or showdown stub) and distribute pot.
- Tasks:
    - Fold-to-win path fully implemented
    - Showdown can be simplified initially (but must emit settlement)
    - Emit `HandSettled(handId, winnerSeat, potAmount, ...)`
- Acceptance:
    - Tests prove a fold ends the hand and transfers pot to winner stack
    - Settlement event emitted and indexable

---

# M2 — Owner-only Hole Cards (OwnerView + Dealer + Commit/Reveal)

## T-0201 OwnerView service: wallet-sign auth session (P0)
- Status: [ ] TODO
- Depends on: T-0001
- Goal: Wallet-based “login” without accounts.
- Tasks:
    - `GET /auth/nonce`
    - `POST /auth/verify` (verify signature, issue session token)
- Acceptance:
    - No signature => denied
    - Valid signature => session issued

## T-0202 OwnerView ACL: seatOwner verification + holecard endpoint (P0)
- Status: [ ] TODO
- Depends on: T-0201, PlayerRegistry or Table seat ownership
- Goal: Only the seat owner can fetch their hole cards.
- Tasks:
    - `GET /owner/holecards?tableId=&handId=`
    - On request, verify requester wallet is seat owner (on-chain lookup)
    - Return only that seat’s cards
- Acceptance:
    - Wrong wallet cannot fetch anything
    - Correct wallet fetches hole cards for its seat only

## T-0203 Dealer: per-hand dealing + storage (P0)
- Status: [ ] TODO
- Depends on: T-0202, T-0101
- Goal: Generate hole cards, store privately, and connect to the table lifecycle.
- Tasks:
    - Create a “deal” job triggered at `HandStarted`
    - Generate 2 hole cards per seat without duplicates
    - Store `(handId, seatId, holeCards, salt)`
    - (If possible in P0) create `holeCommit` and submit commit to chain
- Acceptance:
    - Owner UI can retrieve hole cards during the hand
    - Public API never exposes hole cards

## T-0204 Showdown reveal + commit verification (P1)
- Status: [ ] TODO
- Depends on: T-0203, T-0105
- Goal: Make hole cards verifiable at showdown.
- Tasks:
    - Store `holeCommit[handId][seatId]` on-chain
    - Implement `revealHoleCards(handId, seatId, holeCards, salt)` verification
    - Emit `HoleCardsRevealed` after verify
- Acceptance:
    - Reveal with wrong cards/salt fails
    - Reveal with correct data succeeds and becomes public

---

# M3 — Agent Registry + Vault (Accounting Foundation)

## T-0301 PlayerRegistry contract (P0)
- Status: [ ] TODO
- Depends on: T-0001
- Goal: Canonical mapping from agent token to vault/table/owner/operator.
- Tasks:
    - `registerAgent(token, vault, table, owner, operator, metaURI)`
    - `updateOperator(token, newOperator)`
    - Events for indexing
- Acceptance:
    - Services/web can resolve owner/operator via registry
    - Registry events are emitted on changes

## T-0302 PlayerVault contract (P0): escrow/buy-in + settlement integration
- Status: [ ] TODO
- Depends on: T-0301, T-0105
- Goal: Vault holds external assets and participates in table settlement.
- Tasks:
    - Hold external assets (MVP: MON/WMON)
    - Provide buy-in to table (deposit) and receive settlement transfers
    - Emit `VaultSnapshot(A,B,N,P)` after each settlement
- Acceptance:
    - After a hand settles, vault balances reflect the outcome
    - Snapshot event emitted

## T-0303 Accounting functions: A/B/N/P + reproducibility
- Status: [ ] TODO
- Depends on: T-0302
- Goal: Standardize NAV computation for UI/leaderboard.
- Tasks:
    - `getExternalAssets()`
    - `getOutstandingShares()`
    - `getNavPerShare()`
    - Event schema documented and stable
- Acceptance:
    - Indexer can compute ROI and MDD using only events and on-chain reads

---

# M4 — Indexer + Real-time Spectating + Leaderboard

## T-0401 Indexer service (P0): event ingestion + DB schema + REST
- Status: [ ] TODO
- Depends on: T-0101..T-0105, T-0301..T-0303
- Goal: Persist tables/hands/actions/settlements/snapshots.
- Tasks:
    - Postgres schema
    - Event ingestion with idempotency
    - REST endpoints:
        - `/tables`, `/tables/:id`, `/agents`, `/agents/:token`
- Acceptance:
    - Endpoints return correct data from chain events

## T-0402 WebSocket streaming for table updates (P0)
- Status: [ ] TODO
- Depends on: T-0401
- Goal: Public UI can update in real time.
- Tasks:
    - `/ws/tables/:id` stream
    - Push updates on new actions/VRF/settlement
- Acceptance:
    - Table Viewer reflects actions without refresh

## T-0403 Leaderboard computations (P0)
- Status: [ ] TODO
- Depends on: T-0401, T-0303
- Goal: ROI, cumulative PnL, winrate, MDD with time filters.
- Tasks:
    - API: `/leaderboard?metric=&period=`
    - Implement time windows: 24h/7d/30d/all
- Acceptance:
    - Leaderboard returns plausible values for at least 4 metrics

---

# M5 — Web App (Public/Owner) + In-app nad.fun Trading

## T-0501 Public web app pages (P0)
- Status: [ ] TODO
- Depends on: T-0401..T-0403
- Goal: Public lobby, table viewer, agent page, leaderboard.
- Acceptance:
    - Lobby loads without wallet
    - Table viewer shows real-time public state
    - Agent page shows accounting snapshots and history
    - Leaderboard tabs render correctly

## T-0502 Owner web pages + hole cards (P0)
- Status: [ ] TODO
- Depends on: T-0201..T-0202, T-0501
- Goal: Owner can see their hole cards.
- Tasks:
    - Wallet signature login flow
    - `/me` page shows owned agents (registry-based)
    - Owner table view calls OwnerView API and renders hole cards
- Acceptance:
    - Owner sees hole cards
    - Non-owner cannot access hole cards

## T-0503 In-app nad.fun trading widget (P0)
- Status: [ ] TODO
- Depends on: T-0002, T-0501
- Goal: Quote + execute buy/sell in our UI.
- Tasks:
    - Query Lens for routing and quotes
    - Execute buy/sell via router contracts
    - Slippage + deadline controls
    - Display token stage (bonding/locked/graduated)
    - Provide fallback “Open on nad.fun”
- Acceptance:
    - On testnet, at least one successful buy and one successful sell
    - UI reflects stage changes correctly (where available)

---

# M6 — Vault Treasury Rebalancing (Per-hand, Accretive-only)

## T-0601 Accretive-only rebalancing (P1)
- Status: [ ] TODO
- Depends on: T-0302, T-0105, T-0503
- Goal: Vault can buy/sell its own token without diluting existing holders.
- Tasks:
    - Only callable after `HandSettled`
    - At most once per hand
    - Enforce:
        - buy: q_buy <= P (revert otherwise)
        - sell: q_sell >= P (revert otherwise)
    - Use quote-derived `amountOutMin` to enforce execution price constraint
    - Size caps per hand
- Acceptance:
    - Tests: violating constraints reverts
    - Tests: successful rebalance yields P_after >= P_before

## T-0602 Randomized delay window (P1)
- Status: [ ] TODO
- Depends on: T-0601, T-0104
- Goal: Reduce predictability of rebalancing execution.
- Tasks:
    - After settlement, set `eligibleBlock = current + (vrfRand % R)`
    - Only allow rebalance after `eligibleBlock`
- Acceptance:
    - Attempt before eligibleBlock fails
    - After eligibleBlock succeeds (when constraints hold)

---

# M7 — Bots + End-to-end Demo

## T-0701 AgentBot (P0)
- Status: [ ] TODO
- Depends on: M1 + hole card retrieval method
- Goal: Keep the game running with valid actions.
- Tasks:
    - Connect as operator
    - Fetch public state + its own hole cards (OwnerView)
    - Submit legal actions quickly (avoid timeouts)
- Acceptance:
    - Runs 50+ hands without manual intervention

## T-0702 KeeperBot (P0)
- Status: [ ] TODO
- Depends on: M1, M6
- Goal: Liveness and automation.
- Tasks:
    - Detect deadlines and call `forceTimeout`
    - VRF retries if needed
    - Finalize hands
    - Trigger rebalance when allowed
- Acceptance:
    - With KeeperBot only, table does not stall

---

# M8 — Docs + Hackathon Packaging

## T-0801 Ops docs (P0)
- Status: [ ] TODO
- Depends on: overall
- Goal: Anyone can run the full stack following docs.
- Acceptance:
    - End-to-end run from docs succeeds on a fresh machine (reasonable assumptions)

## T-0802 Demo script + submission checklist (P0)
- Status: [ ] TODO
- Depends on: M1..M7
- Goal: Repeatable demo flow:
    - spectate → owner hole cards → settlement → leaderboard update → in-app trade
- Acceptance:
    - Demo flow reproducible at least once without patching code

---
