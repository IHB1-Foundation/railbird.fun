# Threat Model: Trustless Dealer Protocol

## Scope

This document covers the threat model for Railbird's **Trustless Dealer** system, which handles hole-card privacy in an on-chain poker game. The system is responsible for:

1. Generating per-hand hole cards in a verifiable, unbiased way
2. Delivering hole cards to seat owners without exposing them to other parties
3. Allowing post-hoc public verification of shuffle fairness at showdown

---

## Assets Under Protection

| Asset | Sensitivity | Where It Lives |
|-------|-------------|----------------|
| Hole cards (plaintext) | **Critical** — game integrity | OwnerView service memory (transient) |
| Dealer seed | **High** — reveals all cards if disclosed pre-showdown | OwnerView service (encrypted-at-rest or enclave) |
| Player encryption private keys | **High** — allows decryption of own cards | Client browser memory only |
| VRF randomness | **Medium** — public after fulfillment | On-chain |
| Shuffle commitments | Low — public by design | On-chain |

---

## Attacker Models

### Attacker 1: Server Operator (Insider Threat)

**Capability:** Full read/write access to OwnerView server filesystem, memory, and logs. Can inspect all HTTP traffic passing through the process.

| Attack | Without Defense | Layer 1 (VRF) | Layer 1+2 (ECIES) | Layer 1+2+3 (TEE) |
|--------|----------------|---------------|-------------------|-------------------|
| Bias card distribution (pick favorable hands) | **Possible** | **Blocked** — shuffle seed = `keccak256(vrfRandomness, dealerSeed)`; neither alone controls the outcome | Blocked | Blocked |
| Read plaintext hole cards from disk | **Possible** (JSON storage) | **Possible** — server still stores plaintext | **Blocked** — only `EncryptedPayload` stored | **Blocked** — plaintext never leaves enclave |
| Read plaintext hole cards from memory | **Possible** | **Possible** | **Transient only** — present in memory for shuffle+encrypt scope | **Blocked** — enclave memory is not accessible to host OS |
| Read plaintext hole cards from logs | **Possible** | **Possible** | **Blocked** — API returns only encrypted payload | **Blocked** |
| Forge a fake commitment | Possible | Possible (if colluding with VRF) | Possible (if colluding with VRF) | **Hard** — requires breaking ECDH/AES-GCM and VRF |
| Selectively deny service to a player | Possible | Possible | Possible | Possible — liveness is out-of-scope for TEE |

**Residual risk with Layer 1+2:** Operator can see plaintext cards in memory during the `shuffle → encrypt` window (< 1 ms). Layer 3 removes this.

**Residual risk with Layer 1+2+3:** Operator cannot observe enclave memory; however, they can throttle or terminate the service (denial-of-service). This does not compromise card privacy.

---

### Attacker 2: Malicious Player (Collusion / Snooping)

**Capability:** Controls their own wallet and browser. May be colluding with another seat. Can observe the public blockchain and all API responses visible to their wallet.

| Attack | Defense |
|--------|---------|
| Read another player's hole cards via `/owner/holecards` | **Blocked** — endpoint verifies JWT session is linked to the seat owner; on-chain seat ownership check via `PlayerRegistry`/`PokerTable` |
| Replay a valid JWT to steal another player's cards | **Blocked** — JWT carries `walletAddress`; server verifies that address matches seat owner on-chain |
| Decrypt another player's `EncryptedPayload` | **Blocked** — ECIES uses per-player ephemeral ECDH; private key is derived from the player's wallet signature and never leaves the browser |
| Observe network traffic to extract plaintext | **Blocked** — only `EncryptedPayload` is transmitted over the wire in Layer 2+ |
| Brute-force encryption key from `pubKey` | **Blocked** — secp256k1 ECDLP; 128-bit security minimum |
| Impersonate another player (sign their nonce) | **Blocked** — requires knowledge of target's wallet private key |

---

### Attacker 3: VRF Provider (Randomness Manipulation)

**Capability:** Controls the source of randomness provided by `fulfillVRF`. Can choose any `vrfRandomness` value.

| Attack | Defense |
|--------|---------|
| Bias shuffle by choosing a specific `vrfRandomness` | **Blocked** — `shuffleSeed = keccak256(vrfRandomness ‖ dealerSeed)`; dealer commits to `dealerSeed` before VRF request, so VRF provider cannot predict the final shuffle even if it picks `vrfRandomness` |
| Delay or withhold VRF fulfillment | **Mitigated** — `VRF_TIMEOUT` (5 min) triggers `reRequestVRF()`; KeeperBot calls this automatically |
| Collude with dealer to choose a matching seed | **Blocked** — dealer commits to `keccak256(dealerSeed)` on-chain before VRF request; changing seed post-commitment would break the commitment check at `revealDealerSeed` |

**Assumption:** VRF provider and dealer are assumed to be non-colluding. This is a documented trust assumption. See §Residual Risks.

---

### Attacker 4: Network Observer (Passive / Active MITM)

**Capability:** Can observe, record, or modify HTTP traffic between clients and the OwnerView service. Assumes TLS is in use (mandatory for production).

