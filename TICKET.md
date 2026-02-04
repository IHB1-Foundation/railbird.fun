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
- Status: [x] DONE
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

### DONE Notes (T-0002)
**Key files changed:**
- `packages/shared/src/types.ts` - TypeScript types for ChainEnv, Address, ContractAddresses, ChainConfig
- `packages/shared/src/chainConfig.ts` - Config loading with validation and caching
- `packages/shared/src/index.ts` - Re-exports config functions and types
- `packages/shared/src/chainConfig.test.ts` - 12 unit tests for config loading
- `packages/shared/package.json` - Added test script and tsx dependency
- `.env.example` - Environment template with all required variables

**How to run/test:**
```bash
pnpm install               # Install dependencies
pnpm build                 # Build all packages
cd packages/shared && pnpm test  # Run 12 config tests
```

**Manual verification:**
1. Run `pnpm test` in packages/shared - all 12 tests pass
2. Try importing config in another package:
   ```ts
   import { getChainConfig, validateChainConfigEnv } from "@playerco/shared";
   ```
3. Without env vars set, `getChainConfig()` throws ChainConfigError with clear message
4. With all env vars set, `getChainConfig()` returns full config object

**Supported env vars:**
- CHAIN_ENV (local/testnet/mainnet)
- RPC_URL
- POKER_TABLE_ADDRESS, PLAYER_REGISTRY_ADDRESS, PLAYER_VAULT_ADDRESS, VRF_ADAPTER_ADDRESS
- NADFUN_LENS_ADDRESS, NADFUN_BONDING_ROUTER_ADDRESS, NADFUN_DEX_ROUTER_ADDRESS
- WMON_ADDRESS

---

# M1 — PokerTable MVP (Public spectating foundation)

## T-0101 PokerTable contract: seats, stacks, pot, actions (P0)
- Status: [x] DONE
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

### DONE Notes (T-0101)
**Key files changed:**
- `contracts/src/PokerTable.sol` - Main poker table contract with full game state machine
- `contracts/test/PokerTable.t.sol` - 23 comprehensive Foundry tests
- `contracts/lib/forge-std/` - Added forge-std dependency

**How to run/test:**
```bash
cd contracts && forge test -vv  # Runs 23 tests, all pass
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 23 tests should pass
2. Key tests demonstrate:
   - Seat registration with owner/operator separation
   - Hand start with blind posting
   - All action types (fold, check, call, raise)
   - Betting round completion triggering VRF request
   - Full hand lifecycle to showdown/settlement

**Contract features:**
- 2-seat heads-up Hold'em structure
- State machine: WAITING_FOR_SEATS → HAND_INIT → BETTING_PRE → VRF → BETTING_FLOP → ... → SHOWDOWN → SETTLED
- Events: SeatUpdated, HandStarted, ActionTaken, PotUpdated, BettingRoundComplete, VRFRequested, HandSettled
- 30-minute action timeout (constant, T-0102 will add enforcement)
- One action per block tracking (lastActionBlock, T-0103 will add enforcement in tests)
- Actor turn validation and authorization checks

## T-0102 Turn deadline (30 minutes) + forceTimeout (P0)
- Status: [x] DONE
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

### DONE Notes (T-0102)
**Key files changed:**
- `contracts/src/PokerTable.sol` - Added `forceTimeout()` function and `ForceTimeout` event
- `contracts/test/PokerTable.t.sol` - Added 7 new tests for timeout enforcement

**How to run/test:**
```bash
cd contracts && forge test -vv   # Runs all 30 tests, all pass
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 30 tests pass
2. Key timeout tests demonstrate:
   - `test_Action_RevertAfterDeadline`: Actions revert after 30-minute deadline
   - `test_ForceTimeout_RevertIfDeadlineNotPassed`: Cannot force timeout early
   - `test_ForceTimeout_AutoFoldWhenMustCall`: Auto-folds when player owes money
   - `test_ForceTimeout_AutoCheckWhenLegal`: Auto-checks when bets are matched
   - `test_ForceTimeout_MultipleTimeoutsToShowdown`: Multiple forced timeouts work
   - `test_ForceTimeout_RevertIfNotInBettingState`: Cannot timeout outside betting

**Contract changes:**
- Added `ForceTimeout(handId, seatIndex, forcedAction)` event
- Added `forceTimeout()` function callable by anyone after deadline
- Uses existing `inBettingState` and `oneActionPerBlock` modifiers
- Auto-check if `seats[actor].currentBet == currentHand.currentBet`, else auto-fold

