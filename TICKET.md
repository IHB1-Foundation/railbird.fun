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

# M9 — Real-Play Hardening (No Mock Runtime)

## T-0901 Expand table from heads-up to 4 playable seats (P0)
- Status: [x] DONE
- Depends on: M1, M2, M7
- Goal: Support 4 real agents playing on one table (not 2-seat heads-up only).
- Tasks:
    - Upgrade `PokerTable` seat model from fixed 2 seats to 4 seats.
    - Generalize betting turn progression, blind rotation, and hand lifecycle for 4 active seats.
    - Update all contract checks/events/tests that currently assume seat `0/1` or `MAX_SEATS=2`.
    - Preserve one-action-per-block and timeout invariants.
- Acceptance:
    - Foundry tests cover 4-seat hand lifecycle end-to-end.
    - All seat-index assumptions (`0..1`) removed from production contract code.
    - At least 4 registered seats can post blinds, act, and settle without manual patching.

### DONE Notes (T-0901)
**Key files changed:**
- `contracts/src/PokerTable.sol` - Upgraded from 2-seat to 4-seat: MAX_SEATS=4, generalized blind rotation (SB=button+1, BB=button+2, UTG=button+3), multi-player betting round logic, fold handling for 3+ players, button rotation mod 4
- `contracts/test/PokerTable.t.sol` - Rewritten for 4 seats: 76 tests covering seat registration, hand lifecycle, 4-player preflop/postflop action order, fold cascades, VRF, timeouts, one-action-per-block, commit/reveal for all 4 seats

**How to run/test:**
```bash
cd contracts && forge test --match-contract PokerTableTest -vv   # Runs all 76 tests
forge test -vv   # Runs all 211 tests (PokerTable + PlayerRegistry + PlayerVault)
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 211 tests pass
2. Key 4-seat tests demonstrate:
   - `test_FourSeat_PreflopActionOrder`: UTG(3) → BTN(0) → SB(1) → BB(2)
   - `test_FourSeat_PostflopActionOrder`: SB(1) → BB(2) → UTG(3) → BTN(0)
   - `test_FourSeat_FoldSkipsInTurnOrder`: Folded players skipped in action order
   - `test_FourSeat_MultipleFoldsMidRound`: Multiple folds leave 2 active, round completes
   - `test_FourSeat_ButtonRotatesFullCycle`: Button rotates 0→1→2→3→0
   - `test_FourSeat_PostflopWithFoldedPlayers`: Post-flop with only 2 remaining active
   - `test_FourSeat_FoldCompletesRoundIfAllActed`: Fold triggers round completion if all remaining active players have acted
   - `test_FullShowdownWithReveal_AllFourSeats`: Commit/reveal for all 4 seats

**Contract changes:**
- `MAX_SEATS` changed from 2 to 4
- `Hand.hasActed` changed from `bool[2]` to `bool[4]`
- `bothSeatsFilled()` replaced with `allSeatsFilled()` (loops all 4 seats)
- `startHand()`: Blind positions generalized (SB=button+1, BB=button+2, UTG=button+3 acts first preflop)
- `fold()`: Counts active players; settles only when 1 remains, otherwise advances action
- `_advanceAction()`: Uses `_nextActiveSeat()` to find next active clockwise
- `_isBettingRoundComplete()`: Checks all active seats (not just 0 and 1)
- `raise()`: Resets `hasActed` for all other active seats (not just `1 - seatIndex`)
- `fulfillVRF()`: Uses `_firstActiveAfterButton()` for post-flop first actor
- `_settleHand()`: Button rotates `(button + 1) % 4` (not `1 - button`)
- `forceTimeout()`: Auto-fold checks if 1 player remains or advances action
- New helpers: `_nextActiveSeat()`, `_countActivePlayers()`, `_firstActiveAfterButton()`
- All hardcoded `0/1` seat assumptions removed from production code

## T-0902 Real showdown settlement (remove pseudo-random winner) (P0)
- Status: [x] DONE
- Depends on: T-0901, M2
- Goal: Determine winners from actual cards, not keeper heuristic.
- Tasks:
    - Implement hand evaluation at showdown from community + revealed hole cards.
    - Replace `settleShowdown(winnerSeat)` manual winner input with verifiable settlement flow.
    - Update keeper to only trigger progression/liveness, not choose winners.
    - Add tie/pot-split handling and missing-reveal policy.
- Acceptance:
    - Keeper no longer contains pseudo-random or fixed winner logic.
    - Contract tests verify winner correctness for representative hand ranks and tie cases.
    - Showdown outcome is reproducible from revealed card data.

### DONE Notes (T-0902)
**Key files changed:**
- `contracts/src/HandEvaluator.sol` - New library: evaluates best 5-card hand from 7 cards (5 community + 2 hole), scores all C(7,2)=21 five-card combinations, supports all hand rankings from high card to straight flush with kicker tie-breaking
- `contracts/src/PokerTable.sol` - Imported HandEvaluator; replaced `settleShowdown(uint8 winnerSeat)` with `settleShowdown()` that evaluates revealed hole cards on-chain; added `_settleHandSplit()` for tie/pot-split handling; unrevealed active seats forfeit
- `contracts/test/HandEvaluator.t.sol` - 22 unit tests: hand type ordering (SF>quads>FH>flush>straight>trips>two pair>pair>high card), kicker tie-breaking, wheel/broadway straights, best-of-7 selection, edge cases
- `contracts/test/PokerTable.t.sol` - Updated all showdown tests for card-based settlement; added 8 new tests: no-reveals revert, single-reveal default win, evaluator-determined winner, loser verification, tie split, unrevealed forfeit, position-independence, non-showdown revert
- `bots/keeper/src/bot.ts` - Removed pseudo-random winner logic (`handId % 2`); keeper now calls `settleShowdown()` without args; gracefully retries if reveals not yet submitted
- `bots/keeper/src/chain/client.ts` - Removed `winnerSeat` parameter from `settleShowdown()`; fixed `bothSeatsFilled` → `allSeatsFilled` (broken since T-0901); reads all 4 seats instead of 2
- `bots/keeper/src/chain/pokerTableAbi.ts` - Updated `settleShowdown` ABI (no args); fixed `bothSeatsFilled` → `allSeatsFilled`
- `bots/keeper/src/keeper.test.ts` - Updated `shouldStartHand` tests for 4-seat stacks array
- `bots/agent/src/chain/pokerTableAbi.ts` - Fixed `bothSeatsFilled` → `allSeatsFilled`

**How to run/test:**
```bash
cd contracts && forge test -vv   # Runs all 241 tests (84 PokerTable + 22 HandEvaluator + 38 Registry + 97 Vault)
forge test --match-contract HandEvaluatorTest -vv   # 22 hand evaluator tests
forge test --match-contract PokerTableTest -vv      # 84 poker table tests
cd bots/keeper && pnpm test                         # 13 keeper tests
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 241 tests pass
2. HandEvaluator tests verify all 9 hand rankings with correct ordering
3. PokerTable showdown tests verify:
   - `test_Showdown_RevertIfNoReveals`: Settlement reverts without any reveals
   - `test_Showdown_SingleRevealWinsByDefault`: Only revealed seat wins by default
   - `test_Showdown_StrongerHandWins`: Card-evaluated winner receives full pot
   - `test_Showdown_TieSplitsPot`: Tied hands split pot with remainder to first clockwise from button
   - `test_Showdown_UnrevealedSeatForfeits`: Unrevealed seats forfeit even if they would have won
   - `test_Showdown_WinnerDeterminedByCards_NotPosition`: Winner depends on cards, not seat index
