// Simple rule-based strategy for agent bot
// MVP: legal actions + basic hand strength heuristics

import type { Strategy, DecisionContext, ActionDecision, HoleCards, ReasoningFactors } from "./types.js";
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
    const myCurrentBet = tableState.seats[mySeatIndex].currentBet;
    const pot = tableState.hand.pot;
    const bigBlind = tableState.bigBlind;

    // Compute the effective amount still needed to call from this seat,
    // using the table state (consistent snapshot) rather than the raw
    // amountToCall which may have been read at a slightly different time.
    // effectiveCallAmount = max(0, currentBet - myCurrentBet)
    const effectiveCallAmount = tableState.hand.currentBet > myCurrentBet
      ? tableState.hand.currentBet - myCurrentBet
      : 0n;

    // All-in scenario: if the net call amount exceeds my remaining stack,
    // calling means going all-in for myStack chips.
    // The contract accepts partial all-in calls, so this is always legal.
    const isAllInCall = effectiveCallAmount > myStack && myStack > 0n;

    // Position description
    const position = describeSimplePosition(mySeatIndex, tableState.buttonSeat, tableState.seats.length);

    // If we don't have hole cards, play very conservatively
    if (!holeCards) {
      const factors: ReasoningFactors = {
        handStrength: "unknown (no hole cards)",
        potOdds: effectiveCallAmount > 0n
          ? `${Number(effectiveCallAmount * 100n / (pot + effectiveCallAmount))}%`
          : "n/a",
        position,
        opponentRead: "Rule-based: no opponent modeling",
      };
      if (canCheck) {
        return { action: Decision.CHECK, reasoning: "No hole cards — checking to stay in hand for free.", factors };
      }
      if (isAllInCall) {
        return { action: Decision.FOLD, reasoning: "No hole cards — folding all-in call to avoid committing stack blind.", factors };
      }
      if (effectiveCallAmount <= bigBlind) {
        return { action: Decision.CALL, reasoning: "No hole cards — calling small bet (≤BB) speculatively.", factors };
      }
      return { action: Decision.FOLD, reasoning: "No hole cards — folding to large bet.", factors };
    }

    const handScore = scoreHoleCards(holeCards);
    const potOddsRatio = effectiveCallAmount > 0n ? Number(pot) / Number(effectiveCallAmount) : 999;
    const potOddsPercent = effectiveCallAmount > 0n
      ? `${Number(effectiveCallAmount * 100n / (pot + effectiveCallAmount))}%`
      : "n/a (no bet)";

    // Build hand strength description from score + bonuses
    const handStrengthDesc = describeHandScore(handScore, holeCards);

    const basefactors: ReasoningFactors = {
      handStrength: `score ${handScore}/100 — ${handStrengthDesc}`,
      potOdds: potOddsPercent,
      position,
      opponentRead: "Rule-based: no opponent modeling",
    };

    // All-in call: use a higher threshold (commit entire stack only with strong hands)
    if (isAllInCall) {
      if (handScore >= 70) {
        return {
          action: Decision.CALL,
          reasoning: `Hand score ${handScore}/100 (strong). Calling all-in with ${handStrengthDesc}.`,
          factors: { ...basefactors, riskAssessment: "committing full stack — strong hand justifies it" },
        };
      }
      return {
        action: Decision.FOLD,
        reasoning: `Hand score ${handScore}/100 (medium/weak). Folding all-in — not strong enough to commit stack.`,
        factors: { ...basefactors, riskAssessment: "folding to avoid committing stack with marginal hand" },
      };
    }

    // Can check - never fold when free
    if (canCheck) {
      if (handScore >= 70 && Math.random() < this.aggression) {
        const raiseAmount = this.calculateRaiseAmount(tableState, mySeatIndex);
        if (raiseAmount !== null) {
          return {
            action: Decision.RAISE,
            raiseAmount,
            reasoning: `Hand score ${handScore}/100 (strong). Raising for value with ${handStrengthDesc}. Aggression ${this.aggression.toFixed(2)}.`,
            factors: { ...basefactors, sizing: `raise to ${raiseAmount} (pot-sized)`, riskAssessment: "low — strong hand, check raise for value" },
          };
        }
      }
      return {
        action: Decision.CHECK,
        reasoning: `Hand score ${handScore}/100. Checking — ${handScore >= 70 ? "conserving aggression factor" : "hand not strong enough to raise"}.`,
        factors: basefactors,
      };
    }

    // Must call or fold
    const betSizeRatio = Number(effectiveCallAmount) / Number(bigBlind);

    // Strong hand (60+): usually call, sometimes raise
    if (handScore >= 60) {
      if (handScore >= 80 && Math.random() < this.aggression * 1.5) {
        const raiseAmount = this.calculateRaiseAmount(tableState, mySeatIndex);
        if (raiseAmount !== null) {
          return {
            action: Decision.RAISE,
            raiseAmount,
            reasoning: `Hand score ${handScore}/100 (very strong). Re-raising with ${handStrengthDesc} for value.`,
            factors: { ...basefactors, sizing: `raise to ${raiseAmount}`, riskAssessment: "low — premium hand" },
          };
        }
      }
      return {
        action: Decision.CALL,
        reasoning: `Hand score ${handScore}/100 (strong). Calling with ${handStrengthDesc}. Stack ${myStack} vs call ${effectiveCallAmount} (${(Number(effectiveCallAmount) / Number(myStack) * 100).toFixed(1)}% of stack).`,
        factors: basefactors,
      };
    }

    // Medium hand (40-60): call if pot odds are good
    if (handScore >= 40) {
      if (potOddsRatio >= 2 || betSizeRatio <= 3) {
        return {
          action: Decision.CALL,
          reasoning: `Hand score ${handScore}/100 (medium). Calling — pot odds ratio ${potOddsRatio.toFixed(1)} is favorable or bet size ${betSizeRatio.toFixed(1)}x BB is small.`,
          factors: { ...basefactors, riskAssessment: "medium — marginal hand but good odds" },
        };
      }
      return {
        action: Decision.FOLD,
        reasoning: `Hand score ${handScore}/100 (medium). Folding — pot odds ratio ${potOddsRatio.toFixed(1)} unfavorable and bet ${betSizeRatio.toFixed(1)}x BB is large.`,
        factors: { ...basefactors, riskAssessment: "medium — folding marginal hand to large bet" },
      };
    }

    // Weak hand (<40): fold unless very small bet
    if (betSizeRatio <= 1 && potOddsRatio >= 4) {
      return {
        action: Decision.CALL,
        reasoning: `Hand score ${handScore}/100 (weak). Calling micro-bet — bet is only ${betSizeRatio.toFixed(1)}x BB with pot odds ${potOddsRatio.toFixed(1)}.`,
        factors: { ...basefactors, riskAssessment: "low cost speculative call" },
      };
    }

    return {
      action: Decision.FOLD,
      reasoning: `Hand score ${handScore}/100 (weak). Folding — hand too weak for call of ${effectiveCallAmount} chips.`,
      factors: { ...basefactors, riskAssessment: "folding weak hand to bet" },
    };
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