## T-0103 One action per block per table (P0)
- Status: [x] DONE
- Depends on: T-0101
- Goal: Prevent multiple actions in same block for the same table.
- Tasks:
    - Add `lastActionBlock`
    - Action handlers require `block.number > lastActionBlock`
- Acceptance:
    - Tests attempt two actions in same block: second reverts

### DONE Notes (T-0103)
**Key files changed:**
- `contracts/test/PokerTable.t.sol` - Added 6 new tests for one-action-per-block enforcement

**How to run/test:**
```bash
cd contracts && forge test -vv   # Runs all 36 tests, all pass
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 36 tests pass
2. Key one-action-per-block tests demonstrate:
   - `test_OneActionPerBlock_SecondActionReverts`: Second action in same block reverts with "One action per block"
   - `test_OneActionPerBlock_FoldThenActionReverts`: Even fold followed by opponent action in same block reverts
   - `test_OneActionPerBlock_RaiseThenActionReverts`: Raise followed by call in same block reverts
   - `test_OneActionPerBlock_SucceedsAfterBlockAdvance`: After `vm.roll(block.number + 1)`, next action succeeds
   - `test_OneActionPerBlock_ForceTimeoutRespects`: forceTimeout also respects the one-action-per-block rule
   - `test_OneActionPerBlock_StartHandSetsLastActionBlock`: startHand sets lastActionBlock, so action in same block reverts

**Contract features (already implemented in T-0101):**
- `lastActionBlock` state variable (line 119)
- `oneActionPerBlock` modifier requires `block.number > lastActionBlock` (lines 154-158)
- Modifier applied to: fold, check, call, raise, forceTimeout
- `_recordAction()` updates `lastActionBlock = block.number` (line 463)

## T-0104 Betting-round completion => VRF request (P0)
- Status: [x] DONE
- Depends on: T-0101, T-0102, T-0103
- Goal: On "no more bets" completion, request VRF for next street.
- Tasks:
    - Implement minimal betting-round completion check
    - In the SAME TX as final action, emit `VRFRequested(street, handId)` and call adapter
    - Add placeholder/mock fulfill function in adapter for local tests
- Acceptance:
    - Tests show: final action triggers VRF request event in same tx
    - Fulfill updates community card state and transitions to next betting round

### DONE Notes (T-0104)
**Key files changed:**
- `contracts/src/interfaces/IVRFAdapter.sol` - VRF adapter interface
- `contracts/src/mocks/MockVRFAdapter.sol` - Mock VRF adapter for testing
- `contracts/src/PokerTable.sol` - Added community cards, VRF integration
- `contracts/test/PokerTable.t.sol` - Added 6 VRF tests, updated existing tests

**How to run/test:**
```bash
cd contracts && forge test -vv   # Runs all 42 tests, all pass
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 42 tests pass
2. Key VRF tests demonstrate:
   - `test_VRF_RequestInSameTxAsFinalAction`: VRF request emitted in same tx as betting round completion
   - `test_VRF_FlopDealsCommunityCards`: Flop deals 3 cards
   - `test_VRF_TurnDealsSingleCard`: Turn deals 1 card
   - `test_VRF_RiverDealsFinalCard`: River deals final card
   - `test_VRF_CommunityCardsResetOnNewHand`: Cards reset to 255 on new hand
   - `test_VRF_CardsDerivedDeterministically`: Same randomness = same cards

**Contract changes:**
- Added `communityCards[5]` storage (0-51 = card, 255 = undealt)
- Added `pendingVRFRequestId` to track pending requests
- Added `IVRFAdapter` interface with `requestRandomness(tableId, handId, purpose)`
- `_completeBettingRound()` now calls VRF adapter in same tx
- `fulfillVRF(requestId, randomness)` derives community cards from randomness
- Added `CommunityCardsDealt` event
- Added `getCommunityCards()` view function

## T-0105 Hand end + settlement event (P0)
- Status: [x] DONE
- Depends on: T-0101..T-0104
- Goal: End a hand (fold or showdown stub) and distribute pot.
- Tasks:
    - Fold-to-win path fully implemented
    - Showdown can be simplified initially (but must emit settlement)
    - Emit `HandSettled(handId, winnerSeat, potAmount, ...)`
- Acceptance:
    - Tests prove a fold ends the hand and transfers pot to winner stack
    - Settlement event emitted and indexable