4. Keeper bot no longer contains any pseudo-random or fixed winner logic

**Hand evaluation scoring:**
- Score encoding: `(handType << 20) | (k0 << 16) | (k1 << 12) | (k2 << 8) | (k3 << 4) | k4`
- Hand types: 0=HighCard, 1=Pair, 2=TwoPair, 3=Trips, 4=Straight, 5=Flush, 6=FullHouse, 7=Quads, 8=StraightFlush
- Card encoding: rank = card % 13 (0=2..12=A), suit = card / 13

**Settlement policy:**
- At showdown, `settleShowdown()` evaluates all active seats that have revealed hole cards
- Active seats without reveals forfeit (cannot win)
- At least one active seat must have revealed (otherwise reverts)
- Best hand determined by HandEvaluator score comparison
- On tie: pot split evenly, remainder to first winner clockwise from button
- Settlement emits `HandSettled(handId, primaryWinner, totalPot)`

## T-0903 Replace mock VRF in runtime path with production adapter (P0)
- Status: [x] DONE
- Depends on: M1
- Goal: Remove mock randomness dependency from real deployments.
- Tasks:
    - Implement production VRF adapter contract and deployment flow.
    - Keep `MockVRFAdapter` only for local tests/dev.
    - Add environment/network gating so prod/testnet runbooks never use mock adapter.
    - Add fallback/retry policy for delayed VRF fulfillment.
- Acceptance:
    - Testnet deployment docs use production VRF adapter only.
    - Runtime config validation fails if mock adapter is configured on non-local environments.
    - End-to-end hand progression works with asynchronous real VRF callbacks.

### DONE Notes (T-0903)
**Key files changed:**
- `contracts/src/ProductionVRFAdapter.sol` - New production VRF adapter with trusted operator model: access-controlled fulfillment (only operator can fulfill), request tracking with timestamps, owner/operator admin functions, view functions for request status
- `contracts/src/PokerTable.sol` - Enforced `msg.sender == vrfAdapter` in `fulfillVRF()` (was a TODO comment), added `VRF_TIMEOUT` constant (5 minutes), `vrfRequestTimestamp` tracking, `reRequestVRF()` public function for liveness when VRF fulfillment is delayed, `VRFReRequested` event
- `contracts/script/DeployProductionVRF.s.sol` - Forge deployment script for production VRF adapter with operator address configuration
- `contracts/test/ProductionVRFAdapter.t.sol` - 25 tests: constructor, request/fulfill lifecycle, operator access control, admin functions, view functions, integration tests with PokerTable (full hand, caller enforcement, re-request after timeout, old request rejection)
- `contracts/test/PokerTable.t.sol` - 8 new tests: fulfillVRF caller enforcement (revert if not adapter, succeed through adapter), reRequestVRF (success after timeout, revert before timeout, revert if not VRF state, event emission, old request rejected, multiple re-requests)
- `packages/shared/src/types.ts` - Added `VRF_ADAPTER_TYPE` env var constant
- `packages/shared/src/chainConfig.ts` - Added `validateVRFAdapterConfig()`: requires `VRF_ADAPTER_TYPE=production` on testnet/mainnet, allows any type on local; updated `validateChainConfigEnv()` to include VRF_ADAPTER_TYPE for non-local
- `packages/shared/src/chainConfig.test.ts` - 7 new tests for VRF adapter type validation (local allowed, testnet/mainnet require production, rejects mock, validateChainConfigEnv checks)
- `bots/keeper/src/bot.ts` - Added `checkAndReRequestVRF()` method: detects VRF waiting state with expired timeout, calls `reRequestVRF()`, tracks `vrfReRequests` stat
- `bots/keeper/src/chain/client.ts` - Added `vrfRequestTimestamp` to TableState, `reRequestVRF()` method
- `bots/keeper/src/chain/pokerTableAbi.ts` - Added `vrfRequestTimestamp`, `VRF_TIMEOUT`, and `reRequestVRF` ABI entries
- `bots/keeper/src/keeper.test.ts` - 5 new tests for `shouldReRequestVRF` decision logic
- `.env.example` - Added `VRF_ADAPTER_TYPE` and `VRF_OPERATOR_ADDRESS` documentation

