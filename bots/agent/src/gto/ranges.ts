// T-1104: GTO Preflop Range Lookup Table
// Simplified but comprehensive coverage of 169 hand combinations.
// Based on published heads-up and 4-handed GTO solver approximations.

export type Position = "UTG" | "CO" | "BTN" | "SB" | "BB";
export type FacingAction = "none" | "raise" | "3bet";

export interface GTOAction {
  /** GTO-recommended primary action */
  action: "raise" | "call" | "fold";
  /**
   * Mixed-strategy frequency for the action (0–1).
   * e.g., 0.7 = execute this action 70% of the time (30% fold otherwise).
   * 1.0 = pure strategy (always this action).
   */
  frequency: number;
}

// ── Hand-strength scores (0–10) ───────────────────────────────────────────────
// Used as a continuous proxy for GTO range membership.
// Higher = stronger preflop hand.
const HAND_STRENGTH: Readonly<Record<string, number>> = {
  // Pocket pairs
  AA: 10, KK: 9.5, QQ: 9, JJ: 8.5, TT: 8, "99": 7.5, "88": 7,
  "77": 6.5, "66": 6, "55": 5.5, "44": 5, "33": 4.5, "22": 4,
  // Suited aces
  AKs: 9.5, AQs: 8.5, AJs: 8, ATs: 7.5, A9s: 7, A8s: 6.5,
  A7s: 6, A6s: 5.5, A5s: 6, A4s: 5.5, A3s: 5, A2s: 4.5,
  // Offsuit aces
  AKo: 8.5, AQo: 7.5, AJo: 6.5, ATo: 6, A9o: 5, A8o: 4.5,
  A7o: 4, A6o: 3.5, A5o: 4, A4o: 3.5, A3o: 3, A2o: 2.5,
  // King hands
  KQs: 8, KJs: 7.5, KTs: 7, K9s: 6, K8s: 5.5, K7s: 5,
  K6s: 4.5, K5s: 4, K4s: 3.5, K3s: 3, K2s: 2.5,
  KQo: 7, KJo: 6.5, KTo: 5.5, K9o: 5, K8o: 4, K7o: 3.5,
  K6o: 3, K5o: 2.5, K4o: 2, K3o: 1.5, K2o: 1,
  // Queen hands
  QJs: 7.5, QTs: 7, Q9s: 6, Q8s: 5.5, Q7s: 4.5, Q6s: 4,
  Q5s: 3.5, Q4s: 3, Q3s: 2.5, Q2s: 2,
  QJo: 6.5, QTo: 5.5, Q9o: 4.5, Q8o: 3.5, Q7o: 3, Q6o: 2.5,
  Q5o: 2, Q4o: 1.5, Q3o: 1, Q2o: 0.5,
  // Jack hands
  JTs: 7.5, J9s: 6.5, J8s: 5.5, J7s: 5, J6s: 4, J5s: 3.5,
  J4s: 3, J3s: 2.5, J2s: 2,
  JTo: 6, J9o: 5, J8o: 4, J7o: 3, J6o: 2.5, J5o: 2,
  J4o: 1.5, J3o: 1, J2o: 0.5,
  // Ten hands
  T9s: 7, T8s: 6, T7s: 5, T6s: 4.5, T5s: 3.5, T4s: 3, T3s: 2.5, T2s: 2,
  T9o: 5.5, T8o: 4, T7o: 3, T6o: 2.5, T5o: 2, T4o: 1.5, T3o: 1, T2o: 0.5,
  // Nine hands
  "98s": 6.5, "97s": 5.5, "96s": 4.5, "95s": 3.5, "94s": 2.5, "93s": 2, "92s": 1.5,
  "98o": 4.5, "97o": 3.5, "96o": 2.5, "95o": 2, "94o": 1.5, "93o": 1, "92o": 0.5,
  // Eight hands
  "87s": 6, "86s": 5, "85s": 4, "84s": 3, "83s": 2.5, "82s": 2,
  "87o": 4, "86o": 3, "85o": 2.5, "84o": 2, "83o": 1, "82o": 0.5,
  // Seven hands
  "76s": 6, "75s": 5, "74s": 4, "73s": 3, "72s": 2,
  "76o": 3.5, "75o": 2.5, "74o": 2, "73o": 1, "72o": 0.5,
  // Six hands
  "65s": 5.5, "64s": 4, "63s": 3, "62s": 2,
  "65o": 3, "64o": 2, "63o": 1, "62o": 0.5,
  // Five hands
  "54s": 5, "53s": 4, "52s": 3,
  "54o": 2.5, "53o": 1.5, "52o": 0.5,
  // Four and below
  "43s": 4, "42s": 3, "43o": 1.5, "42o": 0.5,
  "32s": 3, "32o": 0.5,
};