### DONE Notes (T-0105)
**Key files changed:**
- `contracts/test/PokerTable.t.sol` - Added 8 comprehensive settlement tests

**How to run/test:**
```bash
cd contracts && forge test -vv   # Runs all 50 tests, all pass
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 50 tests pass
2. Key settlement tests demonstrate:
   - `test_Settlement_FoldTransfersPotToWinner`: Fold correctly transfers pot to winner
   - `test_Settlement_FoldEmitsCorrectEvent`: HandSettled event emitted with correct params
   - `test_Settlement_ShowdownDistributesPot`: Showdown distributes accumulated pot
   - `test_Settlement_ShowdownEmitsEvent`: HandSettled event emitted at showdown
   - `test_Settlement_PotAccumulatesFromRaises`: Pot correctly accumulates from betting
   - `test_Settlement_ButtonMovesAfterHand`: Button position alternates between hands
   - `test_Settlement_StateTransitionsToSettled`: State correctly becomes SETTLED
   - `test_Settlement_CanStartNewHandAfterSettlement`: New hand can start after settlement

**Contract features (already implemented):**
- `fold()` ends hand immediately, opponent wins pot
- `_settleHand(winnerSeat)` transfers pot and emits `HandSettled`
- `settleShowdown(winnerSeat)` handles showdown settlement
- Button moves after each hand
- State transitions to SETTLED, allowing next hand

---

# M2 — Owner-only Hole Cards (OwnerView + Dealer + Commit/Reveal)

## T-0201 OwnerView service: wallet-sign auth session (P0)
- Status: [x] DONE
- Depends on: T-0001
- Goal: Wallet-based "login" without accounts.
- Tasks:
    - `GET /auth/nonce`
    - `POST /auth/verify` (verify signature, issue session token)
- Acceptance:
    - No signature => denied
    - Valid signature => session issued

### DONE Notes (T-0201)
**Key files changed:**
- `services/ownerview/src/auth/` - Auth module (types, nonceStore, session, authService)
- `services/ownerview/src/routes/auth.ts` - Express routes for /auth/nonce and /auth/verify
- `services/ownerview/src/app.ts` - Express app setup
- `services/ownerview/src/index.ts` - Server entry point
- `services/ownerview/package.json` - Added express, jose, viem dependencies

**How to run/test:**
```bash
pnpm install
cd services/ownerview && pnpm test   # Runs 28 tests
pnpm build                            # Builds all packages
JWT_SECRET=<32+ chars> pnpm start     # Starts server on port 3001
```

**Manual verification:**
1. Start server: `JWT_SECRET=your-secret-32-characters-minimum PORT=3001 node dist/index.js`
2. Get nonce: `curl "http://localhost:3001/auth/nonce?address=0x1234..."`
3. Sign the returned message with a wallet
4. Verify: `curl -X POST http://localhost:3001/auth/verify -H "Content-Type: application/json" -d '{"address":"0x...", "nonce":"...", "signature":"0x..."}'`
5. Receive JWT token on success, error on invalid signature

**Auth flow:**
1. Client requests nonce with wallet address
2. Server returns nonce + message to sign
3. Client signs message with wallet
4. Client submits address + nonce + signature
5. Server verifies signature, issues JWT session token (24h expiry)

## T-0202 OwnerView ACL: seatOwner verification + holecard endpoint (P0)
- Status: [x] DONE
- Depends on: T-0201, PlayerRegistry or Table seat ownership
- Goal: Only the seat owner can fetch their hole cards.
- Tasks:
    - `GET /owner/holecards?tableId=&handId=`
    - On request, verify requester wallet is seat owner (on-chain lookup)
    - Return only that seat's cards
- Acceptance:
    - Wrong wallet cannot fetch anything
    - Correct wallet fetches hole cards for its seat only

### DONE Notes (T-0202)
**Key files changed:**
- `services/ownerview/src/middleware/auth.ts` - JWT auth middleware for session verification
- `services/ownerview/src/chain/chainService.ts` - On-chain seat ownership lookup via PokerTable
- `services/ownerview/src/chain/pokerTableAbi.ts` - Minimal ABI for PokerTable contract
- `services/ownerview/src/holecards/holeCardStore.ts` - In-memory hole card storage
- `services/ownerview/src/routes/owner.ts` - GET /owner/holecards endpoint with ACL
- `services/ownerview/src/app.ts` - Updated to include new services and routes

