# Protocol Specification: Trustless Dealer

## Overview

This document is the authoritative specification for Railbird's Trustless Dealer protocol. An independent implementer should be able to build a compatible dealer and verifier from this document alone.

**Version:** 1.0  
**Date:** 2026-04-04

---

## 1. Cryptographic Primitives

### 1.1 Hash Function

All hashing uses **Keccak-256** (Ethereum standard, not SHA3-256). Byte encoding follows Solidity `abi.encodePacked` semantics (tightly packed, no length prefix).

### 1.2 ECIES Parameters

| Parameter | Value |
|-----------|-------|
| Curve | secp256k1 |
| Key agreement | ECDH with ephemeral keypair |
| KDF | HKDF-SHA256, salt = `"Railbird-ECIES-v1"`, info = `""` |
| KDF output | 64 bytes → first 32 bytes = AES key, last 32 bytes = MAC key (unused with GCM) |
| Symmetric cipher | AES-256-GCM |
| IV / nonce | 12 bytes, cryptographically random |
| Authentication tag | 16 bytes (GCM default) |
| Public key format | Compressed secp256k1 (33 bytes, prefix `0x02` or `0x03`) |

### 1.3 Key Derivation (Player Encryption Key)

```typescript
// Fixed message — never changes across versions for a given key version
const MESSAGE = "Railbird Encryption Key Derivation v1"

// Step 1: wallet signs the fixed message (EIP-191 personal_sign)
const signature: Uint8Array = await wallet.signMessage(MESSAGE)

// Step 2: derive private key
const privKey: Uint8Array = keccak256(signature)  // 32 bytes

// Step 3: derive public key (compressed)
const pubKey: Uint8Array = secp256k1.getPublicKey(privKey, /*compressed=*/true)  // 33 bytes
```

**Security note:** The derived private key is never stored or transmitted. It lives only in browser memory for the duration of the session.

---

## 2. Deterministic Verifiable Shuffle

### 2.1 Card Encoding

Cards are encoded as integers `0–51`:

```
card = suit * 13 + rank
suit: 0=Clubs, 1=Diamonds, 2=Hearts, 3=Spades
rank: 0=2, 1=3, ..., 9=J, 10=Q, 11=K, 12=A
```

Examples: `0` = 2♣, `12` = A♣, `13` = 2♦, `51` = A♠

### 2.2 Shuffle Seed Derivation

```typescript
// vrfRandomness: uint256, represented as big-endian 32-byte Uint8Array
// dealerSeed: bytes32, 32-byte Uint8Array

function deriveShuffleSeed(vrfRandomness: bigint, dealerSeed: Uint8Array): Uint8Array {
  const packed = new Uint8Array(64)
  // abi.encodePacked(uint256, bytes32) — big-endian uint256, then raw bytes32
  const vrfBytes = bigintToBytes32BE(vrfRandomness)
  packed.set(vrfBytes, 0)
  packed.set(dealerSeed, 32)
  return keccak256(packed)  // 32 bytes
}
```

### 2.3 Fisher-Yates Shuffle (Reference Implementation)

```typescript
function verifiableShuffle(vrfRandomness: bigint, dealerSeed: Uint8Array): number[] {
  const shuffleSeed: Uint8Array = deriveShuffleSeed(vrfRandomness, dealerSeed)
  
  // Initialize deck [0..51]
  const deck: number[] = Array.from({ length: 52 }, (_, i) => i)

  // Fisher-Yates from index 51 down to 1
  for (let i = 51; i >= 1; i--) {
    // Derive step randomness: keccak256(abi.encodePacked(shuffleSeed, uint256(i)))
    const stepInput = new Uint8Array(64)
    stepInput.set(shuffleSeed, 0)
    stepInput.set(bigintToBytes32BE(BigInt(i)), 32)
    const stepHash: bigint = bytesToBigint(keccak256(stepInput))

    // j ∈ [0, i] inclusive — modulo reduction
    const j: number = Number(stepHash % BigInt(i + 1))

    // Swap deck[i] and deck[j]
    ;[deck[i], deck[j]] = [deck[j], deck[i]]
  }

  return deck  // deck[0..51], all 52 cards, no duplicates
}
```

**Critical invariant:** The same `(vrfRandomness, dealerSeed)` pair **must** produce the **exact same** shuffled deck across TypeScript (off-chain) and Solidity (on-chain) implementations.