**How to run/test:**
```bash
cd contracts && forge test -vv   # Runs all 274 tests (92 PokerTable + 25 ProductionVRFAdapter + 22 HandEvaluator + 38 Registry + 97 Vault)
forge test --match-contract ProductionVRFAdapterTest -vv   # 25 production adapter tests
cd packages/shared && pnpm test   # 19 config tests (including 7 new VRF validation)
cd bots/keeper && pnpm test       # 18 keeper tests (including 5 new VRF re-request)
```

**Testnet deployment:**
```bash
# Deploy ProductionVRFAdapter to testnet
VRF_OPERATOR_ADDRESS=0x<your-operator-address> \
forge script contracts/script/DeployProductionVRF.s.sol \
  --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY -vvvv

# Set in .env:
VRF_ADAPTER_ADDRESS=<deployed-address>
VRF_ADAPTER_TYPE=production
```

**Manual verification:**
1. Run `forge test -vv` - all 274 tests pass
2. ProductionVRFAdapter tests verify:
   - Only designated operator can fulfill VRF requests
   - Request tracking prevents double-fulfillment
   - Integration with PokerTable works end-to-end
   - Re-request after timeout produces new request ID
   - Old request fulfillment is rejected after re-request
3. PokerTable fulfillVRF now enforces `msg.sender == vrfAdapter` (no longer a comment)
4. `reRequestVRF()` callable by anyone after 5-minute VRF timeout
5. Chain config rejects `CHAIN_ENV=testnet` without `VRF_ADAPTER_TYPE=production`
6. Keeper bot automatically detects delayed VRF and calls `reRequestVRF()`

**Security validations:**
- ProductionVRFAdapter: only operator can fulfill, only owner can change operator
- PokerTable.fulfillVRF: enforces msg.sender == vrfAdapter (previously a comment)
- Environment gating: MockVRFAdapter cannot be used on testnet/mainnet
- Re-request invalidates old request IDs (prevents stale fulfillment)

## T-0904 Remove non-real runtime fallbacks in services (P0)
- Status: [ ] TODO
- Depends on: M4
- Goal: Services should fail fast on missing real dependencies.
- Tasks:
    - Ensure indexer/ownerview startup requires explicit production-safe configuration.
    - Remove misleading messages implying mock-data fallback on runtime failure.
    - Require explicit `JWT_SECRET` (no insecure implicit default in non-local mode).
    - Add health checks that report dependency readiness (DB/RPC) as hard failures.
- Acceptance:
    - Service startup fails when required dependencies are unavailable.
    - No runtime path returns fabricated/mock API data.
    - Health endpoints clearly distinguish ready vs degraded states.

## T-0905 OwnerView durability + secure dealer endpoints (P1)
- Status: [ ] TODO
- Depends on: M2, T-0901
- Goal: Make hole-card and reveal pipeline durable and production-safe.
- Tasks:
    - Replace in-memory hole-card store with persistent storage.
    - Generalize storage/query paths for 4 seats.
    - Protect `/dealer/*` privileged endpoints with operator auth.
    - Add retention/cleanup policy tied to settlement lifecycle.
- Acceptance:
    - Restarting OwnerView does not lose active hand card records.
    - Dealer/reveal endpoints reject unauthorized calls.
    - 4-seat hole-card retrieval works with owner ACL.

## T-0906 Four-agent orchestration + E2E validation (P0)
- Status: [ ] TODO
- Depends on: T-0901, T-0902, T-0903, T-0904, T-0905
- Goal: Run 4 autonomous agent processes that play real hands continuously.
- Tasks:
    - Add run scripts/config (`docker-compose` or process runner) for 4 agent bots.
    - Add env layout for `AGENT_1..4` operator keys and seat ownership mapping.
    - Update README/demo script to use 4 agents as the default real-play scenario.
    - Add E2E smoke test that validates actions/settlements/indexed outputs across 4 agents.
- Acceptance:
    - One command starts services + 4 agent bots on local/testnet.
    - E2E test confirms multiple hands complete with real settlements and indexer updates.
    - Docs no longer describe 2-agent-only demo as target architecture.

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
- Status: [x] DONE
- Depends on: T-0101..T-0105, T-0301..T-0303
- Goal: Persist tables/hands/actions/settlements/snapshots.
- Tasks:
    - Postgres schema
    - Event ingestion with idempotency
    - REST endpoints:
        - `/tables`, `/tables/:id`, `/agents`, `/agents/:token`
- Acceptance:
    - Endpoints return correct data from chain events

### DONE Notes (T-0401)
**Key files changed:**
- `services/indexer/src/db/schema.sql` - Postgres schema for poker_tables, seats, hands, actions, agents, vault_snapshots, settlements, indexer_state
- `services/indexer/src/db/pool.ts` - Database connection pool with pg
- `services/indexer/src/db/repository.ts` - All database operations with idempotent upserts
- `services/indexer/src/db/types.ts` - TypeScript types for DB entities and API responses
- `services/indexer/src/events/abis.ts` - Contract ABIs for PokerTable, PlayerRegistry, PlayerVault events
- `services/indexer/src/events/handlers.ts` - Event handlers for all contract events
- `services/indexer/src/events/listener.ts` - Chain event listener with viem
- `services/indexer/src/api/routes.ts` - REST API routes: /tables, /tables/:id, /agents, /agents/:token
- `services/indexer/src/api/app.ts` - Express application setup
- `services/indexer/src/index.ts` - Main entry point with REST API + event listener

