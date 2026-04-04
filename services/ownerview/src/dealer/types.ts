import type { EncryptedPayloadSerialized } from "../holecards/types.js";

/**
 * Parameters for dealing a hand using the verifiable shuffle + ECIES protocol.
 */
export interface DealParams {
  tableId: string;
  handId: string;
  /** VRF randomness from on-chain holeCardVRFRandomness[handId] */
  vrfRandomness: bigint;
  /** Dealer's randomly generated seed (bytes32, 0x-prefixed) */
  dealerSeed: `0x${string}`;
  /**
   * Per-seat ECIES encryption public keys (compressed secp256k1, 33 bytes).
   * Map from seat index to public key bytes.
   * Only seats present in this map will be dealt.
   */
  encryptionKeys: Map<number, Uint8Array>;
}

/**
 * Result of dealing hole cards — no plaintext cards exposed.
 */
export interface DealResult {
  tableId: string;
  handId: string;
  /** keccak256(dealerSeed) — submit this on-chain via submitDealerSeedCommit() */
  dealerSeedCommit: string;
  seats: Array<{
    seatIndex: number;
    encryptedCards: EncryptedPayloadSerialized;
    commitment: string;
  }>;
}

/**
 * Configuration for the dealer service
 */
export interface DealerConfig {
  /**
   * Fixed dealer seed for testing (bypasses random seed generation).
   * Must be 0x-prefixed 32-byte hex.
   * In production, this should not be set (uses crypto.randomBytes).
   */
  testDealerSeed?: `0x${string}`;
}

/**
 * HandStarted event data from the PokerTable contract
 */
export interface HandStartedEvent {
  handId: bigint;
  smallBlind: bigint;
  bigBlind: bigint;
  buttonSeat: number;
}