### 2.4 Hole Card Assignment

```typescript
function extractHoleCards(
  deck: number[],
  seatIndexes: number[]
): Map<number, [number, number]> {
  const result = new Map<number, [number, number]>()
  for (const seatIndex of seatIndexes) {
    result.set(seatIndex, [deck[seatIndex * 2], deck[seatIndex * 2 + 1]])
  }
  return result
}
```

Seat 0 receives cards at positions 0 and 1, seat 1 at positions 2 and 3, etc.  
Maximum 9 seats → uses deck positions 0–17. Positions 18–51 are unused in the MVP.

### 2.5 Test Vectors

The following vectors **must** be reproduced exactly by any conforming implementation:

**Vector 1**
```
vrfRandomness = 0x0000000000000000000000000000000000000000000000000000000000000001
dealerSeed    = 0x0000000000000000000000000000000000000000000000000000000000000001
shuffleSeed   = keccak256(0x0000...0001 ++ 0x0000...0001)
deck[0]       = (verify with implementation)
deck[1]       = (verify with implementation)
```

**Vector 2**
```
vrfRandomness = 0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef
dealerSeed    = 0xcafebabecafebabecafebabecafebabecafebabecafebabecafebabecafebabe
shuffleSeed   = keccak256(0xdeadbeef... ++ 0xcafebabe...)
```

**Vector 3** (zero inputs)
```
vrfRandomness = 0x0000000000000000000000000000000000000000000000000000000000000000
dealerSeed    = 0x0000000000000000000000000000000000000000000000000000000000000000
shuffleSeed   = keccak256(0x0000...0000 ++ 0x0000...0000)
```

Exact expected deck arrays are computed and fixed during T2.1 unit tests and must be committed alongside the implementation.

---

## 3. Deal Flow (Per Hand)

### 3.1 Step-by-Step

```
Step 1: HandStarted event emitted on-chain
        → DealerService (off-chain) subscribes and receives event

Step 2: Players register encryption public keys (one-time, before first hand)
        On-chain: registerEncryptionKey(seatIndex, compressedPubKey)
        Emits: EncryptionKeyRegistered(seatIndex, pubKey)

Step 3: Dealer generates and commits dealerSeed
        dealerSeed = crypto.randomBytes(32)
        dealerSeedCommit = keccak256(dealerSeed)
        Tx: submitDealerSeedCommit(handId, dealerSeedCommit)
        Emits: DealerSeedCommitted(handId, dealerSeedCommit)

Step 4: VRF requested for hole card shuffle (separate from community card VRF)
        Happens automatically in startHand() → HAND_INIT → WAITING_VRF_HOLECARDS
        vrfRandomness received in fulfillHoleCardVRF(requestId, randomness)
        State transitions to: WAITING_FOR_HOLECARDS

Step 5: Dealer computes shuffle (off-chain)
        shuffleSeed = keccak256(abi.encodePacked(vrfRandomness, dealerSeed))
        deck = verifiableShuffle(vrfRandomness, dealerSeed)
        holeCards[seat_i] = (deck[i*2], deck[i*2+1])

Step 6: Dealer encrypts each seat's cards
        For each active seat i:
          pubKey_i = getEncryptionKey(seatIndex_i)  // read from on-chain
          salt_i   = crypto.randomBytes(32)
          encryptedCards_i = ECIES.encrypt(pubKey_i, [card1, card2])
          commitment_i = keccak256(abi.encodePacked(handId, seatIndex_i, card1, card2, salt_i))

Step 7: Dealer submits commitments on-chain
        For each seat: submitHoleCommit(handId, seatIndex_i, commitment_i)
        Emits: HoleCommitSubmitted(handId, seatIndex, commitment)

Step 8: OwnerView stores encrypted cards + salt (NO plaintext cards)
        HoleCardStore.set(handId, seatIndex, { encryptedCards, commitment, salt })
        Plaintext cards are immediately set to null in memory

Step 9: Owner fetches their encrypted cards
        GET /owner/holecards?tableId=&handId=&seatIndex=
        Auth: JWT with wallet address verified against seat owner on-chain
        Response: { encryptedCards: { ephemeralPubKey, iv, ciphertext }, commitment }

Step 10: Player decrypts locally
         encryptionPrivKey = keccak256(wallet.sign("Railbird Encryption Key Derivation v1"))
         [card1, card2] = ECIES.decrypt(encryptionPrivKey, encryptedCards)
```