| Attack | Defense |
|--------|---------|
| Eavesdrop on hole card API responses | **Blocked** — TLS in transit; payload is `EncryptedPayload` even if TLS is stripped |
| Man-in-the-middle the OwnerView service | **Mitigated** by TLS certificate pinning (recommended); Layer 3 remote attestation detects if a rogue server is substituted |
| Replay a captured encrypted payload | **Blocked** — ECIES uses ephemeral keypair per encryption; ciphertexts are not replayable; AES-GCM MAC covers all fields |
| Inject a fake `/owner/holecards` response | **Mitigated** — client can verify `commitment` against on-chain `holeCommits[handId][seatIndex]` |
| Observe public WebSocket to infer hole cards | **Blocked** — WebSocket only broadcasts public table state; hole card data is never in public streams |

---

## Residual Risks

### RR-1: Dealer–VRF Provider Collusion
**Risk:** If the dealer and VRF provider collude, they can coordinate `dealerSeed` and `vrfRandomness` to produce a predetermined shuffle.  
**Mitigation:** The dealer commits to `dealerSeed` *before* VRF fulfillment. However, a colluding VRF provider can share its *upcoming* randomness with the dealer before the commitment is submitted.  
**Status:** Open in MVP. P1 mitigation: require dealer commitment transaction to be mined *before* VRF request is issued; use strict transaction ordering enforcement.

### RR-2: Side-Channel Attacks (Future Work — TEE Layer)

> **Note:** Layer 3 (TEE / AWS Nitro Enclave) is described as a *future upgrade path* and is **not deployed** in the current MVP. The content below describes what Layer 3 would add, and what risks remain even with it.

**Current MVP (Layers 1+2 only):** The operator can observe plaintext hole cards in process memory during the `shuffle → encrypt` window (< 1 ms). The risk is real but narrow. Mitigated by: isolated process, access-controlled data directory, and ECIES encryption ensuring at-rest data is never plaintext.

**If/when Layer 3 (TEE) is added:**
- **Risk:** Timing side-channels, cache-timing, or speculative execution attacks may allow a privileged host process to partially recover enclave secrets.
- **Mitigation:** AWS Nitro Enclaves mitigate most side-channels by design (dedicated vCPUs, no shared memory).
- **Status:** Not deployed. Documented as a future mitigation path, not a current defense.

### RR-3: Client-Side Private Key Leakage
**Risk:** The derived `encryptionPrivKey` lives in browser memory. XSS, malicious browser extensions, or a compromised browser could exfiltrate it.  
**Mitigation:** The private key is never persisted (no `localStorage`, no `sessionStorage`). It lives only in a module-scope WeakRef-like closure. Scope is limited to the active tab/session.  
**Status:** Acceptable for the current MVP trust level. User is responsible for browser hygiene.

### RR-4: Dealer Seed Non-Reveal (Soft Penalty Only)
**Risk:** The dealer may refuse to reveal `dealerSeed` at showdown, preventing public shuffle verification.  
**Mitigation:** MVP uses soft enforcement — `ShuffleUnverified` event is emitted; settlement still proceeds to maintain game liveness. Hard enforcement (slashing a dealer bond) is a P1 item.  
**Status:** Accepted for MVP. Rollback to old trusted-dealer model would be equivalent. Event emission provides auditability.

### RR-5: Encryption Key Rotation During Active Hand
**Risk:** A player could attempt to rotate their encryption key mid-hand to trigger a re-deal or cause inconsistency.  
**Mitigation:** `registerEncryptionKey` reverts when a hand is in progress (any state other than `WAITING_FOR_SEATS` or `SETTLED`). Cards are encrypted to the key registered *at deal time*, stored in `HoleCardStore` keyed by `(handId, seatIndex)`.  
**Status:** Blocked by on-chain enforcement. Tested in T1.1 Foundry tests.

### RR-6: Commitment Replay Across Hands
**Risk:** An attacker could attempt to submit a valid commitment from a prior hand to a new hand.  
**Mitigation:** Commitments are keyed by `(handId, seatIndex)`. The `handId` is a monotonically incrementing counter on-chain. Cross-hand commitment replay produces a different `handId` and therefore a different commitment value.  
**Status:** Blocked by `handId` scoping.

---

## Defense Layer Summary

> **MVP deployment status:** Layers 1 and 2 are deployed. Layer 3 (TEE) is a future upgrade path — it is **not** currently deployed.

| Threat | Layer 1 (VRF) | Layer 2 (ECIES) | Layer 3 (TEE) — Future |
|--------|:---:|:---:|:---:|
| Biased shuffle by dealer | ✓ | ✓ | ✓ |
| Biased shuffle by VRF provider | ✓ | ✓ | ✓ |
| Server reads cards from disk | ✗ | ✓ | ✓ |
| Server reads cards from memory | ✗ | Partial (transient) | ✓ |
| Player reads another's cards via API | ✓ (ACL) | ✓ (ACL + encryption) | ✓ |
| Network observer reads cards in transit | ✓ (TLS) | ✓ (encrypted payload) | ✓ |
| Post-hoc shuffle fairness verification | ✓ | ✓ | ✓ |
| TEE code integrity verification | ✗ | ✗ | ✓ (attestation) |

---

## Out of Scope (MVP)

- Full MPC/ZK-based private shuffle (would eliminate trusted dealer entirely)
- Regulatory compliance or KYC/AML
- Denial-of-service resilience at infrastructure level
- Multi-table or tournament coordinator attacks
- Smart contract upgrade authority (admin key risk)