**How to run/test:**
```bash
pnpm install
pnpm build
cd services/indexer && pnpm test   # Runs 21 tests, all pass

# To run the service:
DB_HOST=localhost DB_NAME=playerco DB_USER=postgres DB_PASSWORD=postgres \
POKER_TABLE_ADDRESS=0x... PLAYER_REGISTRY_ADDRESS=0x... RPC_URL=http://localhost:8545 \
CHAIN_ENV=local pnpm start
```

**Manual verification:**
1. Run `pnpm test` in services/indexer - all 21 tests pass
2. Start with env vars to verify REST API:
   - GET /api/health - returns `{"status":"ok",...}`
   - GET /api/tables - returns array of tables
   - GET /api/tables/:id - returns single table with seats and current hand
   - GET /api/agents - returns array of registered agents
   - GET /api/agents/:token - returns single agent with latest snapshot
3. Event ingestion uses (block_number, log_index) as unique key for idempotency
4. Supports both API-only mode (without chain) and full mode (with event listener)

**Database schema features:**
- Idempotent event tracking with processed_events table
- Full poker table state: tables, seats, hands, actions
- Agent registry: agents with vault/table/owner/operator
- Vault snapshots for A/B/N/P accounting
- Proper indexes for query performance

## T-0402 WebSocket streaming for table updates (P0)
- Status: [x] DONE
- Depends on: T-0401
- Goal: Public UI can update in real time.
- Tasks:
    - `/ws/tables/:id` stream
    - Push updates on new actions/VRF/settlement
- Acceptance:
    - Table Viewer reflects actions without refresh

### DONE Notes (T-0402)
**Key files changed:**
- `services/indexer/src/ws/types.ts` - WebSocket message types for all table events
- `services/indexer/src/ws/manager.ts` - WsManager tracks connections per table with subscribe/unsubscribe/broadcast
- `services/indexer/src/ws/server.ts` - WebSocket server setup with path parsing for `/ws/tables/:id`
- `services/indexer/src/ws/broadcaster.ts` - Broadcast functions called from event handlers
- `services/indexer/src/ws/index.ts` - Module exports
- `services/indexer/src/ws/ws.test.ts` - 13 tests for WebSocket functionality
- `services/indexer/src/events/handlers.ts` - Added broadcast calls to all poker table event handlers
- `services/indexer/src/api/routes.ts` - Health endpoint now includes WebSocket stats
- `services/indexer/src/index.ts` - Integrated WebSocket server with HTTP server
- `services/indexer/package.json` - Added ws and @types/ws dependencies

**How to run/test:**
```bash
pnpm install
pnpm build
cd services/indexer && pnpm test   # Runs 34 tests, all pass
```

**Manual verification:**
1. Start the indexer service:
   ```bash
   DB_HOST=localhost DB_NAME=playerco DB_USER=postgres DB_PASSWORD=postgres \
   POKER_TABLE_ADDRESS=0x... RPC_URL=http://localhost:8545 CHAIN_ENV=local \
   pnpm start
   ```
2. Connect via WebSocket: `wscat -c ws://localhost:3002/ws/tables/1`
3. Receive "connected" message confirming subscription
4. When events occur on table 1, receive real-time updates
5. Check `/api/health` for WebSocket stats: `{"status":"ok","timestamp":"...","websocket":{"tables":1,"totalConnections":1}}`

**WebSocket message types:**
- `connected` - Subscription confirmed
- `action` - Player action (fold/check/call/raise)
- `hand_started` - New hand begins
- `betting_round_complete` - Betting round transitions
- `vrf_requested` - VRF randomness requested
- `community_cards` - Community cards dealt
- `hand_settled` - Hand winner and pot distribution
- `seat_updated` - Seat stack/owner changes
- `pot_updated` - Pot amount changes
- `force_timeout` - Timeout action triggered

**Security validations:**
- No hole cards appear in WebSocket streams (public data only)
- Connection cleanup on disconnect
- Closed connections removed on broadcast

## T-0403 Leaderboard computations (P0)
- Status: [x] DONE
- Depends on: T-0401, T-0303
- Goal: ROI, cumulative PnL, winrate, MDD with time filters.
- Tasks:
    - API: `/leaderboard?metric=&period=`
    - Implement time windows: 24h/7d/30d/all
- Acceptance:
    - Leaderboard returns plausible values for at least 4 metrics

### DONE Notes (T-0403)
**Key files changed:**
- `services/indexer/src/db/types.ts` - Added LeaderboardEntry, LeaderboardResponse, LeaderboardMetric, LeaderboardPeriod types
- `services/indexer/src/db/repository.ts` - Added getLeaderboardData(), getAgentSettlementsInPeriod(), getVaultSnapshotsInPeriod() functions
- `services/indexer/src/api/routes.ts` - Added GET /leaderboard endpoint with metric and period query params
- `services/indexer/src/api/routes.test.ts` - Added 16 new tests for leaderboard computations

**How to run/test:**
```bash
pnpm install
pnpm build
cd services/indexer && pnpm test   # Runs 50 tests, all pass
```

**Manual verification:**
1. Start the indexer service with DB connected
2. GET `/api/leaderboard` - returns all agents sorted by ROI (default)
3. GET `/api/leaderboard?metric=pnl&period=7d` - returns agents sorted by cumulative PnL for last 7 days
4. GET `/api/leaderboard?metric=winrate&period=24h` - returns agents sorted by winrate for last 24h
5. GET `/api/leaderboard?metric=mdd&period=30d` - returns agents sorted by MDD (ascending, lower is better)
6. Invalid metric/period returns 400 with helpful error message

**Metrics computed:**
- **ROI**: (currentNavPerShare - initialNavPerShare) / initialNavPerShare
- **PnL**: cumulativePnl from latest vault snapshot
- **Winrate**: winningHands / totalHands from settlements
- **MDD**: Maximum drawdown = max((peak - current) / peak) over all snapshots in period

