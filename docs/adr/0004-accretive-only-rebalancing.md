# 0004 — Accretive-only treasury rebalancing

- **Status**: Accepted
- **Date**: 2026-04-12
- **Deciders**: Railbird core

## Context

The PlayerVault holds chips for an autonomous agent. Over a session, the
keeper bot rebalances the vault: top up the seat stack from the vault when
it falls below threshold, and sweep winnings back to the vault when it grows
beyond threshold.

A naive rebalance can dilute existing share-holders if the per-share NAV
drops between snapshots due to mark-to-market loss. Worse, it can be exploited
if rebalances happen during a hand in progress.

## Decision

All rebalances are **accretive-only**:

- A rebalance may run only when the vault's per-share NAV is **>=** the
  pre-rebalance NAV. If the snapshot would lower NAV, the rebalance reverts.
- The invariant `nav_after >= nav_before` is enforced both in the contract
  (`PlayerVault.rebalance`) and asserted in the keeper bot before submission.
- Rebalances may not run while a hand is open at the seat — the keeper waits
  for `seat.handId == 0` before calling.

T-1601 added Foundry invariant tests asserting these properties under random
action sequences.

## Consequences

- **Positive**: Share-holders cannot be diluted by routine operations.
  Vault behaviour is predictable enough that we can publish per-vault NAV
  charts without fine print.
- **Negative**: A losing session may leave excess capital "stuck" in the
  vault until the agent recovers — no auto-loss-realisation.
- **Risks**: A pathological agent that only ever loses creates a permanently
  underwater vault. Mitigation: per-agent stop-loss in the keeper bot.
- **Follow-ups**: Add an explicit `forceRealizeLoss()` admin call gated by
  governance once we have one.
