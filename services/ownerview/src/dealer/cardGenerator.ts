import { randomBytes } from "node:crypto";
import { keccak256, encodePacked, toHex } from "viem";
import type { Card } from "../holecards/types.js";

/**
 * Total cards in a standard deck
 */
const DECK_SIZE = 52;

/**
 * Error thrown when card generation fails
 */
export class CardGeneratorError extends Error {
  constructor(message: string, public code: "INVALID_COUNT" | "GENERATION_FAILED") {
    super(message);
    this.name = "CardGeneratorError";
  }
}

/**
 * Generate a cryptographically secure random salt
 * @returns 32-byte hex string prefixed with 0x (66 characters total)
 */
export function generateSalt(): string {
  return toHex(randomBytes(32));
}

/**
 * Generate a commitment hash for hole cards using keccak256
 * commitment = keccak256(abi.encodePacked(handId, seatIndex, card1, card2, salt))
 *
 * This matches the Solidity contract's verification:
 * keccak256(abi.encodePacked(handId, seatIndex, card1, card2, salt))
 *
 * @param handId Numeric hand ID (as string, will be converted to uint256)
 * @param seatIndex Seat index at the table
 * @param cards Tuple of two card values (0-51)
 * @param salt 32-byte hex salt (with or without 0x prefix)
 * @returns keccak256 hash as 0x-prefixed hex string
 */
export function generateCommitment(
  tableId: string,
  handId: string,
  seatIndex: number,
  cards: [Card, Card],
  salt: string
): string {
  // Convert handId to BigInt for uint256 encoding
  const handIdBigInt = BigInt(handId);

  // Normalize salt to have 0x prefix
  const normalizedSalt = salt.startsWith("0x") ? salt : `0x${salt}`;

  // Use encodePacked to match Solidity's abi.encodePacked
  // keccak256(abi.encodePacked(handId, seatIndex, card1, card2, salt))
  const packed = encodePacked(
    ["uint256", "uint8", "uint8", "uint8", "bytes32"],
    [handIdBigInt, seatIndex, cards[0], cards[1], normalizedSalt as `0x${string}`]
  );

  return keccak256(packed);
}

/**
 * Generate unique random cards from a deck
 *
 * @param count Number of cards to generate (must be <= 52)
 * @param excludeCards Cards that should not be generated (already dealt)
 * @param seed Optional seed for deterministic generation (testing only)
 * @returns Array of unique card values (0-51)
 */
export function generateUniqueCards(
  count: number,
  excludeCards: Card[] = [],
  seed?: string
): Card[] {
  if (count <= 0 || count > DECK_SIZE) {
    throw new CardGeneratorError(
      `Invalid card count: ${count}. Must be between 1 and ${DECK_SIZE}`,
      "INVALID_COUNT"
    );
  }

  // Build available cards (excluding already dealt cards)
  const availableCards: Card[] = [];
  const excludeSet = new Set(excludeCards);

  for (let i = 0; i < DECK_SIZE; i++) {
    if (!excludeSet.has(i)) {
      availableCards.push(i);
    }
  }

  if (availableCards.length < count) {
    throw new CardGeneratorError(
      `Not enough available cards. Need ${count}, have ${availableCards.length}`,
      "GENERATION_FAILED"
    );
  }

  // Fisher-Yates shuffle on available cards
  const shuffled = [...availableCards];

  if (seed) {
    // Deterministic shuffle for testing
    let seedNum = 0;
    for (let i = 0; i < seed.length; i++) {
      seedNum = (seedNum * 31 + seed.charCodeAt(i)) >>> 0;
    }

    for (let i = shuffled.length - 1; i > 0; i--) {
      seedNum = (seedNum * 1103515245 + 12345) >>> 0;
      const j = seedNum % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  } else {
    // Cryptographically secure shuffle
    const randBytes = randomBytes(shuffled.length * 4);
    for (let i = shuffled.length - 1; i > 0; i--) {
      const randVal = randBytes.readUInt32BE((shuffled.length - 1 - i) * 4);
      const j = randVal % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
  }

  return shuffled.slice(0, count);
}

/**
 * Deal hole cards for all seats in a hand
 *
 * @param seatCount Number of seats to deal to
 * @param cardsPerSeat Number of cards per seat (default: 2 for Hold'em)
 * @param seed Optional seed for deterministic generation (testing only)
 * @returns Array of hole card pairs for each seat
 */
export function dealHoleCards(
  seatCount: number,
  cardsPerSeat: number = 2,
  seed?: string
): Array<[Card, Card]> {
  const totalCards = seatCount * cardsPerSeat;
  const cards = generateUniqueCards(totalCards, [], seed);

  const result: Array<[Card, Card]> = [];
  for (let i = 0; i < seatCount; i++) {
    const startIdx = i * cardsPerSeat;
    result.push([cards[startIdx], cards[startIdx + 1]]);
  }

  return result;
}

/**
 * Convert card number (0-51) to human-readable string
 * For debugging/logging purposes only - never log in production
 *
 * @param card Card number 0-51
 * @returns String like "Ac" (Ace of clubs), "Kd" (King of diamonds)
 */
export function cardToString(card: Card): string {
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const suits = ["c", "d", "h", "s"]; // clubs, diamonds, hearts, spades

  const suit = Math.floor(card / 13);
  const rank = card % 13;

  return `${ranks[rank]}${suits[suit]}`;
}