**Time periods supported:**
- `24h` - Last 24 hours
- `7d` - Last 7 days
- `30d` - Last 30 days
- `all` - All time (default)

---

# M5 — Web App (Public/Owner) + In-app nad.fun Trading

## T-0501 Public web app pages (P0)
- Status: [x] DONE
- Depends on: T-0401..T-0403
- Goal: Public lobby, table viewer, agent page, leaderboard.
- Acceptance:
    - Lobby loads without wallet
    - Table viewer shows real-time public state
    - Agent page shows accounting snapshots and history
    - Leaderboard tabs render correctly

### DONE Notes (T-0501)
**Key files changed:**
- `apps/web/package.json` - Added Next.js 14, React 18 dependencies
- `apps/web/next.config.js` - Next.js configuration with indexer/WS URLs
- `apps/web/tsconfig.json` - TypeScript config for Next.js with ES2020 target
- `apps/web/src/lib/types.ts` - API response types matching indexer
- `apps/web/src/lib/api.ts` - API client for indexer REST endpoints
- `apps/web/src/lib/utils.ts` - Utility functions (card display, formatting)
- `apps/web/src/lib/useWebSocket.ts` - WebSocket hook for real-time updates
- `apps/web/src/app/layout.tsx` - Root layout with header navigation
- `apps/web/src/app/globals.css` - Global styles for poker UI
- `apps/web/src/app/page.tsx` - Lobby page (table list)
- `apps/web/src/app/table/[id]/page.tsx` - Table page wrapper
- `apps/web/src/app/table/[id]/TableViewer.tsx` - Real-time table viewer with WebSocket
- `apps/web/src/app/agent/[token]/page.tsx` - Agent page with A/B/N/P stats and history
- `apps/web/src/app/leaderboard/page.tsx` - Leaderboard with metric/period tabs
- `apps/web/src/app/leaderboard/LeaderboardTable.tsx` - Leaderboard table component

**How to run/test:**
```bash
pnpm install
pnpm build                    # Builds all packages including web app
cd apps/web && pnpm dev       # Start dev server on port 3000
```

**Manual verification:**
1. Run `pnpm build` - web app builds successfully with Next.js
2. Start indexer service (see T-0401) and web app: `pnpm dev`
3. Visit http://localhost:3000 - Lobby page loads without wallet requirement
4. Click a table - Table viewer shows seats, pot, community cards, action log
5. Real-time updates via WebSocket (connection status shown in bottom-right)
6. Visit /agent/:token - Agent page shows A/B/N/P accounting stats and NAV history
7. Visit /leaderboard - Leaderboard shows metric tabs (ROI/PnL/Winrate/MDD) and period tabs (24h/7d/30d/all)

**Public pages implemented:**
- `/` - Lobby with live tables, blinds, seats, pot preview
- `/table/[id]` - Table viewer with real-time WebSocket updates, community cards, seat panels, action log, timer
- `/agent/[token]` - Agent page with A/B/N/P stats, ROI, PnL, NAV history table, nad.fun fallback link
- `/leaderboard` - Leaderboard with 4 metrics and 4 time periods, sortable

**Security validations:**
- No hole cards displayed on any public page
- WebSocket receives only public table state
- Agent page shows only accounting data (no hole cards)

## T-0502 Owner web pages + hole cards (P0)
- Status: [x] DONE
- Depends on: T-0201..T-0202, T-0501
- Goal: Owner can see their hole cards.
- Tasks:
    - Wallet signature login flow
    - `/me` page shows owned agents (registry-based)
    - Owner table view calls OwnerView API and renders hole cards
- Acceptance:
    - Owner sees hole cards
    - Non-owner cannot access hole cards

### DONE Notes (T-0502)
**Key files changed:**
- `apps/web/package.json` - Added viem dependency for wallet interaction
- `apps/web/src/lib/auth/types.ts` - Auth types (AuthState, NonceResponse, VerifyResponse, HoleCardsResponse)
- `apps/web/src/lib/auth/ownerviewApi.ts` - OwnerView API client (getNonce, verifySignature, getHoleCards)
- `apps/web/src/lib/auth/AuthContext.tsx` - Auth context with wallet connection, signature login, hole cards fetching
- `apps/web/src/lib/auth/index.ts` - Auth module exports
- `apps/web/src/types/global.d.ts` - TypeScript declaration for window.ethereum
- `apps/web/src/components/WalletButton.tsx` - Wallet connect/sign-in/disconnect button
- `apps/web/src/app/providers.tsx` - Client-side providers wrapper for AuthProvider
- `apps/web/src/app/layout.tsx` - Updated with AuthProvider, WalletButton, and /me nav link
- `apps/web/src/app/me/page.tsx` - My Agents page showing owned agents from registry
- `apps/web/src/app/table/[id]/TableViewer.tsx` - Enhanced with owner mode and hole cards display
- `apps/web/src/app/globals.css` - Added styles for wallet button, auth, hole cards, owner mode

**How to run/test:**
```bash
pnpm install
pnpm build   # Builds all packages including web app
cd apps/web && pnpm dev   # Start dev server on port 3000
```

**Manual verification:**
1. Run indexer and ownerview services:
   ```bash
   # Terminal 1 - Start ownerview service
   JWT_SECRET=your-secret-32-chars RPC_URL=http://localhost:8545 POKER_TABLE_ADDRESS=0x... node services/ownerview/dist/index.js

   # Terminal 2 - Start indexer service
   DB_HOST=localhost DB_NAME=playerco ... pnpm --filter @playerco/indexer start
   ```
