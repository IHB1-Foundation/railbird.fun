import type { HoleCardStore } from "../holecards/index.js";
import type { DealParams, DealResult, DealerConfig } from "./types.js";
import { dealHoleCards, generateSalt, generateCommitment } from "./cardGenerator.js";

/**
 * Error thrown when dealing fails
 */
export class DealerError extends Error {
  constructor(
    message: string,
    public code: "ALREADY_DEALT" | "DEAL_FAILED" | "INVALID_PARAMS"
  ) {
    super(message);
    this.name = "DealerError";
  }
}

/**
 * Number of seats at the table (heads-up)
 */
const SEAT_COUNT = 2;

/**
 * Dealer service responsible for generating and storing hole cards
 *
 * Security notes:
 * - Cards are generated with cryptographically secure randomness
 * - Each seat gets a unique salt for their commitment
 * - Commitments can be verified on-chain at showdown
 * - Cards are never logged or exposed in public APIs
 */
export class DealerService {
  private holeCardStore: HoleCardStore;
  private config: DealerConfig;

  constructor(holeCardStore: HoleCardStore, config: DealerConfig = {}) {
    this.holeCardStore = holeCardStore;
    this.config = config;
  }

  /**
   * Deal hole cards for a new hand
   *
   * This should be called when a HandStarted event is received.
   * It generates 2 unique hole cards for each seat and stores them.
   *
   * @param params The table and hand identifiers
   * @returns Deal result with commitments for on-chain submission
   * @throws DealerError if cards already dealt or generation fails
   */
  deal(params: DealParams): DealResult {
    const { tableId, handId } = params;

    // Validate params
    if (!tableId || !handId) {
      throw new DealerError(
        "tableId and handId are required",
        "INVALID_PARAMS"
      );
    }

    // Check if already dealt for this hand
    if (this.holeCardStore.has(tableId, handId, 0)) {
      throw new DealerError(
        `Hole cards already dealt for table=${tableId}, hand=${handId}`,
        "ALREADY_DEALT"
      );
    }

    // Generate unique hole cards for all seats
    const holeCards = dealHoleCards(SEAT_COUNT, 2, this.config.testSeed);

    const seats: DealResult["seats"] = [];

    for (let seatIndex = 0; seatIndex < SEAT_COUNT; seatIndex++) {
      const cards = holeCards[seatIndex];
      const salt = this.config.testSeed
        ? `test-salt-${seatIndex}-${this.config.testSeed}`
        : generateSalt();
      const commitment = generateCommitment(tableId, handId, seatIndex, cards, salt);

      // Store in hole card store
      this.holeCardStore.set({
        tableId,
        handId,
        seatIndex,
        cards,
        salt,
        commitment,
        createdAt: Date.now(),
      });

      // Return commitment (but never salt or cards in public result)
      seats.push({
        seatIndex,
        cards,
        commitment,
      });
    }

    return {
      tableId,
      handId,
      seats,
    };
  }

  /**
   * Get commitments for a hand (for on-chain submission)
   *
   * @param tableId Table identifier
   * @param handId Hand identifier
   * @returns Array of commitments for each seat, or null if not dealt
   */
  getCommitments(tableId: string, handId: string): Array<{ seatIndex: number; commitment: string }> | null {
    const records = this.holeCardStore.getHand(tableId, handId);

    if (records.length === 0) {
      return null;
    }

    return records.map((record) => ({
      seatIndex: record.seatIndex,
      commitment: record.commitment,
    }));
  }

  /**
   * Get reveal data for a seat (for showdown)
   *
   * @param tableId Table identifier
   * @param handId Hand identifier
   * @param seatIndex Seat index
   * @returns Cards and salt for on-chain reveal, or null if not found
   */
  getRevealData(
    tableId: string,
    handId: string,
    seatIndex: number
  ): { cards: [number, number]; salt: string } | null {
    const record = this.holeCardStore.get(tableId, handId, seatIndex);

    if (!record) {
      return null;
    }

    return {
      cards: record.cards,
      salt: record.salt,
    };
  }

  /**
   * Check if a hand has been dealt
   */
  isHandDealt(tableId: string, handId: string): boolean {
    return this.holeCardStore.has(tableId, handId, 0);
  }

  /**
   * Clean up hole cards for a completed hand
   *
   * Should be called after hand settlement and any reveal period
   */
  cleanupHand(tableId: string, handId: string): number {
    return this.holeCardStore.deleteHand(tableId, handId);
  }
}
