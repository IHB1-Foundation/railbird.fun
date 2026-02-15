import type { Card } from "../holecards/types.js";

/**
 * Parameters for dealing a hand
 */
export interface DealParams {
  tableId: string;
  handId: string;
  /**
   * Optional explicit seat indexes to deal.
   * If omitted, dealer uses configured default seat count.
   */
  seatIndexes?: number[];
}

/**
 * Result of dealing hole cards to all seats
 */
export interface DealResult {
  tableId: string;
  handId: string;
  seats: Array<{
    seatIndex: number;
    cards: [Card, Card];
    commitment: string;
  }>;
}

/**
 * Configuration for the dealer service
 */
export interface DealerConfig {
  /**
   * Optional seed for deterministic card generation (for testing)
   * In production, this should not be set (uses crypto.randomBytes)
   */
  testSeed?: string;
  /**
   * Default seat count when DealParams.seatIndexes is omitted.
   * Defaults to 4 to keep local test/dev behavior stable.
   */
  defaultSeatCount?: number;
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