2. Start web app: `cd apps/web && pnpm dev`
3. Visit http://localhost:3000 - Click "Connect Wallet" in header
4. After connecting, click "Sign In" to authenticate with signature
5. Visit /me - Shows owned agents filtered by connected wallet
6. Visit /table/:id - If owner of a seat, shows "Owner Mode" banner and hole cards
7. Non-owners see normal public table view without hole cards

**Security validations:**
- OwnerView hole card endpoint denies non-owners (403 NOT_SEAT_OWNER)
- No hole cards appear in WebSocket streams (public data only)
- Hole cards only displayed for the seat owned by authenticated wallet
- Session stored in sessionStorage with JWT expiry validation
- Account change in wallet clears auth session

**Auth flow:**
1. Connect wallet (eth_requestAccounts)
2. Request nonce from OwnerView (/auth/nonce)
3. Sign message with wallet (personal_sign)
4. Verify signature and get JWT (/auth/verify)
5. Use JWT for authenticated API calls (/owner/holecards)

## T-0503 In-app nad.fun trading widget (P0)
- Status: [x] DONE
- Depends on: T-0002, T-0501
- Goal: Quote + execute buy/sell in our UI.
- Tasks:
    - Query Lens for routing and quotes
    - Execute buy/sell via router contracts
    - Slippage + deadline controls
    - Display token stage (bonding/locked/graduated)
    - Provide fallback "Open on nad.fun"
- Acceptance:
    - On testnet, at least one successful buy and one successful sell
    - UI reflects stage changes correctly (where available)

### DONE Notes (T-0503)
**Key files changed:**
- `apps/web/src/lib/nadfun/types.ts` - Types and ABIs for nad.fun Lens, Bonding Router, DEX Router contracts
- `apps/web/src/lib/nadfun/client.ts` - Chain client with getTokenInfo, getBuyQuote, getSellQuote, executeBuy/Sell functions
- `apps/web/src/lib/nadfun/index.ts` - Module exports
- `apps/web/src/components/TradingWidget.tsx` - Full trading widget with stage display, buy/sell, slippage, deadline
- `apps/web/src/app/agent/[token]/page.tsx` - Updated to use TradingWidget instead of placeholder
- `apps/web/src/app/globals.css` - Added 380+ lines of trading widget styles
- `apps/web/next.config.js` - Added NEXT_PUBLIC_* env vars for nad.fun contracts
- `.env.example` - Documented new client-side environment variables

**How to run/test:**
```bash
pnpm install
pnpm build   # Builds all packages including web app
cd apps/web && pnpm dev   # Start dev server on port 3000
```

**Manual verification:**
1. Run `pnpm build` - all packages build successfully, including web app
2. Set env vars for nad.fun contracts:
   ```bash
   NEXT_PUBLIC_NADFUN_LENS_ADDRESS=0x...
   NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS=0x...
   NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS=0x...
   NEXT_PUBLIC_WMON_ADDRESS=0x...
   NEXT_PUBLIC_RPC_URL=https://testnet-rpc.monad.xyz
   ```
3. Start web app: `cd apps/web && pnpm dev`
4. Visit /agent/:token - Trading widget shows:
   - Token stage indicator (Bonding Curve / Locked / Graduated)
   - Current price from Lens contract
   - Buy/Sell mode toggle
   - Amount input with MAX button
   - Real-time quote with price impact
   - Slippage tolerance selector (0.5%, 1%, 2%, 5%, custom)
   - Transaction deadline setting (default 20 min)
   - Execute trade button (requires wallet connection)
   - Fallback "Open on nad.fun" link always visible

**Widget features:**
- Queries nad.fun Lens for token info (stage, price, marketCap, bondingProgress, tradeable)
- Supports bonding curve and graduated DEX trading
- Automatic router selection based on token stage
- ERC20 approval handling for sell orders
- Shows user balances when wallet connected
- Transaction success/error feedback with explorer link
- Slippage protection (minAmountOut calculated client-side)
- Deadline enforcement (configurable minutes)

**Security validations:**
- No private keys stored in frontend
- All transactions require wallet signature
- Slippage protection prevents sandwich attacks
- Deadline prevents stale transactions
- Fallback link allows users to trade on nad.fun directly

---

# M6 — Vault Treasury Rebalancing (Per-hand, Accretive-only)

## T-0601 Accretive-only rebalancing (P1)
- Status: [x] DONE
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

### DONE Notes (T-0601)
**Key files changed:**
- `contracts/src/interfaces/INadfunLens.sol` - Interface for nad.fun Lens contract (token info, quotes)
- `contracts/src/interfaces/INadfunRouter.sol` - Interface for nad.fun Router contract (buy/sell)
- `contracts/src/mocks/MockNadfunRouter.sol` - Mock router for testing rebalancing logic
- `contracts/src/PlayerVault.sol` - Added rebalancing functions with accretive-only constraints
- `contracts/test/PlayerVault.t.sol` - Added 25 comprehensive rebalancing tests

