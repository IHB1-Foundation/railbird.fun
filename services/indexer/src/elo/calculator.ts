// ELO rating calculator for poker AI agent ranking.
//
// Applies standard ELO formula pairwise across all participants.
// For N-player hands: winner beats all others (actual=1); others lose to winner (actual=0).

import type { HandParticipant, EloUpdate } from "./types.js";

const INITIAL_RATING = 1500;
const K_EARLY = 32;   // first 100 hands
const K_STABLE = 16;  // after 100 hands
const K_THRESHOLD = 100;

/**
 * Expected score for a player against an opponent using ELO formula.
 * E = 1 / (1 + 10^((opponentRating - myRating) / 400))
 */
export function expectedScore(myRating: number, opponentRating: number): number {
  return 1 / (1 + Math.pow(10, (opponentRating - myRating) / 400));
}

/** K-factor based on number of hands played (BEFORE this hand). */
export function kFactor(handsPlayed: number): number {
  return handsPlayed < K_THRESHOLD ? K_EARLY : K_STABLE;
}

/**
 * Compute ELO rating delta for a single match (one player vs one opponent).
 * actual: 1 = win, 0 = loss, 0.5 = draw.
 */
export function computeDelta(
  myRating: number,
  opponentRating: number,
  actual: number,
  handsPlayed: number
): number {
  const K = kFactor(handsPlayed);
  const expected = expectedScore(myRating, opponentRating);
  return K * (actual - expected);
}

/**
 * Compute all ELO updates for a hand with N participants.
 *
 * Rules:
 *   - winnerSeatIndex: the hand winner gets actual=1 against every other participant.
 *   - All non-winners get actual=0 against the winner.
 *   - Non-winners don't get pairwise updates between themselves (only winner/loser pairs).
 *
 * currentRatings: map of tokenAddress → current rating (default 1500 if missing)
 * currentHandsPlayed: map of tokenAddress → hands played so far (before this hand)
 */
export function computeHandEloUpdates(
  participants: HandParticipant[],
  winnerSeatIndex: number,
  currentRatings: Map<string, number>,
  currentHandsPlayed: Map<string, number>
): EloUpdate[] {
  if (participants.length < 2) return [];

  const winner = participants.find((p) => p.seatIndex === winnerSeatIndex);
  if (!winner) return [];

  const losers = participants.filter((p) => p.seatIndex !== winnerSeatIndex);

  const getRating = (addr: string) => currentRatings.get(addr) ?? INITIAL_RATING;
  const getHands = (addr: string) => currentHandsPlayed.get(addr) ?? 0;

  // Accumulate deltas per player (winner gets +delta for each loser; losers get -delta for winner)
  const deltaMap = new Map<string, number>();

  for (const loser of losers) {
    const wRating = getRating(winner.tokenAddress);
    const lRating = getRating(loser.tokenAddress);

    // Winner delta vs this loser
    const wDelta = computeDelta(wRating, lRating, 1, getHands(winner.tokenAddress));
    // Loser delta vs winner
    const lDelta = computeDelta(lRating, wRating, 0, getHands(loser.tokenAddress));

    deltaMap.set(winner.tokenAddress, (deltaMap.get(winner.tokenAddress) ?? 0) + wDelta);
    deltaMap.set(loser.tokenAddress, (deltaMap.get(loser.tokenAddress) ?? 0) + lDelta);
  }

  return participants.map((p) => {
    const ratingBefore = getRating(p.tokenAddress);
    const delta = deltaMap.get(p.tokenAddress) ?? 0;
    const ratingAfter = Math.max(100, Math.round((ratingBefore + delta) * 100) / 100);
    return {
      tokenAddress: p.tokenAddress,
      ratingBefore,
      ratingAfter,
      kFactor: kFactor(getHands(p.tokenAddress)),
    };
  });
}
