import { randomBytes } from "node:crypto";
import { toHex, keccak256 } from "viem";
import type { HoleCardStore } from "../holecards/index.js";
import type { Card, EncryptedPayloadSerialized } from "../holecards/types.js";
import type { DealParams, DealResult, DealerConfig } from "./types.js";
import { generateSalt, generateCommitment } from "./cardGenerator.js";
import { verifiableShuffle, extractHoleCards } from "./verifiableShuffle.js";
import { encryptHoleCards } from "./eciesEncrypt.js";
import type { EncryptedPayload } from "./eciesEncrypt.js";
import { DealerSeedStore } from "./dealerSeedStore.js";

/**
 * Serialize EncryptedPayload (Uint8Array fields) to JSON-safe hex strings.
 */
function serializePayload(payload: EncryptedPayload): EncryptedPayloadSerialized {
  return {
    ephemeralPubKey: toHex(payload.ephemeralPubKey),
    iv: toHex(payload.iv),
    ciphertext: toHex(payload.ciphertext),
    mac: toHex(payload.mac),
  };
}

/**
 * Error thrown when dealing fails
 */
export class DealerError extends Error {
  constructor(
    message: string,
    public code: "ALREADY_DEALT" | "DEAL_FAILED" | "INVALID_PARAMS" | "MISSING_ENCRYPTION_KEY"
  ) {
    super(message);
    this.name = "DealerError";
  }
}

/**
 * Dealer service — verifiable shuffle + ECIES encryption.
 *
 * Security properties:
 * - Plaintext hole cards never stored (only ECIES-encrypted form)
 * - Shuffle is deterministic from VRF randomness + dealer seed
 * - Dealer seed is committed on-chain before dealing; revealed at showdown
 * - Post-showdown verification: anyone can reconstruct the shuffle from on-chain data
 * - Memory lifetime of plaintext cards is limited to the encrypt() call scope
 */
export class DealerService {
  private holeCardStore: HoleCardStore;
  private seedStore: DealerSeedStore;
  private config: DealerConfig;

  constructor(holeCardStore: HoleCardStore, seedStore: DealerSeedStore, config: DealerConfig = {}) {
    this.holeCardStore = holeCardStore;
    this.seedStore = seedStore;
    this.config = config;
  }

  /**
   * Deal hole cards for a new hand using verifiable shuffle + ECIES encryption.
   *
   * Flow:
   *   1. Compute deck = verifiableShuffle(vrfRandomness, dealerSeed)
   *   2. For each seat: extract cards, encrypt with seat's public key
   *   3. Store encryptedCards + salt + commitment + reveal params in HoleCardStore
   *   4. Plaintext cards are discarded after encrypt() returns
   *
   * @param params Deal parameters including VRF randomness, dealer seed, and per-seat encryption keys
   * @returns Commitments + encrypted cards for all seats (no plaintext)
   */
  async deal(params: DealParams): Promise<DealResult> {
    const { tableId, handId, vrfRandomness, dealerSeed, encryptionKeys } = params;

    if (!tableId || !handId) {
      throw new DealerError("tableId and handId are required", "INVALID_PARAMS");
    }

    if (encryptionKeys.size === 0) {
      throw new DealerError("No encryption keys provided — cannot deal", "INVALID_PARAMS");
    }

    // Check if already dealt (idempotency)
    if ((await this.holeCardStore.getHand(tableId, handId)).length > 0) {
      throw new DealerError(
        `Hole cards already dealt for table=${tableId}, hand=${handId}`,
        "ALREADY_DEALT"
      );
    }

    // Use test seed if configured, otherwise generate random
    const resolvedDealerSeed = this.config.testDealerSeed ?? dealerSeed;

    // Compute the on-chain commitment to the dealer seed
    const dealerSeedCommit = keccak256(resolvedDealerSeed);

    // Store dealer seed in the SEPARATE seed store before doing anything else.
    // This ensures the seed is persisted even if the deal process is interrupted.
    this.seedStore.set(tableId, handId, resolvedDealerSeed);

    // Deterministic shuffle: deck[0..51] derived from VRF + dealer seed
    const deck = verifiableShuffle(vrfRandomness, resolvedDealerSeed);

    // Extract hole cards for each seat (seat i gets deck[i*2], deck[i*2+1])
    const seatIndexes = Array.from(encryptionKeys.keys()).sort((a, b) => a - b);
    const holeCardsMap = extractHoleCards(deck, seatIndexes);

    const resultSeats: DealResult["seats"] = [];

    for (let i = 0; i < seatIndexes.length; i++) {
      const seatIndex = seatIndexes[i];
      const pubKey = encryptionKeys.get(seatIndex);

      if (!pubKey) {
        throw new DealerError(
          `Missing encryption key for seat ${seatIndex}`,
          "MISSING_ENCRYPTION_KEY"
        );
      }

      const cards = holeCardsMap.get(seatIndex)!;

      // Encrypt: plaintext cards exist only during this call
      const encryptedPayload: EncryptedPayload = await encryptHoleCards(pubKey, cards);
      const encryptedCards: EncryptedPayloadSerialized = serializePayload(encryptedPayload);

      const salt = generateSalt();
      const commitment = generateCommitment(tableId, handId, seatIndex, cards, salt);

      // Store only encrypted form — no plaintext, no dealer seed.
      // The dealer seed is stored separately in DealerSeedStore.
      await this.holeCardStore.set({
        tableId,
        handId,
        seatIndex,
        encryptedCards,
        salt,
        commitment,
        createdAt: Date.now(),
        vrfRandomness: vrfRandomness.toString(),
      });

      resultSeats.push({ seatIndex, encryptedCards, commitment });
    }

    return { tableId, handId, dealerSeedCommit, seats: resultSeats };
  }