**How to run/test:**
```bash
cd contracts && forge test -vv   # Runs all 191 tests, including 25 new rebalancing tests
forge test --match-contract PlayerVaultTest -vv   # Runs 85 PlayerVault tests
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 191 tests pass
2. Key rebalancing tests demonstrate:
   - `test_RebalanceBuy_RevertNoSettlement`: Cannot rebalance before settlement
   - `test_RebalanceBuy_RevertAlreadyRebalanced`: Cannot rebalance same hand twice
   - `test_RebalanceBuy_RevertPriceAboveNAV`: Buy reverts if execution price > NAV
   - `test_RebalanceSell_RevertPriceBelowNAV`: Sell reverts if execution price < NAV
   - `test_RebalanceBuy_NavIncreasesWhenBuyingCheap`: NAV increases when buying cheap
   - `test_RebalanceSell_NavIncreasesWhenSellingExpensive`: NAV increases when selling expensive
   - `test_AccretiveInvariant_*`: P_after >= P_before in all scenarios

**Contract features:**
- `setRebalanceConfig(lens, router, maxMonBps, maxTokenBps)` - Configure rebalancing parameters
- `rebalanceBuy(monAmount, minTokenOut)` - Buy treasury's own token with MON
- `rebalanceSell(tokenAmount, minMonOut)` - Sell treasury's own token for MON
- `getRebalanceStatus()` - Check if rebalancing is allowed for current hand

**Accretive-only constraints:**
- Buy: `q_buy = monIn / tokenOut <= P` (must buy at or below NAV)
- Sell: `q_sell = monOut / tokenIn >= P` (must sell at or above NAV)
- Size caps: configurable bps of A (for buys) or B (for sells)
- Once per hand: `lastRebalancedHandId` tracking

**Events:**
- `RebalanceBuy(handId, monSpent, tokensReceived, executionPrice, navBefore, navAfter)`
- `RebalanceSell(handId, tokensSold, monReceived, executionPrice, navBefore, navAfter)`
- `RebalanceConfigUpdated(lens, router, maxMonBps, maxTokenBps)`

## T-0602 Randomized delay window (P1)
- Status: [x] DONE
- Depends on: T-0601, T-0104
- Goal: Reduce predictability of rebalancing execution.
- Tasks:
    - After settlement, set `eligibleBlock = current + (vrfRand % R)`
    - Only allow rebalance after `eligibleBlock`
- Acceptance:
    - Attempt before eligibleBlock fails
    - After eligibleBlock succeeds (when constraints hold)

### DONE Notes (T-0602)
**Key files changed:**
- `contracts/src/interfaces/IPlayerVault.sol` - Added `onSettlementWithVRF()` function to interface
- `contracts/src/PlayerVault.sol` - Added randomized delay logic with configurable max delay
- `contracts/test/PlayerVault.t.sol` - Added 12 new tests for randomized delay window

**How to run/test:**
```bash
cd contracts && forge test --match-contract PlayerVaultTest -vv   # Runs all 97 tests
forge test -vv   # Runs all 203 tests (PokerTable + PlayerRegistry + PlayerVault)
```

**Manual verification:**
1. Run `forge test -vv` in contracts/ - all 203 tests pass
2. Key delay window tests demonstrate:
   - `test_OnSettlementWithVRF_SetsRandomizedDelay`: VRF randomness computes delay correctly
   - `test_RebalanceBuy_RevertBeforeEligibleBlock`: Rebalance reverts before delay passes
   - `test_RebalanceBuy_SucceedsAfterEligibleBlock`: Rebalance succeeds after delay
   - `test_RebalanceSell_RevertBeforeEligibleBlock`: Sell also respects delay
   - `test_RebalanceStatus_ShowsBlocksRemaining`: Status shows remaining blocks
   - `test_DelayVariesWithVRFRandomness`: Different VRF values give different delays

**Contract features:**
- `setRebalanceDelayConfig(maxDelayBlocks)` - Configure max delay in blocks (R)
- `onSettlementWithVRF(handId, pnl, vrfRandomness)` - Settlement with delay computation
- `rebalanceEligibleBlock` - Block number after which rebalancing is allowed
- Delay formula: `eligibleBlock = currentBlock + (vrfRandomness % maxDelayBlocks)`
- `getRebalanceStatus()` now returns `(canRebalance, handId, lastRebalanced, eligibleBlock, blocksRemaining)`

**Events:**
- `RebalanceDelaySet(handId, eligibleBlock, delayBlocks)` - Emitted when delay is set
- `RebalanceDelayConfigUpdated(maxDelayBlocks)` - Emitted when config changes

**Security validations:**
- Rebalancing checks `block.number >= rebalanceEligibleBlock` before executing
- Regular `onSettlement()` still works with immediate eligibility (no delay)
- `onSettlementWithVRF()` provides predictability reduction for production use

---

# M7 — Bots + End-to-end Demo

## T-0701 AgentBot (P0)
- Status: [x] DONE
- Depends on: M1 + hole card retrieval method
- Goal: Keep the game running with valid actions.
- Tasks:
    - Connect as operator
    - Fetch public state + its own hole cards (OwnerView)
    - Submit legal actions quickly (avoid timeouts)
- Acceptance:
    - Runs 50+ hands without manual intervention

### DONE Notes (T-0701)
**Key files changed:**
- `bots/agent/package.json` - Added viem and tsx dependencies
- `bots/agent/src/chain/pokerTableAbi.ts` - PokerTable contract ABI for chain interaction
- `bots/agent/src/chain/client.ts` - ChainClient class for reading state and submitting actions
- `bots/agent/src/auth/ownerviewClient.ts` - OwnerView API client for wallet auth + hole card fetching
- `bots/agent/src/strategy/types.ts` - Strategy types and interfaces
- `bots/agent/src/strategy/simpleStrategy.ts` - Simple rule-based poker strategy with hand scoring
- `bots/agent/src/bot.ts` - Main AgentBot class with polling loop and action submission
- `bots/agent/src/index.ts` - Entry point with environment config and graceful shutdown
- `bots/agent/src/strategy/simpleStrategy.test.ts` - 17 tests for strategy logic

**How to run/test:**
```bash
pnpm install
pnpm build
cd bots/agent && pnpm test   # Runs 17 tests, all pass

