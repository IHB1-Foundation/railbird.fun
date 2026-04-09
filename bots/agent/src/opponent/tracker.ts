// OpponentTracker — tracks per-seat poker statistics from observed actions
// T-1203: Opponent Modeling & Adaptive Counter-Strategy

import type { OpponentStats, OpponentProfile, ObservedAction, OpponentStyle } from "./types.js";

const MIN_SAMPLE_SIZE = 5;

function emptyStats(): OpponentStats {
  return {
    handsObserved: 0,
    handsWentToShowdown: 0,
    handsWonAtShowdown: 0,
    vpipHands: 0,
    pfrHands: 0,
    threeBetHands: 0,
    betsAndRaises: 0,
    calls: 0,
    foldToCBetOpportunities: 0,
    foldedToCBet: 0,
    checkRaiseOpportunities: 0,
    checkRaises: 0,
  };
}

export class OpponentTracker {
  private statsBySeat = new Map<number, OpponentStats>();

  // Per-hand state tracking (reset each hand)
  private handVpip = new Map<number, boolean>();
  private handPfr = new Map<number, boolean>();
  private handThreeBet = new Map<number, boolean>();
  private handFacedCBet = new Map<number, boolean>();
  private handCheckRaiseOpportunity = new Map<number, boolean>();

  /**
   * Observe a single player action and update statistics.
   */
  observe(action: ObservedAction): void {
    const { seatIndex, street, facingBet, isVoluntary } = action;

    if (!this.statsBySeat.has(seatIndex)) {
      this.statsBySeat.set(seatIndex, emptyStats());
    }
    const stats = this.statsBySeat.get(seatIndex)!;

    // Track preflop voluntary actions for VPIP
    if (street === "preflop" && isVoluntary) {
      if (action.action === "call" || action.action === "raise" || action.action === "bet") {
        if (!this.handVpip.get(seatIndex)) {
          this.handVpip.set(seatIndex, true);
          stats.vpipHands++;
        }
      }
    }

    // Preflop raise = PFR
    if (street === "preflop" && (action.action === "raise" || action.action === "bet")) {
      if (!this.handPfr.get(seatIndex)) {
        this.handPfr.set(seatIndex, true);
        stats.pfrHands++;
      }
      // 3-bet: raise when facing a bet preflop
      if (facingBet && !this.handThreeBet.get(seatIndex)) {
        this.handThreeBet.set(seatIndex, true);
        stats.threeBetHands++;
      }
    }

    // Aggression factor: count bets+raises vs calls
    if (action.action === "bet" || action.action === "raise") {
      stats.betsAndRaises++;
    } else if (action.action === "call") {
      stats.calls++;
    }

    // Fold to continuation bet (post-flop, facing a bet, folding)
    if (street !== "preflop" && facingBet) {
      if (!this.handFacedCBet.get(seatIndex)) {
        this.handFacedCBet.set(seatIndex, true);
        stats.foldToCBetOpportunities++;
        if (action.action === "fold") {
          stats.foldedToCBet++;
        }
      }
    }

    // Check-raise opportunity: checked post-flop, then later raised
    if (street !== "preflop" && action.action === "check") {
      this.handCheckRaiseOpportunity.set(seatIndex, true);
    }
    if (street !== "preflop" && action.action === "raise" && this.handCheckRaiseOpportunity.get(seatIndex)) {
      stats.checkRaises++;
      stats.checkRaiseOpportunities++;
      this.handCheckRaiseOpportunity.delete(seatIndex);
    }
  }

  /**
   * Call at the end of each hand to finalize per-hand stats.
   * @param handsWithShowdown seatIndex[] that went to showdown this hand
   * @param showdownWinner seatIndex that won at showdown (if any)
   */
  finalizeHand(participatingSeatIndexes: number[], handsWithShowdown?: number[], showdownWinner?: number): void {
    for (const seatIndex of participatingSeatIndexes) {
      const stats = this.statsBySeat.get(seatIndex);
      if (stats) {
        stats.handsObserved++;
      }
    }
    if (handsWithShowdown) {
      for (const seatIndex of handsWithShowdown) {
        const stats = this.statsBySeat.get(seatIndex);
        if (stats) stats.handsWentToShowdown++;
      }
    }
    if (showdownWinner !== undefined) {
      const stats = this.statsBySeat.get(showdownWinner);
      if (stats) stats.handsWonAtShowdown++;
    }
    // Reset per-hand tracking
    this.handVpip.clear();
    this.handPfr.clear();
    this.handThreeBet.clear();
    this.handFacedCBet.clear();
    this.handCheckRaiseOpportunity.clear();
  }

  /**
   * Return the current opponent profile for a seat.
   * Returns a profile with style="unknown" if sample is too small.
   */
  getProfile(seatIndex: number): OpponentProfile {
    const stats = this.statsBySeat.get(seatIndex) ?? emptyStats();
    const n = stats.handsObserved;

    if (n < MIN_SAMPLE_SIZE) {
      return {
        seatIndex,
        sampleSize: n,
        vpip: 0,
        pfr: 0,
        af: 0,
        foldToCBet: 0,
        wtsd: 0,
        wsd: 0,
        threeBetFreq: 0,
        checkRaiseFreq: 0,
        style: "unknown",
      };
    }

    const vpip = (stats.vpipHands / n) * 100;
    const pfr = (stats.pfrHands / n) * 100;
    const af = stats.calls > 0 ? stats.betsAndRaises / stats.calls : stats.betsAndRaises;
    const foldToCBet = stats.foldToCBetOpportunities > 0
      ? (stats.foldedToCBet / stats.foldToCBetOpportunities) * 100
      : 0;
    const wtsd = stats.handsObserved > 0 ? (stats.handsWentToShowdown / n) * 100 : 0;
    const wsd = stats.handsWentToShowdown > 0 ? (stats.handsWonAtShowdown / stats.handsWentToShowdown) * 100 : 0;
    const threeBetFreq = (stats.threeBetHands / n) * 100;
    const checkRaiseFreq = stats.checkRaiseOpportunities > 0
      ? (stats.checkRaises / stats.checkRaiseOpportunities) * 100
      : 0;

    const style = classifyStyle(vpip, af);

    return {
      seatIndex,
      sampleSize: n,
      vpip,
      pfr,
      af,
      foldToCBet,
      wtsd,
      wsd,
      threeBetFreq,
      checkRaiseFreq,
      style,
    };
  }

  getSampleSize(seatIndex: number): number {
    return this.statsBySeat.get(seatIndex)?.handsObserved ?? 0;
  }

  /** Reset all data for a seat (e.g., new opponent sits down). */
  resetSeat(seatIndex: number): void {
    this.statsBySeat.delete(seatIndex);
  }
}

function classifyStyle(vpip: number, af: number): OpponentStyle {
  const isTight = vpip < 25;
  const isAggressive = af >= 2.0;

  if (isTight && isAggressive) return "tight-aggressive";
  if (isTight && !isAggressive) return "tight-passive";
  if (!isTight && isAggressive) return "loose-aggressive";
  if (!isTight && !isAggressive) return "loose-passive";
  return "unknown";
}