  /**
   * Get commitments for a hand (for on-chain submission).
   */
  async getCommitments(tableId: string, handId: string): Promise<Array<{ seatIndex: number; commitment: string }> | null> {
    const records = await this.holeCardStore.getHand(tableId, handId);
    if (records.length === 0) return null;
    return records.map((r) => ({ seatIndex: r.seatIndex, commitment: r.commitment }));
  }

  /**
   * Get reveal data for a seat at showdown.
   *
   * Reconstructs plaintext cards from on-chain data (vrfRandomness + dealerSeed)
   * using the verifiable shuffle. The salt is retrieved from storage.
   *
   * @returns { cards, salt, dealerSeed, vrfRandomness } or null if not found
   */
  async getRevealData(
    tableId: string,
    handId: string,
    seatIndex: number
  ): Promise<{ cards: [Card, Card]; salt: string; dealerSeed: string; vrfRandomness: string } | null> {
    const record = await this.holeCardStore.get(tableId, handId, seatIndex);
    if (!record) return null;

    // Retrieve dealer seed from the separate seed store.
    const dealerSeed = this.seedStore.get(tableId, handId) as `0x${string}` | null;
    if (!dealerSeed) return null;

    // Reconstruct plaintext cards from shuffle (no plaintext stored)
    const vrfRandomness = BigInt(record.vrfRandomness);
    const deck = verifiableShuffle(vrfRandomness, dealerSeed);

    // Find position of this seat in the stored records (by order of seatIndexes)
    const handRecords = await this.holeCardStore.getHand(tableId, handId);
    const seatPosition = handRecords.findIndex((r) => r.seatIndex === seatIndex);
    if (seatPosition === -1) return null;

    const cards: [Card, Card] = [deck[seatPosition * 2], deck[seatPosition * 2 + 1]];

    return { cards, salt: record.salt, dealerSeed, vrfRandomness: record.vrfRandomness };
  }

  /**
   * Get the encrypted cards for a seat (for owner retrieval).
   */
  async getEncryptedCards(
    tableId: string,
    handId: string,
    seatIndex: number
  ): Promise<EncryptedPayloadSerialized | null> {
    const record = await this.holeCardStore.get(tableId, handId, seatIndex);
    return record?.encryptedCards ?? null;
  }

  /**
   * Check if a hand has been dealt.
   */
  async isHandDealt(tableId: string, handId: string): Promise<boolean> {
    return (await this.holeCardStore.getHand(tableId, handId)).length > 0;
  }

  /**
   * Clean up hole cards for a completed hand.
   */
  async cleanupHand(tableId: string, handId: string): Promise<number> {
    return this.holeCardStore.deleteHand(tableId, handId);
  }

  /**
   * Generate a random dealer seed (32 bytes, 0x-prefixed).
   */
  static generateDealerSeed(): `0x${string}` {
    return toHex(randomBytes(32));
  }
}
