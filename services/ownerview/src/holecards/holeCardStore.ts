import type { HoleCardRecord, Card } from "./types.js";

/**
 * Error thrown when hole card operations fail
 */
export class HoleCardError extends Error {
  constructor(
    message: string,
    public code:
      | "NOT_FOUND"
      | "ALREADY_EXISTS"
      | "INVALID_CARDS"
  ) {
    super(message);
    this.name = "HoleCardError";
  }
}

/**
 * In-memory store for hole cards
 * Key format: `${tableId}:${handId}:${seatIndex}`
 */
export class HoleCardStore {
  private store: Map<string, HoleCardRecord> = new Map();

  /**
   * Generate a unique key for hole card lookup
   */
  private makeKey(tableId: string, handId: string, seatIndex: number): string {
    return `${tableId}:${handId}:${seatIndex}`;
  }

  /**
   * Store hole cards for a seat
   */
  set(record: HoleCardRecord): void {
    // Validate cards are in valid range (0-51)
    for (const card of record.cards) {
      if (card < 0 || card > 51) {
        throw new HoleCardError(`Invalid card value: ${card}`, "INVALID_CARDS");
      }
    }

    const key = this.makeKey(record.tableId, record.handId, record.seatIndex);

    if (this.store.has(key)) {
      throw new HoleCardError(
        `Hole cards already exist for table=${record.tableId}, hand=${record.handId}, seat=${record.seatIndex}`,
        "ALREADY_EXISTS"
      );
    }

    this.store.set(key, record);
  }

  /**
   * Get hole cards for a seat
   */
  get(tableId: string, handId: string, seatIndex: number): HoleCardRecord | null {
    const key = this.makeKey(tableId, handId, seatIndex);
    return this.store.get(key) ?? null;
  }

  /**
   * Check if hole cards exist for a seat
   */
  has(tableId: string, handId: string, seatIndex: number): boolean {
    const key = this.makeKey(tableId, handId, seatIndex);
    return this.store.has(key);
  }

  /**
   * Delete hole cards for a seat
   */
  delete(tableId: string, handId: string, seatIndex: number): boolean {
    const key = this.makeKey(tableId, handId, seatIndex);
    return this.store.delete(key);
  }

  /**
   * Delete all hole cards for a hand
   */
  deleteHand(tableId: string, handId: string): number {
    let deleted = 0;
    for (let seatIndex = 0; seatIndex < 2; seatIndex++) {
      if (this.delete(tableId, handId, seatIndex)) {
        deleted++;
      }
    }
    return deleted;
  }

  /**
   * Get all hole cards for a hand (for dealer/reveal purposes)
   */
  getHand(tableId: string, handId: string): HoleCardRecord[] {
    const records: HoleCardRecord[] = [];
    for (let seatIndex = 0; seatIndex < 2; seatIndex++) {
      const record = this.get(tableId, handId, seatIndex);
      if (record) {
        records.push(record);
      }
    }
    return records;
  }

  /**
   * Clear all stored hole cards
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get total number of stored records
   */
  size(): number {
    return this.store.size;
  }
}
