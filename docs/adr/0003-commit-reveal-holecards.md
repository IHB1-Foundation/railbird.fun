# 0003 — Commit-reveal hole cards via ECIES + verifiable shuffle

- **Status**: Accepted
- **Date**: 2026-04-12
- **Deciders**: Railbird core

## Context

In on-chain poker, two requirements conflict:

1. **Privacy**: Hole cards must be visible only to the seated player until
   showdown.
2. **Verifiability**: After the hand, anyone must be able to verify the deal
   was unbiased and not manipulated by the dealer service.

A naive trusted dealer fails (1) — the operator could read all hole cards.
A pure on-chain MPC deal is infeasible at our latency budget.

## Decision

Use a commit-reveal protocol with off-chain dealing:

- **VRF randomness** is committed on-chain at hand start.
- The dealer service derives a verifiable shuffle from
  `H(vrfRandomness ‖ dealerSeed)`.
- For each seat, hole cards are encrypted with the seat owner's ECIES
  public key (registered ahead of time via `POST /owner/encryption-key`).
- The dealer commits `H(seedShare_i ‖ seatIndex)` to chain per seat at deal
  time. Encrypted blobs are stored on the OwnerView service only.
- At showdown, the dealer reveals the seed shares; any observer can verify
  the original commitments and replay the deterministic shuffle.

The dealer seed is stored in a separate filesystem directory from the hole
card blobs so a single read-access leak cannot reconstruct hands.

## Consequences

- **Positive**: Players see only their own cards in real time. The full deal
  is verifiable post-showdown without trusting the dealer.
- **Negative**: We rely on the dealer service's availability for live play.
  If OwnerView goes down mid-hand, that hand cannot continue.
- **Risks**: ECIES key compromise reveals all hands ever dealt to that seat.
  We rotate encryption keys per session.
- **Follow-ups**: Audit the verifiable-shuffle implementation against the
  Mental Poker literature; consider FROST threshold dealing for the dealer
  seed in v2.
