// T-1103: Performance evaluator — computes a normalized PerformanceScore
// from a window of recent hand results.

import type { HandResult, PerformanceScore } from "./types.js";

/**
 * PerformanceEvaluator computes a PerformanceScore from a list of HandResult.
 * All metrics are normalized to [0, 1].
 */
export class PerformanceEvaluator {
  /**
   * Evaluate performance across a hand window.
   * Returns a PerformanceScore with all metrics normalized to [0, 1].
   */
  evaluate(hands: HandResult[]): PerformanceScore {
    if (hands.length === 0) {
      return this.zeroScore();
    }

    const winRate = this.computeWinRate(hands);
    const avgPnl = this.computeNormalizedPnl(hands);
    const positionalEdge = this.computePositionalEdge(hands);
    const bluffSuccessRate = this.computeBluffSuccessRate(hands);
    const foldEfficiency = this.computeFoldEfficiency(hands);

    // Weighted composite: win rate + pnl are the most important
    const composite =
      winRate * 0.30 +
      avgPnl * 0.30 +
      positionalEdge * 0.15 +
      bluffSuccessRate * 0.15 +
      foldEfficiency * 0.10;

    return {
      winRate,
      avgPnl,
      positionalEdge,
      bluffSuccessRate,
      foldEfficiency,
      composite: Math.max(0, Math.min(1, composite)),
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  private computeWinRate(hands: HandResult[]): number {
    const wins = hands.filter((h) => h.won).length;
    return wins / hands.length;
  }

  /**
   * Normalize PnL to [0, 1]:
   *   - Average PnL > 0  → good (mapped toward 1)
   *   - Average PnL < 0  → bad  (mapped toward 0)
   * We use a soft sigmoid-like mapping capped at ±100 chip units.
   */
  private computeNormalizedPnl(hands: HandResult[]): number {
    if (hands.length === 0) return 0.5;
    const avgPnl = hands.reduce((s, h) => s + h.pnl, 0) / hands.length;
    // Normalize: scale so ±100 chips = ±0.5 from 0.5 baseline
    const scaled = avgPnl / 200; // ±100 → ±0.5
    return Math.max(0, Math.min(1, 0.5 + scaled));
  }

  /**
   * Positional edge: compare win rate when in position (BTN/SB) vs out of position (BB).
   * A positive edge (winning more in position) scores higher.
   */
  private computePositionalEdge(hands: HandResult[]): number {
    const inPosition = hands.filter((h) => h.position === "SB" || h.position === "BTN");
    const outOfPosition = hands.filter((h) => h.position === "BB");

    if (inPosition.length === 0 && outOfPosition.length === 0) return 0.5;

    const ipWinRate = inPosition.length > 0
      ? inPosition.filter((h) => h.won).length / inPosition.length
      : 0.5;
    const oopWinRate = outOfPosition.length > 0
      ? outOfPosition.filter((h) => h.won).length / outOfPosition.length
      : 0.5;

    // Edge = in-position advantage, normalized to [0, 1]
    const edge = (ipWinRate - oopWinRate + 1) / 2; // shift [-1,1] → [0,1]
    return Math.max(0, Math.min(1, edge));
  }

  /**
   * Bluff success rate: fraction of bluff attempts that succeeded.
   * Returns 0.5 if no bluffs were attempted.
   */
  private computeBluffSuccessRate(hands: HandResult[]): number {
    const bluffs = hands.filter((h) => h.bluffAttempted);
    if (bluffs.length === 0) return 0.5; // neutral: no bluffs
    const successes = bluffs.filter((h) => h.bluffSucceeded).length;
    return successes / bluffs.length;
  }

  /**
   * Fold efficiency: fraction of folds that were correct (avoided losing more).
   * Returns 0.5 if no folds were made.
   */
  private computeFoldEfficiency(hands: HandResult[]): number {
    const folds = hands.filter((h) => h.finalAction === "fold");
    if (folds.length === 0) return 0.5; // neutral: never folded
    const correct = folds.filter((h) => h.foldWasCorrect).length;
    return correct / folds.length;
  }

  private zeroScore(): PerformanceScore {
    return {
      winRate: 0,
      avgPnl: 0.5,
      positionalEdge: 0.5,
      bluffSuccessRate: 0.5,
      foldEfficiency: 0.5,
      composite: 0.3,
    };
  }
}
