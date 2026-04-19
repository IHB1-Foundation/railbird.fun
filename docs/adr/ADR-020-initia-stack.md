# ADR-020: Initia Stack Decision for INITIATE Hackathon

**Status**: Accepted  
**Date**: 2026-04-19  
**Deciders**: Railbird core team

---

## Context

Railbird is pivoting its hackathon submission target from **HashKey Chain (OP Stack)** to the **INITIATE: The Initia Hackathon (Season 1)**, Track: Gaming (primary) + AI (secondary).

Hard requirements for submission:

1. Deploy on own Initia appchain/rollup (Rollup chain ID or TX link required)
2. Use `@initia/interwovenkit-react` (InterwovenKit) for wallet/transaction handling
3. Implement ≥1 Initia-native feature: Auto-signing (Session UX) / Interwoven Bridge / `.init` Usernames

Existing codebase is in Solidity (Foundry), so Move/WASM runtimes are not viable. The contracts (PokerTable, PlayerRegistry, PlayerVault, VRF adapters) are EVM-compatible.

---

## Decision

### Rollup Runtime: MiniEVM

**Selected**: MiniEVM (Initia's Ethereum-compatible rollup runtime)

**Rationale**:

- All existing contracts are Solidity — no rewrite needed.
- MiniEVM provides EVM JSON-RPC compatibility, so existing `viem`/Foundry tooling works with minimal changes.
- MiniMove and MiniWASM would require full contract rewrites (Move/CosmWasm).

**Rejected alternatives**:

- MiniMove: requires Move language rewrite of all poker contracts.
- MiniWASM: requires CosmWasm (Rust) rewrite.

### Chain Parameters (Initia Testnet MiniEVM Rollup)

| Parameter       | Value                                                             |
| --------------- | ----------------------------------------------------------------- |
| Chain type      | MiniEVM rollup on Initia testnet                                  |
| Chain ID        | TBD after rollup provisioning (set in `infra/initia/rollup.json`) |
| EVM RPC URL     | TBD after rollup provisioning                                     |
| Explorer        | Initiascan or rollup-specific explorer                            |
| Faucet          | Initia testnet faucet (INIT tokens)                               |
| CHAIN_ENV value | `initia-testnet`                                                  |
| Native currency | INIT                                                              |
| Block time      | ~100ms (Initia consensus)                                         |

### InterwovenKit Version

`@initia/interwovenkit-react` — latest stable at integration time.  
Pin version in `apps/web/package.json` after install.

### Initia-Native Features Selected

| Feature                    | Priority                        | Rationale                                                                               |
| -------------------------- | ------------------------------- | --------------------------------------------------------------------------------------- |
| **Auto-sign / Session UX** | Primary (satisfies hard req #3) | Poker has 10-50 actions/hand — auto-sign eliminates wallet pop-up fatigue. Best UX fit. |
| **`.init` Usernames**      | Secondary (scoring plus)        | Replaces hex addresses in leaderboard/seat UI. Moderate effort, high UX impact.         |
| Interwoven Bridge          | Optional (I6)                   | Adds cross-ecosystem distribution score. Implement only if time allows.                 |

### VRF Strategy

**Decision**: Keep existing `ProductionVRFAdapter` (off-chain operator + on-chain commit-reveal).

**Rationale**:

- Chainlink VRF is not available on Initia testnet MiniEVM rollup.
- Current off-chain VRF operator pattern is chain-agnostic and works on any EVM chain.
- The commit-reveal scheme provides post-hoc verifiability auditable by anyone.
- No code change needed; only RPC/address reconfiguration for the new rollup.

See `docs/initia/vrf.md` for operator trust model documentation.

### Block Time Impact (100ms blocks)

Initia MiniEVM blocks are ~100ms vs HashKey's ~2-3s. This requires tuning:

- Indexer poll interval: 250ms (down from 2000ms)
- Bot poll intervals: 250ms
- Reorg safety window: increase from 5 to 20 blocks (still only 2 seconds)
- Batch sizes: reduce to avoid RPC overload

### Items Removed / Disabled for Initia

| Item                      | Action                                                          | Reason                                             |
| ------------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| KYC SBT (`IHumanSBT`)     | Default off (`KYC_SBT_ADDRESS = 0x0`)                           | HashKey-specific contract; no equivalent on Initia |
| nad.fun trading widget    | Feature-flagged off (`NEXT_PUBLIC_ENABLE_TRADING_WIDGET=false`) | Monad-specific DEX; no Initia equivalent at launch |
| Treasury auto-rebalancing | Disabled (`ENABLE_REBALANCING=false`)                           | Requires nad.fun/DEX integration                   |
| HashKey RPC/Explorer URLs | Moved to `contracts/script/deprecated/`                         | No longer the active deployment target             |
| `DeployHashKey.s.sol`     | Moved to `contracts/script/deprecated/`                         | Replaced by `DeployInitia.s.sol`                   |

---

## Consequences

**Positive**:

- No contract logic changes — only deployment target and wallet layer change.
- Auto-sign directly addresses the UX pain point in fast-paced poker action.
- `.init` usernames give Railbird a distinctly Initia-native feel in the UI.
- MiniEVM allows complete reuse of Foundry toolchain.

**Negative / Risks**:

- MiniEVM rollup provisioning (Milestone I2) is the hardest blocker — must be done first.
- InterwovenKit API surface may differ from `window.ethereum`; wallet adapter layer needs careful testing.
- 100ms block time increases indexer/bot complexity (more events per second).

---

## References

- Initia docs: https://docs.initia.xyz
- MiniEVM rollup launcher: https://github.com/initia-labs/minitia-artifacts
- InterwovenKit: `@initia/interwovenkit-react` npm package
- Related tickets: I1 (config), I2 (deploy), I3 (wallet), I4 (auto-sign), I5 (.init)