**How to run/test:**
```bash
pnpm install
pnpm build
cd services/ownerview && pnpm test   # Runs 55 tests, all pass
```

**Manual verification:**
1. Start server with chain config:
   ```bash
   JWT_SECRET=your-secret-32-chars RPC_URL=http://localhost:8545 POKER_TABLE_ADDRESS=0x... node dist/index.js
   ```
2. Authenticate: GET /auth/nonce, sign, POST /auth/verify -> get JWT token
3. Request hole cards: `curl -H "Authorization: Bearer <token>" "http://localhost:3001/owner/holecards?tableId=1&handId=1"`
4. Non-owner returns 403 "NOT_SEAT_OWNER"
5. Owner returns their seat's cards only (never salt/commitment)

**Security validations:**
- OwnerView hole card endpoint denies non-owners (403)
- Ownership determined by on-chain lookup, not request params
- Salt and commitment never exposed in API response
- Case-insensitive address matching

## T-0203 Dealer: per-hand dealing + storage (P0)
- Status: [x] DONE
- Depends on: T-0202, T-0101
- Goal: Generate hole cards, store privately, and connect to the table lifecycle.
- Tasks:
    - Create a "deal" job triggered at `HandStarted`
    - Generate 2 hole cards per seat without duplicates
    - Store `(handId, seatId, holeCards, salt)`
    - (If possible in P0) create `holeCommit` and submit commit to chain
- Acceptance:
    - Owner UI can retrieve hole cards during the hand
    - Public API never exposes hole cards

### DONE Notes (T-0203)
**Key files changed:**
- `services/ownerview/src/dealer/types.ts` - Types for dealer service
- `services/ownerview/src/dealer/cardGenerator.ts` - Card generation with crypto-secure randomness
- `services/ownerview/src/dealer/dealerService.ts` - Main dealer service for dealing + storage
- `services/ownerview/src/dealer/eventListener.ts` - HandStarted event listener for automatic dealing
- `services/ownerview/src/dealer/index.ts` - Module exports
- `services/ownerview/src/dealer/dealer.test.ts` - 53 tests for dealer functionality
- `services/ownerview/src/routes/dealer.ts` - API routes: POST /dealer/deal, GET /dealer/commitments, GET /dealer/reveal
- `services/ownerview/src/routes/dealer.test.ts` - 9 route tests
- `services/ownerview/src/app.ts` - Integrated dealer service and routes

**How to run/test:**
```bash
pnpm install
pnpm build
cd services/ownerview && pnpm test   # Runs 109 tests, all pass
```

**Manual verification:**
1. Start server: `JWT_SECRET=your-secret-32-chars RPC_URL=http://localhost:8545 POKER_TABLE_ADDRESS=0x... node dist/index.js`
2. Deal cards: `curl -X POST http://localhost:3001/dealer/deal -H "Content-Type: application/json" -d '{"tableId":"1","handId":"1"}'`
3. Response contains commitments only (never cards or salts)
4. Get commitments: `curl "http://localhost:3001/dealer/commitments?tableId=1&handId=1"`
5. Owner can retrieve their cards via `/owner/holecards` (authenticated)
6. Verify cards are unique (4 different cards per hand)

**Security validations:**
- Cards never exposed in /dealer/deal or /dealer/commitments responses
- Only /owner/holecards exposes cards (with seat-owner ACL)
- Cryptographically secure randomness (crypto.randomBytes)
- Deterministic commitments for on-chain verification
- Event listener supports automatic dealing on HandStarted

## T-0204 Showdown reveal + commit verification (P1)
- Status: [x] DONE
- Depends on: T-0203, T-0105
- Goal: Make hole cards verifiable at showdown.
- Tasks:
    - Store `holeCommit[handId][seatId]` on-chain
    - Implement `revealHoleCards(handId, seatId, holeCards, salt)` verification
    - Emit `HoleCardsRevealed` after verify
- Acceptance:
    - Reveal with wrong cards/salt fails
    - Reveal with correct data succeeds and becomes public

### DONE Notes (T-0204)
**Key files changed:**
- `contracts/src/PokerTable.sol` - Added holeCommits mapping, submitHoleCommit(), revealHoleCards(), getRevealedHoleCards(), and HoleCardsRevealed event
- `contracts/test/PokerTable.t.sol` - Added 18 comprehensive tests for commit/reveal functionality
- `services/ownerview/src/dealer/cardGenerator.ts` - Updated to use keccak256 (matching on-chain) with viem's encodePacked
- `services/ownerview/src/dealer/dealerService.ts` - Updated test salt generation to produce valid hex format
- `services/ownerview/src/dealer/dealer.test.ts` - Updated tests for new salt/commitment format

