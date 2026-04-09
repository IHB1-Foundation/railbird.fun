// CounterStrategyAdvisor — advises counter-strategy based on opponent profile
// T-1203: Opponent Modeling & Adaptive Counter-Strategy

import type { OpponentProfile, CounterAdvice } from "./types.js";

export class CounterStrategyAdvisor {
  /**
   * Produce counter-strategy advice based on opponent profile.
   * Returns delta adjustments relative to the base persona.
   */
  advise(profile: OpponentProfile): CounterAdvice {
    switch (profile.style) {
      case "tight-passive":
        return {
          style: "Tight-Passive (Nit)",
          adjustments: {
            aggression: +0.15,
            tightness: -0.10,
            bluffFreq: +0.15,
          },
          promptInjection:
            "Opponent is TIGHT-PASSIVE (nit). Steal blinds aggressively — they fold too often. Their raises mean REAL strength, fold your marginal hands to their aggression. " +
            "Bluff freely on coordinated boards. Open wide from late position. They will not punish you.",
        };

      case "loose-aggressive":
        return {
          style: "Loose-Aggressive (LAG)",
          adjustments: {
            aggression: -0.10,
            tightness: +0.15,
            bluffFreq: -0.20,
          },
          promptInjection:
            "Opponent is LOOSE-AGGRESSIVE (maniac). Tighten your range — play only strong hands. " +
            "Trap with big hands: slow-play and let them bluff into you. Never bluff — they call or re-raise. " +
            "Call down lighter with medium-strength hands. Let them do the betting.",
        };

      case "tight-aggressive":
        return {
          style: "Tight-Aggressive (TAG)",
          adjustments: {
            aggression: 0,
            tightness: +0.10,
            bluffFreq: +0.10,
          },
          promptInjection:
            "Opponent is TIGHT-AGGRESSIVE (TAG). Respect their raises — they have it. 3-bet polarized: very strong hands or pure bluffs. " +
            "Exploit their fold-to-3bet: 3-bet their opens more. Avoid calling too wide postflop. " +
            "Attack when they show weakness (check behind, small bet). Play position aggressively.",
        };

      case "loose-passive":
        return {
          style: "Loose-Passive (Calling Station)",
          adjustments: {
            aggression: +0.10,
            tightness: 0,
            bluffFreq: -0.20,
          },
          promptInjection:
            "Opponent is LOOSE-PASSIVE (calling station). Value bet WIDE — they call with weak hands. " +
            "Never bluff — they will call you down. Size your value bets larger. " +
            "Isolate them with strong hands. Do not slow-play; keep betting for value.",
        };

      case "unknown":
      default:
        return {
          style: "Unknown",
          adjustments: {
            aggression: 0,
            tightness: 0,
            bluffFreq: 0,
          },
          promptInjection:
            "Insufficient data on opponent (fewer than 5 hands observed). " +
            "Play standard GTO-leaning strategy. Gather information — note how they react to bets, check-raises, and 3-bets.",
        };
    }
  }

  /**
   * Format opponent read for injection into Gemini prompt.
   */
  formatPromptSection(seatIndex: number, opponentName: string, profile: OpponentProfile, advice: CounterAdvice): string {
    if (profile.style === "unknown") {
      return `=== OPPONENT READ (Seat ${seatIndex}) ===\n${advice.promptInjection}\n===`;
    }
    return [
      `=== OPPONENT READ (Seat ${seatIndex}: ${opponentName}) ===`,
      `Style: ${advice.style} player`,
      `Stats (over ${profile.sampleSize} hands): VPIP ${profile.vpip.toFixed(0)}%, PFR ${profile.pfr.toFixed(0)}%, AF ${profile.af.toFixed(1)}, Fold-to-CBet ${profile.foldToCBet.toFixed(0)}%`,
      `Counter-strategy: ${advice.promptInjection}`,
      `Recommended adjustments: aggression ${advice.adjustments.aggression >= 0 ? "+" : ""}${advice.adjustments.aggression.toFixed(2)}, tightness ${advice.adjustments.tightness >= 0 ? "+" : ""}${advice.adjustments.tightness.toFixed(2)}, bluffFreq ${advice.adjustments.bluffFreq >= 0 ? "+" : ""}${advice.adjustments.bluffFreq.toFixed(2)}`,
      "===",
    ].join("\n");
  }
}