function describeHandScore(score: number, cards: HoleCards): string {
  const rank1 = getRank(cards.card1);
  const rank2 = getRank(cards.card2);
  const isPair = rank1 === rank2;
  const isSuited = Math.floor(cards.card1 / 13) === Math.floor(cards.card2 / 13);
  const high = Math.max(rank1, rank2);
  const low = Math.min(rank1, rank2);
  const gap = high - low;

  if (isPair) {
    const rankNames = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];
    return `pair of ${rankNames[high]}s`;
  }
  const tags: string[] = [];
  if (high === 12) tags.push("ace-high");
  if (isSuited) tags.push("suited");
  if (gap <= 2) tags.push("connected");
  if (score >= 70) tags.push("strong");
  else if (score >= 50) tags.push("medium");
  else tags.push("weak");
  return tags.join(", ") || "unpaired";
}

function describeSimplePosition(seatIndex: number, buttonSeat: number, numSeats: number): string {
  const relative = (seatIndex - buttonSeat + numSeats) % numSeats;
  if (relative === 0) return "BTN";
  if (relative === 1) return "SB";
  if (relative === 2) return "BB";
  if (relative === numSeats - 1) return "CO";
  return `UTG+${relative - 3}`;
}

// Export helper for testing
export { scoreHoleCards, cardName, getRank, getSuit };
