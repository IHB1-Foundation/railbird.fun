// Simple rule-based strategy for agent bot
// MVP: legal actions + basic hand strength heuristics

import type { Strategy, DecisionContext, ActionDecision, HoleCards } from "./types.js";
import { Decision } from "./types.js";
import { GameState, type TableState } from "../chain/client.js";

/**
 * Card encoding: 0-51
 * suit = Math.floor(card / 13): 0=spades, 1=hearts, 2=diamonds, 3=clubs
 * rank = card % 13: 0=2, 1=3, ..., 8=T, 9=J, 10=Q, 11=K, 12=A
 */
function getRank(card: number): number {
  return card % 13;
}

function getSuit(card: number): number {
  return Math.floor(card / 13);
}

function rankName(rank: number): string {
  const names = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  return names[rank];
}

function cardName(card: number): string {
  const suits = ["s", "h", "d", "c"];
  return rankName(getRank(card)) + suits[getSuit(card)];
}

/**
 * Simple hand strength scoring (0-100)
 * Higher = stronger hand
 */
function scoreHoleCards(cards: HoleCards): number {
  const rank1 = getRank(cards.card1);
  const rank2 = getRank(cards.card2);
  const suit1 = getSuit(cards.card1);
  const suit2 = getSuit(cards.card2);

  const highRank = Math.max(rank1, rank2);
  const lowRank = Math.min(rank1, rank2);
  const isPair = rank1 === rank2;
  const isSuited = suit1 === suit2;
  const gap = highRank - lowRank;

  // Base score from high card (0-12 -> 10-35)
  let score = 10 + highRank * 2;

  // Pair bonus (AA=100, KK=90, ..., 22=50)
  if (isPair) {
    score = 50 + highRank * 4;
    if (highRank >= 12) score = 100; // AA
    if (highRank >= 11) score = Math.max(score, 90); // KK
    if (highRank >= 10) score = Math.max(score, 80); // QQ
    return score;
  }

  // Suited bonus
  if (isSuited) {
    score += 8;
  }

  // Connectivity bonus (potential for straights)
  if (gap <= 4) {
    score += (5 - gap) * 2;
  }

  // High card combos (AK, AQ, KQ, etc.)
  if (highRank === 12) {
    // Ace high
    score += 10;
    if (lowRank >= 11) score += 15; // AK
    if (lowRank >= 10) score += 10; // AQ
    if (lowRank >= 9) score += 5; // AJ
  } else if (highRank === 11) {
    // King high
    if (lowRank >= 10) score += 10; // KQ
    if (lowRank >= 9) score += 5; // KJ
  }

  return Math.min(score, 100);
}

/**
 * Simple strategy implementation
 * - Never fold if can check (free card)
 * - With strong hands (60+): raise or call
 * - With medium hands (40-60): call small bets, fold large
 * - With weak hands (<40): fold to bets, check if free
 */
export class SimpleStrategy implements Strategy {
  // Configurable aggression factor (0 = passive, 1 = aggressive)
  private aggression: number;

  constructor(aggression: number = 0.3) {
    this.aggression = Math.max(0, Math.min(1, aggression));
  }

  decide(context: DecisionContext): ActionDecision {
    const { tableState, mySeatIndex, holeCards, canCheck, amountToCall } = context;
    const myStack = tableState.seats[mySeatIndex].stack;
    const pot = tableState.hand.pot;
    const bigBlind = tableState.bigBlind;

    // If we don't have hole cards, play very conservatively
    if (!holeCards) {
      if (canCheck) {
        return { action: Decision.CHECK };
      }
      // Call small bets, fold large ones
      if (amountToCall <= bigBlind) {
        return { action: Decision.CALL };
      }
      return { action: Decision.FOLD };
    }

    const handScore = scoreHoleCards(holeCards);
    const potOdds = amountToCall > 0n ? Number(pot) / Number(amountToCall) : 999;

    // Can check - never fold when free
    if (canCheck) {
      // Consider raising with strong hands
      if (handScore >= 70 && Math.random() < this.aggression) {
        const raiseAmount = this.calculateRaiseAmount(tableState, mySeatIndex);
        if (raiseAmount !== null) {
          return { action: Decision.RAISE, raiseAmount };
        }
      }
      return { action: Decision.CHECK };
    }

    // Must call or fold
    const betSizeRatio = Number(amountToCall) / Number(bigBlind);

    // Strong hand (60+): usually call, sometimes raise
    if (handScore >= 60) {
      if (handScore >= 80 && Math.random() < this.aggression * 1.5) {
        const raiseAmount = this.calculateRaiseAmount(tableState, mySeatIndex);
        if (raiseAmount !== null) {
          return { action: Decision.RAISE, raiseAmount };
        }
      }
      return { action: Decision.CALL };
    }

    // Medium hand (40-60): call if pot odds are good
    if (handScore >= 40) {
      if (potOdds >= 2 || betSizeRatio <= 3) {
        return { action: Decision.CALL };
      }
      return { action: Decision.FOLD };
    }

    // Weak hand (<40): fold unless very small bet
    if (betSizeRatio <= 1 && potOdds >= 4) {
      return { action: Decision.CALL };
    }

    return { action: Decision.FOLD };
  }

  private calculateRaiseAmount(
    tableState: TableState,
    seatIndex: number
  ): bigint | null {
    const currentBet = tableState.hand.currentBet;
    const bigBlind = tableState.bigBlind;
    const myStack = tableState.seats[seatIndex].stack;
    const myCurrentBet = tableState.seats[seatIndex].currentBet;

    // Minimum raise target is 2x current table bet (or 2x big blind when unopened)
    const minRaise = currentBet === 0n ? bigBlind * 2n : currentBet * 2n;

    // Raise 2-3x the current bet (pot-sized raise)
    const pot = tableState.hand.pot;
    let raiseTarget = currentBet + pot / 2n;

    // Ensure at least min raise
    if (raiseTarget < minRaise) {
      raiseTarget = minRaise;
    }

    // Check if we have enough stack
    const additional = raiseTarget - myCurrentBet;
    if (additional > myStack) {
      // Can't afford, go all-in or don't raise
      const allInRaise = myCurrentBet + myStack;
      if (allInRaise > minRaise) {
        return allInRaise;
      }
      return null;
    }

    return raiseTarget;
  }
}

// Export helper for testing
export { scoreHoleCards, cardName, getRank, getSuit };