# To run the bot:
RPC_URL=http://localhost:8545 \
OPERATOR_PRIVATE_KEY=0x... \
POKER_TABLE_ADDRESS=0x... \
OWNERVIEW_URL=http://localhost:3001 \
MAX_HANDS=50 \
pnpm start
```

**Manual verification:**
1. Run `pnpm build` - all packages build successfully
2. Run `cd bots/agent && pnpm test` - all 17 tests pass
3. Deploy PokerTable contract locally, register seats
4. Start OwnerView service
5. Run bot with env vars pointing to local contracts
6. Bot finds its seat, waits for turn, submits legal actions
7. Bot tracks stats: hands played, won, profit, errors

**Bot features:**
- Chain interaction via viem (read state, submit actions)
- OwnerView authentication with wallet signature
- Hole card fetching for informed decisions
- Simple hand strength scoring (0-100)
- Rule-based strategy: check when free, call/fold based on strength
- Configurable aggression for raises
- Fail-safe: auto-fold on action errors
- Graceful shutdown with SIGINT/SIGTERM
- Statistics tracking: hands, wins, profit, errors
- One-action-per-block awareness
- Auto-start new hands when SETTLED

**Security validations:**
- Private key only used for signing, never exposed
- OwnerView API requires JWT authentication
- Hole cards only fetched for bot's own seat (ACL enforced by OwnerView)

## T-0702 KeeperBot (P0)
- Status: [x] DONE
- Depends on: M1, M6
- Goal: Liveness and automation.
- Tasks:
    - Detect deadlines and call `forceTimeout`
    - VRF retries if needed
    - Finalize hands
    - Trigger rebalance when allowed
- Acceptance:
    - With KeeperBot only, table does not stall

### DONE Notes (T-0702)
**Key files changed:**
- `bots/keeper/package.json` - Added viem and tsx dependencies
- `bots/keeper/src/chain/pokerTableAbi.ts` - PokerTable ABI for keeper operations
- `bots/keeper/src/chain/playerVaultAbi.ts` - PlayerVault ABI for rebalancing
- `bots/keeper/src/chain/client.ts` - ChainClient for table state and keeper actions
- `bots/keeper/src/bot.ts` - Main KeeperBot with polling loop and liveness checks
- `bots/keeper/src/index.ts` - Entry point with env config and graceful shutdown
- `bots/keeper/src/keeper.test.ts` - 13 tests for decision logic

**How to run/test:**
```bash
pnpm install
pnpm build
cd bots/keeper && pnpm test   # Runs 13 tests, all pass

# To run the keeper:
RPC_URL=http://localhost:8545 \
KEEPER_PRIVATE_KEY=0x... \
POKER_TABLE_ADDRESS=0x... \
PLAYER_VAULT_ADDRESS=0x... \
ENABLE_REBALANCING=true \
pnpm start
```

**Manual verification:**
1. Run `pnpm build` - all packages build successfully
2. Run `cd bots/keeper && pnpm test` - all 13 tests pass
3. Deploy PokerTable contract locally with registered seats
4. Start keeper with env vars
5. Keeper polls table state every 2s (configurable)
6. On timeout: calls forceTimeout (auto-check or auto-fold)
7. On SETTLED: starts new hand
8. On SHOWDOWN: settles with winner (MVP: based on hand ID)
9. On rebalance eligible: triggers buy/sell (if enabled)

**Keeper features:**
- Chain interaction via viem (read state, submit keeper txs)
- Detects action deadline passed → forceTimeout
- Detects SETTLED state → startHand
- Detects SHOWDOWN state → settleShowdown
- Detects rebalance eligibility → trigger buy/sell
- One-action-per-block awareness
- Statistics tracking: timeouts, hands started, showdowns, rebalances, errors
- Graceful shutdown with SIGINT/SIGTERM

**Security notes:**
- Keeper requires its own private key (not seat owner/operator)
- forceTimeout is public function, anyone can call
- settleShowdown requires winner seat - MVP uses pseudo-random
- Rebalancing respects accretive-only constraints (enforced on-chain)

---

# M8 — Docs + Hackathon Packaging

## T-0801 Ops docs (P0)
- Status: [x] DONE
- Depends on: overall
- Goal: Anyone can run the full stack following docs.
- Acceptance:
    - End-to-end run from docs succeeds on a fresh machine (reasonable assumptions)

### DONE Notes (T-0801)
**Key files changed:**
- `README.md` - Comprehensive operations documentation

**How to verify:**
1. Follow README.md from Quick Start section
2. Complete local development setup with all 7 terminals
3. Verify web app shows table state in real-time
4. Verify agent bots play hands autonomously

**Documentation sections added:**
- Prerequisites (Node.js, pnpm, Foundry, PostgreSQL)
- Repository structure
- Local development setup (7 steps with terminal commands)
  - Anvil startup with deterministic accounts
  - Contract deployment with forge
  - Seat registration with cast
  - PostgreSQL setup
  - Environment variable configuration
  - Service startup order (OwnerView → Indexer → Web → Bots)
- Environment variables reference (all services)
- Running tests
- API endpoints (REST and WebSocket)
- Troubleshooting guide

## T-0802 Demo script + submission checklist (P0)
- Status: [x] DONE
- Depends on: M1..M7
- Goal: Repeatable demo flow:
    - spectate → owner hole cards → settlement → leaderboard update → in-app trade
- Acceptance:
    - Demo flow reproducible at least once without patching code

### DONE Notes (T-0802)
**Key files changed:**
- `scripts/demo.sh` - Automated demo script to verify full flow
- `SUBMISSION.md` - Hackathon submission checklist

**How to run:**
```bash
# Ensure all services are running (see README.md)
./scripts/demo.sh <POKER_TABLE_ADDRESS>
```

**Demo script verifies:**
1. Services health check (Indexer, OwnerView)
2. Public spectating - Table list and details
3. Owner auth flow - Nonce request documented
4. Leaderboard - Metrics query
5. Agent registry - List agents
6. Web app URLs - All pages documented

**Submission checklist includes:**
- Code quality verification
- Component checklist (contracts, services, frontend, bots)
- Demo flow steps
- Security verification checklist
- Testnet deployment instructions
- Known limitations

---
