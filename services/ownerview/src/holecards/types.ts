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
 * Stored hole card record
 */
export interface HoleCardRecord {
  tableId: string;
  handId: string;
  seatIndex: number;
  cards: [Card, Card];
  salt: string;
  /** keccak256(tableId, handId, seatIndex, cards, salt) */
  commitment: string;
  createdAt: number;
}
