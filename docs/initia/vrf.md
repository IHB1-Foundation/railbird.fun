# VRF Flow on Initia MiniEVM Rollup

## Overview

Railbird uses an **off-chain commit-reveal VRF** scheme (`ProductionVRFAdapter`) on the Initia
MiniEVM rollup. Chainlink VRF is **not used** — Chainlink does not support Initia testnet.

## Why Not Chainlink VRF?

| Requirement         | Chainlink VRF        | ProductionVRFAdapter |
| ------------------- | -------------------- | -------------------- |
| Initia testnet      | Not available        | ✅ Chain-agnostic    |
| Cost                | LINK token required  | Native gas only      |
| Latency             | 1-3 blocks           | 1 block (operator)   |
| Trust model         | Chainlink oracle     | Off-chain operator   |
| Post-hoc verifiable | Yes (on-chain proof) | Yes (commit-reveal)  |

## How ProductionVRFAdapter Works

1. **Request** — `PokerTable.requestVRF()` emits a `VRFRequested(requestId)` event on-chain.
2. **Fulfill** — The off-chain VRF operator monitors the chain, generates a pseudo-random value,
   and calls `ProductionVRFAdapter.fulfill(requestId, randomness)` within the same block or the
   next block.
3. **Commit-reveal** — The `randomness` value is publicly verifiable: anyone can see the
   on-chain `VRFRequested` event, the fulfilled `randomness`, and the resulting card assignment.

## Trust Model for Judges

The VRF operator is a trusted off-chain component. Its private key must stay secret from the
players to prevent prediction of card outcomes. This is a known tradeoff:

- **Upside**: simple, fast, no oracle dependency, works on any EVM chain.
- **Risk**: operator could collude with a player if their private key were compromised.
- **Mitigation**: operator key rotated regularly; VRF operator is independent of player wallets.
- **Future path**: Initia may support a native VRF precompile; we'd upgrade to it when available.

## On-Chain Evidence

> **Note**: TX hashes will be added here after the Initia rollup E2E run (I14-1).

```
VRFRequested tx:  PLACEHOLDER (see docs/initia/e2e-evidence.md after I14 run)
VRFFulfilled tx:  PLACEHOLDER
Community cards revealed at hand: PLACEHOLDER
```

## Key Contracts

| Contract                   | Role                                                    |
| -------------------------- | ------------------------------------------------------- |
| `ProductionVRFAdapter.sol` | Receives VRF requests, stores fulfilled randomness      |
| `PokerTable.sol`           | Calls `requestVRF()` at hand start, reads fulfilled RNG |
| `ChainlinkVRFAdapter.sol`  | **Not deployed on Initia** — HashKey only               |

## Environment Variables

```bash
VRF_ADAPTER_TYPE=production
VRF_OPERATOR_ADDRESS=<operator-wallet>
VRF_ADAPTER_ADDRESS=<deployed ProductionVRFAdapter address>
```
