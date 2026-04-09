// Opponent modeling types for T-1203

export interface OpponentStats {
  // Hand counts
  handsObserved: number;
  handsWentToShowdown: number;
  handsWonAtShowdown: number;

  // Preflop
  vpipHands: number;     // voluntarily put $ in pot (preflop non-SB/BB call/raise)
  pfrHands: number;      // preflop raise
  threeBetHands: number; // 3-bet preflop

  // Aggression across all streets
  betsAndRaises: number; // numerator of AF
  calls: number;         // denominator of AF

  // Post-flop
  foldToCBetOpportunities: number;
  foldedToCBet: number;
  checkRaiseOpportunities: number;
  checkRaises: number;
}

export interface OpponentProfile {
  seatIndex: number;
  sampleSize: number;    // number of hands observed

  // Core stats (as percentages 0-100 or ratios)
  vpip: number;          // % of hands voluntarily putting money in pot
  pfr: number;           // % of hands with preflop raise
  af: number;            // aggression factor = (bets+raises)/calls
  foldToCBet: number;    // % folded when faced with continuation bet
  wtsd: number;          // % went to showdown
  wsd: number;           // % won at showdown
  threeBetFreq: number;  // % of hands with 3-bet
  checkRaiseFreq: number; // % of check-raise opportunities taken

  // Derived classification
  style: OpponentStyle;
}

export type OpponentStyle =
  | "tight-passive"
  | "tight-aggressive"
  | "loose-passive"
  | "loose-aggressive"
  | "unknown";

export interface CounterAdvice {
  style: string;
  adjustments: {
    aggression: number;   // delta from base persona, range -0.2 to +0.2
    tightness: number;    // delta from base persona, range -0.2 to +0.2
    bluffFreq: number;    // delta from base persona, range -0.2 to +0.2
  };
  promptInjection: string; // text to inject into Gemini prompt
}

export interface ObservedAction {
  seatIndex: number;
  action: "fold" | "check" | "call" | "raise" | "bet";
  street: "preflop" | "flop" | "turn" | "river";
  amount?: bigint;
  facingBet: boolean;    // was there a bet/raise to face?
  isVoluntary: boolean;  // is this a voluntary action (not blind posting)?
}