### 3.2 Showdown

```
Step 11: Game reaches SHOWDOWN state

Step 12: Dealer reveals seed on-chain
         Tx: revealDealerSeed(handId, dealerSeed)
         Verifies: keccak256(dealerSeed) == dealerSeedCommits[handId]
         Emits: DealerSeedRevealed(handId, dealerSeed)

Step 13: Players reveal hole cards (as before)
         Each player calls revealHoleCards(handId, seatIndex, card1, card2, salt)
         Verifies: keccak256(handId, seatIndex, card1, card2, salt) == holeCommits[handId][seatIndex]

Step 14: On-chain shuffle verification (optional but recommended)
         ShuffleVerifier.verifyShuffleAndHoleCards(
           vrfRandomness, dealerSeed, seatCount, handId,
           [(card1_0, card2_0, salt_0), (card1_1, card2_1, salt_1), ...]
         )
         Returns true if shuffle is consistent with all revealed cards

Step 15: Settlement proceeds
         HandSettled(handId, winnerSeat, potAmount) emitted
```

---

## 4. On-Chain Data Structures

### 4.1 New State in PokerTable.sol

```solidity
// Player encryption public keys (compressed secp256k1, 33 bytes)
mapping(uint8 => bytes) public encryptionKeys;   // seatIndex => pubKey

// Dealer seed commit/reveal per hand
mapping(uint256 => bytes32) public dealerSeedCommits;   // handId => keccak256(seed)
mapping(uint256 => bytes32) public dealerSeedReveals;   // handId => revealed seed

// Hole card VRF randomness
mapping(uint256 => uint256) public holeCardVRFRandomness;  // handId => randomness
uint256 public pendingHoleCardVRFRequestId;
```

### 4.2 New Game States

```
HAND_INIT → WAITING_VRF_HOLECARDS → WAITING_FOR_HOLECARDS → BETTING_PRE → ...
```

`WAITING_VRF_HOLECARDS` is inserted between `HAND_INIT` and `WAITING_FOR_HOLECARDS`.

### 4.3 New Events

```solidity
event EncryptionKeyRegistered(uint8 indexed seatIndex, bytes pubKey);
event DealerSeedCommitted(uint256 indexed handId, bytes32 commitment);
event DealerSeedRevealed(uint256 indexed handId, bytes32 seed);
event HoleCardVRFFulfilled(uint256 indexed handId, uint256 randomness);
event ShuffleUnverified(uint256 indexed handId);
event ShuffleIntegrityViolation(uint256 indexed handId);
```

---

## 5. ECIES Implementation Details

### 5.1 Encrypt

```typescript
interface EncryptedPayload {
  ephemeralPubKey: Uint8Array   // compressed, 33 bytes
  iv: Uint8Array                // 12 bytes
  ciphertext: Uint8Array        // variable length (2 card bytes + 16 byte GCM tag)
}

function encryptHoleCards(
  recipientPubKey: Uint8Array,   // compressed secp256k1
  cards: [number, number]        // [card1, card2], each 0–51
): EncryptedPayload {
  // 1. Generate ephemeral keypair
  const ephemeralPriv = randomBytes(32)
  const ephemeralPub = secp256k1.getPublicKey(ephemeralPriv, /*compressed=*/true)

  // 2. ECDH shared secret
  const sharedPoint = secp256k1.getSharedSecret(ephemeralPriv, recipientPubKey)
  const sharedSecret = sharedPoint.slice(1, 33)  // x-coordinate only (32 bytes)

  // 3. KDF: HKDF-SHA256
  const { key } = hkdf(sha256, sharedSecret, "Railbird-ECIES-v1", "", 32)
  
  // 4. Encrypt plaintext = [cards[0], cards[1]] (2 bytes)
  const plaintext = Uint8Array.from(cards)
  const iv = randomBytes(12)
  const ciphertext = aesGcm.encrypt(key, iv, plaintext)  // returns ciphertext + 16-byte tag

  return { ephemeralPubKey: ephemeralPub, iv, ciphertext }
}
```

### 5.2 Decrypt

