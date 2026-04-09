# OwnerView — Hole Card Encryption & Storage

> Covers the encryption scheme, storage layout, key separation, lifecycle/rotation,
> and security properties of the OwnerView hole card subsystem.

---

## Overview

Each agent's private hole cards are dealt by the OwnerView service and must be kept
secret from all other participants until showdown.  OwnerView achieves this by:

1. **Never storing plaintext cards** — only ECIES-encrypted ciphertexts are persisted.
2. **Separating the dealer seed** from the encrypted payload so that compromising the
   hole card store alone is insufficient to reconstruct cards.
3. **Using a cryptographic commitment** so that the revealed cards at showdown can be
   verified against what was committed on-chain.

---

## Encryption Scheme

### Algorithm: secp256k1 ECIES / AES-256-GCM

```
secp256k1 ECDH  →  HKDF-SHA256  →  AES-256-GCM
```

Concretely, for each seat:

| Step | Detail |
|------|--------|
| 1 | Generate ephemeral secp256k1 keypair |
| 2 | ECDH(ephemeralPrivKey, agentOperatorPubKey) → 32-byte shared secret (x-coordinate of shared point) |
| 3 | HKDF-SHA256(sharedSecret, info="railbird-holecards") → 32-byte AES-256 key |
| 4 | AES-256-GCM encrypt(`[card1, card2]`, iv=random 12 bytes) → `{ ciphertext, mac }` |
| 5 | Store `{ ephemeralPubKey, iv, ciphertext, mac }` as `EncryptedPayloadSerialized` |

All fields are hex-encoded strings (`0x`-prefixed) in the stored JSON.

### Decryption

Only the holder of the agent operator private key can decrypt:

```
ECDH(operatorPrivKey, ephemeralPubKey) → sharedSecret
HKDF-SHA256(sharedSecret) → aesKey
AES-256-GCM decrypt(ciphertext, iv, mac, aesKey) → [card1, card2]
```

### Key sizes

| Field | Size |
|-------|------|
| `ephemeralPubKey` | 33 bytes (compressed secp256k1) |
| `iv` | 12 bytes (AES-GCM nonce) |
| `ciphertext` | 2 bytes (one byte per card, 0–51) |
| `mac` | 16 bytes (AES-GCM authentication tag) |

---

## Storage Layout

### Production (file-based)

```
$HOLECARD_DATA_DIR/
  {tableAddress}_{handId}.json   ← one file per hand
```

Each file is a JSON array of `HoleCardRecord` objects — one entry per seated player.

```json
[
  {
    "tableId": "0xabc...",
    "handId": "42",
    "seatIndex": 0,
    "encryptedCards": {
      "ephemeralPubKey": "0x02...",
      "iv": "0x...",
      "ciphertext": "0x...",
      "mac": "0x..."
    },
    "salt": "0x...",
    "commitment": "0x...",
    "createdAt": 1712345678901,
    "vrfRandomness": "123456789"
  }
]
```

### Test (in-memory)

When `HoleCardStore` is constructed without a `dataDir`, all records live in a
`Map<string, HoleCardRecord>` keyed as `"tableId:handId:seatIndex"`.

---

## Key Separation: Hole Cards vs. Dealer Seed

`HoleCardRecord` deliberately **omits** the `dealerSeed`.  The dealer seed is stored
separately in `DealerSeedStore` (same service, different file/in-memory map).

```
HoleCardStore  ──►  ECIES-encrypted cards + salt + commitment + vrfRandomness
DealerSeedStore ──► plaintext dealer seed (AES-256 key used during dealing)
```

An attacker who exfiltrates only the hole card files **cannot** reconstruct plaintext
cards before showdown without also obtaining:

- The agent operator private key (to ECIES-decrypt), **and**
- The dealer seed (for `verifiableShuffle()` consistency checks).

At showdown, plaintext is reconstructed from `vrfRandomness` (stored in the record)
plus `dealerSeed` via `verifiableShuffle()`, allowing independent verification.

---

## Commitment & Showdown Verification

When cards are dealt, OwnerView computes:

```
commitment = keccak256(handId ‖ seatIndex ‖ card1 ‖ card2 ‖ salt)
```

The `commitment` and `salt` are stored in `HoleCardRecord`.  At showdown:

1. The on-chain `HandSettled` event triggers card reveal.
2. OwnerView calls `verifiableShuffle(vrfRandomness, dealerSeed)` to reconstruct cards.
3. The recomputed commitment is compared to the stored one — mismatch aborts the reveal.
4. The revealed cards are broadcast to the indexer/frontend.

---

## Lifecycle & Rotation

### Retention policy

`HoleCardStore.deleteOlderThan(maxAgeMs)` removes records whose `createdAt` is older
than the cutoff.  The default retention window is **7 days** (`7 * 24 * 60 * 60 * 1000`).
This is called on a scheduled interval by the OwnerView main loop.

### Idempotency

`HoleCardStore.set()` throws `HoleCardError("ALREADY_EXISTS")` if a record for the
same `(tableId, handId, seatIndex)` already exists — preventing double-dealing.

### Path traversal protection

`handFilePath()` rejects any `tableId` or `handId` containing `/`, `\`, or `.`,
and additionally validates that the resolved path starts with `dataDir`.

---

## Configuration

| Env var | Default | Purpose |
|---------|---------|---------|
| `HOLECARD_DATA_DIR` | `/data/holecards` (set in Docker) | Persistent storage directory |
| `HOLECARD_RETENTION_MS` | `604800000` (7 days) | Records older than this are pruned |

---

## Threat Model Summary

| Threat | Mitigation |
|--------|-----------|
| Hole card file exfiltration | ECIES encryption — no plaintext stored |
| Dealer seed exfiltration | Stored separately; alone insufficient |
| Replay / double-dealing | `ALREADY_EXISTS` idempotency check |
| Path traversal | Input sanitization + resolved-path prefix check |
| Pre-showdown card reconstruction | Requires operator privkey + dealer seed |
| Post-hand data retention | Automatic pruning after retention window |

For full threat modelling see [`docs/threat-model.md`](./threat-model.md).
