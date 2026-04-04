# Migration Guide — Trustless Dealer Protocol

This guide covers migrating from the original **trusted dealer** setup (plaintext hole cards)
to the **trustless dealer** protocol (verifiable shuffle + ECIES encryption).

---

## Background

The trustless dealer protocol adds three layers of defense:

| Layer | What it prevents |
|-------|-----------------|
| **Verifiable Shuffle** (VRF + dealer seed) | Server cannot bias card distribution |
| **ECIES Per-Player Encryption** | Server never stores/transmits plaintext hole cards |
| **TEE (optional)** | Even server memory is inaccessible to the operator |

After migration, hole cards are encrypted on the server with each player's public key.
Only the key-holder can decrypt their own cards client-side.

---

## Feature Flag

All new behavior is gated behind `TRUSTLESS_DEALER_ENABLED`:

```
TRUSTLESS_DEALER_ENABLED=false  # default — legacy mode, automatic dealing disabled
TRUSTLESS_DEALER_ENABLED=true   # new protocol — verifiable shuffle + ECIES
```

**Default is `false`** — safe by default, explicit opt-in required.

---

## Prerequisites

Before enabling `TRUSTLESS_DEALER_ENABLED=true`, ensure:

1. **PokerTable contract** is deployed with the trustless dealer additions:
   - `registerEncryptionKey()` function (T1.1)
   - `submitDealerSeedCommit()` / `revealDealerSeed()` functions (T1.2)
   - `holeCardVRFRandomness` mapping populated by VRF callback (T1.3)

2. **All players** (human wallets + bot agents) have registered ECIES public keys on-chain
   via `registerEncryptionKey(seatIndex, pubKey)`.

3. **Web app and bot agents** are updated to support client-side ECIES decryption.

4. **OwnerView service** has `RPC_URL` and `POKER_TABLE_ADDRESS` configured
   (needed to read on-chain encryption keys and VRF randomness).

---

## Migration Steps

### Step 1 — Deploy updated contracts

```bash
cd contracts
forge script script/Deploy.s.sol --broadcast --rpc-url $RPC_URL
```

Verify `registerEncryptionKey`, `holeCardVRFRandomness`, and `dealerSeedCommits` exist:

```bash
cast call $POKER_TABLE_ADDRESS "getEncryptionKey(uint8)(bytes)" 0
```

### Step 2 — Update the web app

Deploy the updated frontend (includes wallet-derived key pair + client-side decrypt).

Players will be prompted to sign once to derive their encryption key pair.
The public key is registered on-chain automatically when they (re)join a seat.

### Step 3 — Update bot agents

Redeploy agents with the updated `bots/agent` code.
On startup each agent will:
1. Derive its encryption key from the wallet private key.
2. Call `registerEncryptionKey()` on-chain (skipped if already registered).

### Step 4 — Enable the flag in OwnerView

Add to your OwnerView environment:

```env
TRUSTLESS_DEALER_ENABLED=true
```

Restart the service. Startup logs should show:

```
[OwnerView] Trustless dealer protocol ENABLED (verifiable shuffle + ECIES)
[DealerEventListener] Started watching HandStarted events ... [trustless-dealer: ENABLED]
```

### Step 5 — Verify

Start a new hand. Check:

- `GET /owner/holecards` returns `encryptedCards` (not `cards`).
- The stored hole card JSON files contain no plaintext card values.
- Players can decrypt their cards in the UI.
- At showdown, `DealerSeedRevealed` event is emitted and shuffle verification passes.

---

## Applying to Existing Tables

No migration of in-progress hands is required.

- The new protocol applies **from the next hand forward** after the flag is enabled.
- In-flight hands dealt before the flag was enabled will continue to work normally
  (the API still serves stored data in whatever format it was stored).
- Players must have encryption keys registered **before** a hand begins;
  if a key is missing the dealer will skip that seat (or skip the whole hand,
  depending on configuration).

---

## Rollback

To revert to legacy mode at any time:

```env
TRUSTLESS_DEALER_ENABLED=false
```

Restart the OwnerView service. The event listener will stop automatic dealing immediately.
Existing hand data is unaffected — encrypted records remain intact.

If a hand is in progress when you roll back, operators can deal manually via:

```
POST /dealer/deal
```

(Requires `DEALER_API_KEY` authentication.)

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `No encryption keys registered — skipping deal` | Player hasn't registered key | Player re-joins seat or calls `registerEncryptionKey` directly |
| `Hole card VRF not fulfilled yet` | VRF callback hasn't landed | Wait for VRF; keeper bot retries automatically |
| `getHoleCards()` throws "Decryption failed" | Key mismatch or data corruption | Verify client derived same key (deterministic from same wallet + message) |
| `ShuffleUnverified` event on-chain | Dealer didn't call `revealDealerSeed` | Investigate OwnerView logs; dealer service should auto-reveal at showdown |
| `ShuffleIntegrityViolation` event on-chain | Tampered dealer seed or cards | Critical security incident — investigate immediately |

---

## Security Notes

- **Never** commit `TRUSTLESS_DEALER_ENABLED=true` to plaintext config files checked into version control.
  Use environment variables or secrets management.
- The `DEALER_API_KEY` must be rotated if compromised; it protects the `/dealer/deal` endpoint.
- With the trustless dealer enabled, the OwnerView operator cannot read hole cards from disk
  (only encrypted blobs are stored). However, without TEE (Layer 3), the plaintext cards
  exist briefly in server memory during the shuffle+encrypt step.
  See `docs/threat-model.md` for the full threat analysis.
