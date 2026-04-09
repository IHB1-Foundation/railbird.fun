// T-1104: GTO Deviation Analyzer
// Compares the AI agent's actual preflop decision to the GTO recommendation.

import { getGTOAction, type Position, type FacingAction } from "./ranges.js";

export type DeviationType =
  | "aligned"      // AI matched GTO
  | "tighter"      // AI folded when GTO says call/raise
  | "looser"       // AI called/raised when GTO says fold
  | "passive"      // AI called when GTO says raise
  | "aggressive";  // AI raised when GTO says call/fold

export interface DeviationResult {
  /** GTO-recommended action */
  gtoAction: "raise" | "call" | "fold";
  /** GTO mixed-strategy frequency (1.0 = pure strategy) */
  gtoFrequency: number;
  /** Action the AI actually took */
  aiAction: "raise" | "call" | "fold";
  /** True when AI deviated from the GTO recommendation */
  isDeviation: boolean;
  /** Category of deviation (or "aligned") */
  deviationType: DeviationType;
  /**
   * Severity of deviation [0–1].
   * 0 = perfect alignment, 1 = exact opposite of GTO.
   */
  severity: number;
}

export interface AggregateStats {
  /** Percentage of decisions that match GTO (0–100) */
  conformance: number;
  /** Average severity across all deviating hands */
  avgSeverity: number;
  /** Count by deviation type */
  deviationsByType: Record<DeviationType, number>;
}

export class DeviationAnalyzer {
  /**
   * Analyze a single preflop AI decision against the GTO baseline.
   *
   * @param position    - Seat position.
   * @param card1       - Hole card 1 (integer encoding).
   * @param card2       - Hole card 2 (integer encoding).
   * @param aiAction    - Action the AI actually chose.
   * @param facingAction - What the player was facing when deciding.
   */
  analyze(
    position: Position,
    card1: number,
    card2: number,
    aiAction: "raise" | "call" | "fold",
    facingAction: FacingAction
  ): DeviationResult {
    const gto = getGTOAction(position, card1, card2, facingAction);
    const gtoAction = gto.action;
    const gtoFrequency = gto.frequency;

    const isDeviation = aiAction !== gtoAction;

    const deviationType: DeviationType = isDeviation
      ? classifyDeviation(gtoAction, aiAction)
      : "aligned";

    const severity = computeSeverity(gtoAction, gtoFrequency, aiAction);

    return { gtoAction, gtoFrequency, aiAction, isDeviation, deviationType, severity };
  }

  /**
   * Aggregate deviation stats across a set of results.
   */
  getAggregate(deviations: DeviationResult[]): AggregateStats {
    if (deviations.length === 0) {
      return {
        conformance: 100,
        avgSeverity: 0,
        deviationsByType: emptyTypeCount(),
      };
    }

    const aligned = deviations.filter((d) => !d.isDeviation).length;
    const conformance = (aligned / deviations.length) * 100;

    const deviating = deviations.filter((d) => d.isDeviation);
    const avgSeverity =
      deviating.length > 0
        ? deviating.reduce((sum, d) => sum + d.severity, 0) / deviating.length
        : 0;

    const counts = emptyTypeCount();
    for (const d of deviations) {
      counts[d.deviationType]++;
    }

    return { conformance, avgSeverity, deviationsByType: counts };
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function classifyDeviation(
  gtoAction: "raise" | "call" | "fold",
  aiAction: "raise" | "call" | "fold"
): DeviationType {
  if (gtoAction === "raise" && aiAction === "call") return "passive";
  if (gtoAction === "raise" && aiAction === "fold") return "tighter";
  if (gtoAction === "call"  && aiAction === "raise") return "aggressive";
  if (gtoAction === "call"  && aiAction === "fold") return "tighter";
  if (gtoAction === "fold"  && aiAction === "raise") return "looser";
  if (gtoAction === "fold"  && aiAction === "call") return "looser";
  return "aligned"; // shouldn't reach here
}

/**
 * Compute deviation severity [0–1].
 *
 * Logic:
 * - Aligned: severity = 0 (or low when pure GTO matches)
 * - Mild deviation (GTO mixed, AI chose secondary action): severity proportional to (1 - frequency)
 * - Full deviation: severity based on action distance (raise↔fold = 1.0, raise↔call = 0.5, call↔fold = 0.5)
 */
function computeSeverity(
  gtoAction: "raise" | "call" | "fold",
  gtoFrequency: number,
  aiAction: "raise" | "call" | "fold"
): number {
  if (aiAction === gtoAction) return 0;

  // Distance between actions on the aggression scale: fold < call < raise
  const actionValue: Record<string, number> = { fold: 0, call: 1, raise: 2 };
  const distance = Math.abs(actionValue[aiAction] - actionValue[gtoAction]) / 2; // 0.5 or 1.0

  // Scale by how "pure" the GTO recommendation was
  // Pure GTO (freq=1.0) + max distance = severity 1.0
  // Mixed GTO (freq=0.5) + small distance = low severity
  const severity = distance * gtoFrequency;
  return Math.min(1, Math.max(0, severity));
}

function emptyTypeCount(): Record<DeviationType, number> {
  return { aligned: 0, tighter: 0, looser: 0, passive: 0, aggressive: 0 };
}