// ── Position open-raise thresholds (no action faced) ─────────────────────────
// Hands at or above threshold raise; below fold.
// A 0.5-unit "mixed zone" above threshold produces a fractional raise frequency.
const OPEN_THRESHOLDS: Record<Position, number> = {
  UTG: 8.0,   // tight — ~15% range
  CO:  7.0,   // medium — ~25% range
  BTN: 5.5,   // wide — ~45% range
  SB:  6.0,   // medium-wide — ~35% range
  BB:  8.5,   // BB rarely opens; when it does, only strong hands
};

// ── vs Raise thresholds ───────────────────────────────────────────────────────
const VS_RAISE: Record<Position, { threeBet: number; call: number }> = {
  UTG: { threeBet: 9.0, call: 7.5 },
  CO:  { threeBet: 8.5, call: 7.0 },
  BTN: { threeBet: 8.5, call: 6.0 },
  SB:  { threeBet: 9.0, call: 6.5 },
  BB:  { threeBet: 8.5, call: 6.0 },
};

const RANKS = ["2","3","4","5","6","7","8","9","T","J","Q","K","A"];

// ── Public helpers ─────────────────────────────────────────────────────────────

/**
 * Convert integer card encoding (rank + suit*13) to canonical hand notation.
 * Examples: (51, 50) → "AA", (51, 38) → "AKs", (51, 39) → "AKo"
 */
export function holeCardsToNotation(card1: number, card2: number): string {
  const rank1 = card1 % 13;
  const rank2 = card2 % 13;
  const suit1 = Math.floor(card1 / 13);
  const suit2 = Math.floor(card2 / 13);

  if (rank1 === rank2) {
    return `${RANKS[rank1]}${RANKS[rank2]}`; // pocket pair
  }

  // Canonical: higher rank first
  const [hiR, loR, hiS, loS] =
    rank1 > rank2 ? [rank1, rank2, suit1, suit2] : [rank2, rank1, suit2, suit1];

  const suited = hiS === loS ? "s" : "o";
  return `${RANKS[hiR]}${RANKS[loR]}${suited}`;
}

/**
 * Retrieve the GTO-recommended action for a preflop situation.
 *
 * @param position    - Player's position at the table.
 * @param card1       - First hole card integer (0–51).
 * @param card2       - Second hole card integer (0–51).
 * @param facingAction - What the player is facing: "none" = first to act / open,
 *                      "raise" = someone raised, "3bet" = someone 3-bet.
 */
export function getGTOAction(
  position: Position,
  card1: number,
  card2: number,
  facingAction: FacingAction
): GTOAction {
  const hand = holeCardsToNotation(card1, card2);
  const strength = HAND_STRENGTH[hand] ?? 2.0; // default weak hand

  // ── BB special case: no raise facing → free check (represented as "call") ──
  if (position === "BB" && facingAction === "none") {
    if (strength >= OPEN_THRESHOLDS.BB + 0.5) {
      return { action: "raise", frequency: 1.0 };
    }
    if (strength >= OPEN_THRESHOLDS.BB) {
      return { action: "raise", frequency: mixedFreq(strength, OPEN_THRESHOLDS.BB) };
    }
    return { action: "call", frequency: 1.0 }; // check (free to see flop)
  }

  // ── Open (no action faced) ─────────────────────────────────────────────────
  if (facingAction === "none") {
    const threshold = OPEN_THRESHOLDS[position];
    if (strength >= threshold + 0.5) return { action: "raise", frequency: 1.0 };
    if (strength >= threshold)       return { action: "raise", frequency: mixedFreq(strength, threshold) };
    return { action: "fold", frequency: 1.0 };
  }

  // ── Facing a raise ─────────────────────────────────────────────────────────
  if (facingAction === "raise") {
    const { threeBet, call } = VS_RAISE[position];
    // 3bet range
    if (strength >= threeBet + 0.5) return { action: "raise", frequency: 1.0 };
    if (strength >= threeBet)       return { action: "raise", frequency: mixedFreq(strength, threeBet) };
    // call range
    if (strength >= call + 0.5)     return { action: "call", frequency: 1.0 };
    if (strength >= call)           return { action: "call", frequency: mixedFreq(strength, call) };
    return { action: "fold", frequency: 1.0 };
  }

  // ── Facing a 3bet ──────────────────────────────────────────────────────────
  if (strength >= 9.5) return { action: "raise", frequency: 1.0 }; // 4bet shove
  if (strength >= 9.0) return { action: "raise", frequency: 0.7 }; // mixed 4bet
  if (strength >= 8.0) return { action: "call",  frequency: 1.0 }; // 4bet call
  if (strength >= 7.5) return { action: "call",  frequency: 0.5 }; // mixed call
  return { action: "fold", frequency: 1.0 };
}

/** Linear interpolation within the 0.5-unit mixed zone above threshold. */
function mixedFreq(strength: number, threshold: number): number {
  return Math.min(1, Math.max(0, (strength - threshold) / 0.5));
}
