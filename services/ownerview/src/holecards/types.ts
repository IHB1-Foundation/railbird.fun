/**
 * Hole card representation (0-51 card encoding)
 * 0-12: Clubs (2-A)
 * 13-25: Diamonds (2-A)
 * 26-38: Hearts (2-A)
 * 39-51: Spades (2-A)
 */
export type Card = number;

/**
 * Hole cards for a seat (2 cards)
 */
export interface HoleCards {
  cards: [Card, Card];
}

/**
 * JSON-serializable form of an ECIES encrypted payload.
 * All Uint8Array fields are hex-encoded strings (0x-prefixed).
 */
export interface EncryptedPayloadSerialized {
  ephemeralPubKey: string; // 0x + 66 hex chars (33 bytes compressed pubKey)
  iv: string;              // 0x + 24 hex chars (12 bytes nonce)
  ciphertext: string;      // 0x-prefixed hex
  mac: string;             // 0x + 32 hex chars (16 bytes GCM tag)
}

/**
 * Stored hole card record — no plaintext cards, no dealer seed.
 *
 * Cards are stored exclusively in ECIES-encrypted form.
 * At showdown, plaintext is reconstructed from vrfRandomness + dealerSeed
 * via verifiableShuffle(). The dealerSeed is stored SEPARATELY in
 * DealerSeedStore so that breaching this file alone is insufficient to
 * reconstruct hole cards before showdown.
 */
export interface HoleCardRecord {
  tableId: string;
  handId: string;
  seatIndex: number;
  encryptedCards: EncryptedPayloadSerialized;
  salt: string;           // 0x-prefixed hex bytes32, kept for commitment reveal
  commitment: string;     // keccak256(handId, seatIndex, card1, card2, salt)
  createdAt: number;
  vrfRandomness: string;  // bigint as decimal string (for showdown reconstruction)
  // NOTE: dealerSeed intentionally absent — stored separately in DealerSeedStore.
}