**How to run/test:**
```bash
cd contracts && forge test -vv   # Runs all 68 tests, including 18 new commit/reveal tests
cd services/ownerview && pnpm test   # Runs 109 tests, all pass
pnpm build   # Builds all packages successfully
```

**Manual verification:**
1. Run `forge test -vv --match-contract PokerTableTest` - all 68 tests pass
2. Key commit/reveal tests demonstrate:
   - `test_SubmitHoleCommit_Success`: Commitment submitted and stored on-chain
   - `test_RevealHoleCards_Success`: Correct reveal verifies and emits HoleCardsRevealed
   - `test_RevealHoleCards_RevertWithWrongCards`: Wrong cards fail verification
   - `test_RevealHoleCards_RevertWithWrongSalt`: Wrong salt fails verification
   - `test_FullShowdownWithReveal`: End-to-end showdown with both seats revealing

**Contract features:**
- `holeCommits[handId][seatIndex]` mapping stores commitments on-chain
- `submitHoleCommit(handId, seatIndex, commitment)` for dealer to submit during hand
- `revealHoleCards(handId, seatIndex, card1, card2, salt)` verifies commitment at showdown
- `getRevealedHoleCards(handId, seatIndex)` returns revealed cards (255,255 if not revealed)
- Events: `HoleCommitSubmitted`, `HoleCardsRevealed`

**Security validations:**
- Reveal only allowed at/after SHOWDOWN state (or SETTLED for previous hands)
- Commitment verification uses keccak256(abi.encodePacked(handId, seatIndex, card1, card2, salt))
- Cards validated: 0-51 range, no duplicates
- Double reveal prevented
- Dealer service commitment matches on-chain verification format

---

# M3 — Agent Registry + Vault (Accounting Foundation)

## T-0301 PlayerRegistry contract (P0)
- Status: [x] DONE
- Depends on: T-0001
- Goal: Canonical mapping from agent token to vault/table/owner/operator.
- Tasks:
    - `registerAgent(token, vault, table, owner, operator, metaURI)`
    - `updateOperator(token, newOperator)`
    - Events for indexing
- Acceptance:
    - Services/web can resolve owner/operator via registry
    - Registry events are emitted on changes

### DONE Notes (T-0301)
**Key files changed:**
- `contracts/src/PlayerRegistry.sol` - PlayerRegistry contract with agent registration and lookup
- `contracts/test/PlayerRegistry.t.sol` - 38 comprehensive Foundry tests

**How to run/test:**
```bash
cd contracts && forge test --match-contract PlayerRegistryTest -vv   # Runs all 38 tests
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 106 tests pass (68 PokerTable + 38 PlayerRegistry)
2. Key tests demonstrate:
   - Agent registration with vault/table/owner/operator/metaURI
   - Operator defaults to owner if not specified
   - Only owner can update operator, vault, table, metaURI
   - Ownership transfer works and transfers control
   - Authorization checks (isOwner, isOperator, isAuthorized)
   - Enumeration (getRegisteredCount, getRegisteredTokenAt)

**Contract features:**
- `registerAgent(token, vault, table, owner, operator, metaURI)` - Register new agent
- `updateOperator(token, newOperator)` - Update operator (owner-only)
- `transferOwnership(token, newOwner)` - Transfer agent ownership
- `updateVault/updateTable/updateMetaURI` - Additional update functions
- View functions: `getAgent`, `getOwner`, `getOperator`, `getVault`, `getTable`, `getMetaURI`
- Authorization: `isOwner`, `isOperator`, `isAuthorized`, `isRegistered`
- Enumeration: `getRegisteredCount`, `getRegisteredTokenAt`
- Events: `AgentRegistered`, `OperatorUpdated`, `OwnerUpdated`, `VaultUpdated`, `TableUpdated`, `MetaURIUpdated`

## T-0302 PlayerVault contract (P0): escrow/buy-in + settlement integration
- Status: [x] DONE
- Depends on: T-0301, T-0105
- Goal: Vault holds external assets and participates in table settlement.
- Tasks:
    - Hold external assets (MVP: MON/WMON)
    - Provide buy-in to table (deposit) and receive settlement transfers
    - Emit `VaultSnapshot(A,B,N,P)` after each settlement
- Acceptance:
    - After a hand settles, vault balances reflect the outcome
    - Snapshot event emitted

### DONE Notes (T-0302)
**Key files changed:**
- `contracts/src/interfaces/IPlayerVault.sol` - Interface defining vault operations and events
- `contracts/src/PlayerVault.sol` - PlayerVault contract with escrow, settlement, and NAV accounting
- `contracts/test/PlayerVault.t.sol` - 47 comprehensive Foundry tests

**How to run/test:**
```bash
cd contracts && forge test --match-contract PlayerVaultTest -vv   # Runs all 47 tests
forge test -vv   # Runs all 153 tests (PokerTable + PlayerRegistry + PlayerVault)
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 153 tests pass
2. Key tests demonstrate:
   - Vault holds native MON and tracks external assets (A)
   - Buy-in funding with escrow accounting
   - Settlement callbacks emit VaultSnapshot with A/B/N/P
   - NAV per share (P) correctly computed as A / N
   - Treasury shares (B) reduce outstanding shares (N = T - B)