```typescript
function decryptHoleCards(
  recipientPrivKey: Uint8Array,  // 32 bytes
  payload: EncryptedPayload
): [number, number] {
  // 1. ECDH shared secret
  const sharedPoint = secp256k1.getSharedSecret(recipientPrivKey, payload.ephemeralPubKey)
  const sharedSecret = sharedPoint.slice(1, 33)

  // 2. KDF
  const { key } = hkdf(sha256, sharedSecret, "Railbird-ECIES-v1", "", 32)

  // 3. Decrypt + verify GCM tag (throws on auth failure — no silent corruption)
  const plaintext = aesGcm.decrypt(key, payload.iv, payload.ciphertext)

  return [plaintext[0], plaintext[1]]
}
```

---

## 6. On-chain Verification (ShuffleVerifier.sol)

### 6.1 Solidity Fisher-Yates

```solidity
function _deriveShuffleSeed(
    uint256 vrfRandomness,
    bytes32 dealerSeed
) internal pure returns (bytes32) {
    return keccak256(abi.encodePacked(vrfRandomness, dealerSeed));
}

function _shuffle(uint256 vrfRandomness, bytes32 dealerSeed)
    internal pure returns (uint8[52] memory deck)
{
    bytes32 shuffleSeed = _deriveShuffleSeed(vrfRandomness, dealerSeed);

    // Initialize deck
    for (uint8 i = 0; i < 52; i++) {
        deck[i] = i;
    }

    // Fisher-Yates descending
    for (uint256 i = 51; i >= 1; i--) {
        bytes32 stepHash = keccak256(abi.encodePacked(shuffleSeed, i));
        uint256 j = uint256(stepHash) % (i + 1);
        uint8 tmp = deck[i];
        deck[i] = deck[j];
        deck[j] = tmp;
    }
}
```

### 6.2 Verification Function

```solidity
function verifyShuffleAndHoleCards(
    uint256 vrfRandomness,
    bytes32 dealerSeed,
    uint8 seatCount,
    uint256 handId,
    uint8[] calldata card1s,
    uint8[] calldata card2s,
    bytes32[] calldata salts
) external pure returns (bool) {
    require(card1s.length == seatCount && card2s.length == seatCount);

    uint8[52] memory deck = _shuffle(vrfRandomness, dealerSeed);

    for (uint8 seat = 0; seat < seatCount; seat++) {
        // Verify shuffle positions
        require(deck[seat * 2]     == card1s[seat], "card1 mismatch");
        require(deck[seat * 2 + 1] == card2s[seat], "card2 mismatch");
        // Verify commitments
        bytes32 expectedCommit = keccak256(
            abi.encodePacked(handId, seat, card1s[seat], card2s[seat], salts[seat])
        );
        require(
            expectedCommit == /* holeCommits[handId][seat] */ bytes32(0), // caller must provide
            "commitment mismatch"
        );
    }
    return true;
}
```

### 6.3 Gas Estimation

For a 9-seat shuffle verification:

| Operation | Approx Gas |
|-----------|-----------|
| `_shuffle()` (52 iterations, each with keccak256) | ~130,000 |
| Commitment verification × 9 | ~20,000 |
| **Total estimate** | **~150,000** |

This is well within the target of < 500,000 gas (< 1.5% of a 32M block gas limit).

---

## 7. Error Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| `registerEncryptionKey` called during active hand | Revert: `"EncKeyReg: hand in progress"` |
| Invalid pubKey length | Revert: `"EncKeyReg: invalid pubKey length"` |
| `submitDealerSeedCommit` called twice for same hand | Revert: `"DealerSeed: already committed"` |
| `revealDealerSeed` called before SHOWDOWN | Revert: `"DealerSeed: not in showdown"` |
| `revealDealerSeed` with wrong seed | Revert: `"DealerSeed: commitment mismatch"` |
| ECIES decrypt with wrong private key | Throw: AES-GCM authentication tag mismatch |
| ECIES decrypt with tampered ciphertext | Throw: AES-GCM authentication tag mismatch |
| Shuffle verification with wrong cards | Revert: `"card1 mismatch"` or `"card2 mismatch"` |

---

## 8. Compatibility and Versioning

- Key derivation message: `"Railbird Encryption Key Derivation v1"` — changing this constitutes a breaking change requiring all players to re-register keys.
- ECIES KDF salt: `"Railbird-ECIES-v1"` — changing this constitutes a breaking change.
- Shuffle algorithm: any change to the Fisher-Yates step hash input or ordering is a breaking change; existing commitments would no longer verify.
- All breaking changes must bump the on-chain contract version and emit a `ProtocolVersionUpdated` event.
