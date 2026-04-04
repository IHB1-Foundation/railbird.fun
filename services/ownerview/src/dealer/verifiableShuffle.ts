import { keccak256, encodePacked } from "viem";
import type { Card } from "../holecards/types.js";

const DECK_SIZE = 52;

/**
 * Compute the shuffle seed from VRF randomness and dealer seed.
 * shuffleSeed = keccak256(abi.encodePacked(vrfRandomness, dealerSeed))
 *
 * This must produce the same result as the Solidity on-chain verifier.
 */
export function computeShuffleSeed(
  vrfRandomness: bigint,
  dealerSeed: `0x${string}`
): `0x${string}` {
  const packed = encodePacked(
    ["uint256", "bytes32"],
    [vrfRandomness, dealerSeed]
  );
  return keccak256(packed);
}

/**
 * Deterministic Fisher-Yates shuffle of a standard 52-card deck.
 *
 * For each step i (from 51 down to 1):
 *   stepHash = keccak256(abi.encodePacked(shuffleSeed, uint256(i)))
 *   j = uint256(stepHash) % (i + 1)
 *   swap deck[i] and deck[j]
 *
 * This is bit-exact with the Solidity ShuffleVerifier implementation.
 *
 * @param vrfRandomness On-chain VRF randomness for the hole card shuffle
 * @param dealerSeed Dealer's revealed seed (bytes32, 0x-prefixed)
 * @returns Full 52-card deck after shuffle
 */
export function verifiableShuffle(
  vrfRandomness: bigint,
  dealerSeed: `0x${string}`
): Card[] {
  const shuffleSeed = computeShuffleSeed(vrfRandomness, dealerSeed);

  // Initialize ordered deck 0..51
  const deck: Card[] = Array.from({ length: DECK_SIZE }, (_, i) => i);

  // Fisher-Yates in-place shuffle (i from DECK_SIZE-1 down to 1)
  for (let i = DECK_SIZE - 1; i > 0; i--) {
    // stepHash = keccak256(abi.encodePacked(shuffleSeed, uint256(i)))
    const packed = encodePacked(
      ["bytes32", "uint256"],
      [shuffleSeed, BigInt(i)]
    );
    const stepHash = keccak256(packed);
    // j = stepHash mod (i+1)
    const stepVal = BigInt(stepHash);
    const j = Number(stepVal % BigInt(i + 1));

    // Swap deck[i] and deck[j]
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }

  return deck;
}

/**
 * Extract hole cards for each seat from a shuffled deck.
 * Seat i gets cards deck[i*2] and deck[i*2+1].
 *
 * @param deck Full 52-card shuffled deck
 * @param seatIndexes Array of seat indexes to deal (typically 0..N-1)
 * @returns Map from seatIndex to [card1, card2]
 */
export function extractHoleCards(
  deck: Card[],
  seatIndexes: number[]
): Map<number, [Card, Card]> {
  const result = new Map<number, [Card, Card]>();

  for (let i = 0; i < seatIndexes.length; i++) {
    const seatIndex = seatIndexes[i];
    result.set(seatIndex, [deck[i * 2], deck[i * 2 + 1]]);
  }

  return result;
}