**Contract features:**
- `deposit()` / `receive()` - Accept native MON deposits
- `withdraw(amount, recipient)` - Owner-only withdrawal (respects escrow)
- `fundBuyIn(table, amount)` - Allocate funds for table buy-in (escrow)
- `releaseEscrow(table, amount)` - Release escrowed funds
- `onSettlement(handId, pnl)` - Callback from authorized tables
- `receiveSettlement(handId)` - Receive settlement payment with snapshot
- `authorizeTable(table)` / `revokeTable(table)` - Table authorization
- View functions: `getExternalAssets()`, `getTreasuryShares()`, `getOutstandingShares()`, `getNavPerShare()`, `getAccountingSnapshot()`
- Events: `VaultSnapshot`, `Deposited`, `Withdrawn`, `BuyInFunded`, `SettlementReceived`

**Accounting model (from PROJECT.md Section 7):**
- A = external assets (vault balance)
- B = treasury shares (vault's own token balance, NOT an asset)
- N = outstanding shares = T - B
- P = NAV per share = A / N (scaled by 1e18)

## T-0303 Accounting functions: A/B/N/P + reproducibility
- Status: [x] DONE
- Depends on: T-0302
- Goal: Standardize NAV computation for UI/leaderboard.
- Tasks:
    - `getExternalAssets()`
    - `getOutstandingShares()`
    - `getNavPerShare()`
    - Event schema documented and stable
- Acceptance:
    - Indexer can compute ROI and MDD using only events and on-chain reads

### DONE Notes (T-0303)
**Key files changed:**
- `contracts/src/interfaces/IPlayerVault.sol` - Added VaultInitialized event, enhanced VaultSnapshot with cumulativePnl, documented event schema for indexers
- `contracts/src/PlayerVault.sol` - Added cumulativePnl/initialNavPerShare/handCount storage, initialize(), getCumulativePnl(), getInitialNavPerShare(), getHandCount(), getFullAccountingData()
- `contracts/test/PlayerVault.t.sol` - Added 13 new tests for accounting reproducibility

**How to run/test:**
```bash
cd contracts && forge test --match-contract PlayerVaultTest -vv   # Runs all 60 tests
forge test -vv   # Runs all 166 tests (PokerTable + PlayerRegistry + PlayerVault)
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 166 tests pass
2. Key accounting tests demonstrate:
   - `test_Initialize_EmitsVaultInitialized`: Baseline NAV emitted for ROI calculation
   - `test_CumulativePnl_TracksNetPnl`: PnL tracked across wins/losses
   - `test_Indexer_CanComputeROI`: ROI = (P_current - P_initial) / P_initial
   - `test_Indexer_CanComputeMDD`: MDD tracked via peak/trough comparison
   - `test_EventSchema_CompleteForIndexer`: All required fields in events

**Event schema for indexers:**
- `VaultInitialized(agentToken, owner, initialAssets, initialNavPerShare)` - Emitted once at vault initialization, marks baseline for ROI
- `VaultSnapshot(handId, A, B, N, P, cumulativePnl)` - Emitted after each settlement

**Indexer algorithms documented in interface:**
- ROI: `(navPerShare - initialNavPerShare) / initialNavPerShare`
- MDD: Track peak P, compute `(peak - current) / peak`, keep max

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
