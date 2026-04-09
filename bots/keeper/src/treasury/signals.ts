// T-1106: Multi-Signal Collector for TreasuryAdvisor
// Collects 4 signals before rebalancing to give Gemini richer context.

export interface HandOutcome {
  won: boolean;
  pnl: number; // net chips (positive = profit)
}

export interface NavSnapshot {
  navPerShare: bigint;
  timestamp: number; // epoch ms
}

export interface RebalanceOutcome {
  direction: "buy" | "sell";
  navBefore: bigint;
  navAfter: bigint;
  timestamp: number; // epoch ms
}

export type Sentiment = "bullish" | "bearish" | "neutral";

export interface MultiSignalContext {
  /** Win rate [0–1] and PnL trend over recent hands */
  performanceTrend: "rising" | "falling" | "flat";
  winRate: number;
  avgPnl: number;
  /** NAV/share momentum: percentage change over last N snapshots */
  navMomentum: number; // e.g. 0.03 = +3%
  navMomentumLabel: "up" | "down" | "flat";
  /** How effective were recent rebalances? Positive = rebalances improved NAV */
  rebalanceEffectiveness: number; // 0–1
  rebalanceEffectivenessLabel: "effective" | "neutral" | "ineffective";
  /** Coefficient of variation of recent PnL (volatility proxy) */
  volatility: number; // 0–1 normalized
  volatilityLabel: "low" | "medium" | "high";
  /** Overall sentiment derived from all signals */
  overallSentiment: Sentiment;
}

export class SignalCollector {
  /**
   * Collect multi-signal context from recent hands, vault snapshots, and rebalance history.
   *
   * Gracefully handles empty arrays — returns neutral defaults for missing data.
   */
  collectSignals(
    recentHands: HandOutcome[],
    recentSnapshots: NavSnapshot[],
    recentRebalances: RebalanceOutcome[]
  ): MultiSignalContext {
    const perf = this.computePerformanceSignal(recentHands);
    const nav = this.computeNavMomentum(recentSnapshots);
    const rebEff = this.computeRebalanceEffectiveness(recentRebalances);
    const vol = this.computeVolatility(recentHands);

    const sentiment = this.deriveSentiment(perf, nav, rebEff);

    return {
      performanceTrend: perf.trend,
      winRate: perf.winRate,
      avgPnl: perf.avgPnl,
      navMomentum: nav.momentum,
      navMomentumLabel: nav.label,
      rebalanceEffectiveness: rebEff.score,
      rebalanceEffectivenessLabel: rebEff.label,
      volatility: vol.score,
      volatilityLabel: vol.label,
      overallSentiment: sentiment,
    };
  }

  // ── Private signal computations ──────────────────────────────────────────────

  private computePerformanceSignal(hands: HandOutcome[]): {
    trend: "rising" | "falling" | "flat";
    winRate: number;
    avgPnl: number;
  } {
    if (hands.length === 0) {
      return { trend: "flat", winRate: 0.5, avgPnl: 0 };
    }

    const wins = hands.filter((h) => h.won).length;
    const winRate = wins / hands.length;
    const avgPnl = hands.reduce((s, h) => s + h.pnl, 0) / hands.length;

    // Trend: compare first half PnL vs second half
    const mid = Math.floor(hands.length / 2);
    if (hands.length >= 4) {
      const firstHalf = hands.slice(0, mid);
      const secondHalf = hands.slice(mid);
      const avgFirst = firstHalf.reduce((s, h) => s + h.pnl, 0) / firstHalf.length;
      const avgSecond = secondHalf.reduce((s, h) => s + h.pnl, 0) / secondHalf.length;
      const diff = avgSecond - avgFirst;
      const threshold = Math.abs(avgFirst) * 0.1 + 1; // 10% relative change or ≥1 unit
      const trend: "rising" | "falling" | "flat" =
        diff > threshold ? "rising" : diff < -threshold ? "falling" : "flat";
      return { trend, winRate, avgPnl };
    }

    return { trend: "flat", winRate, avgPnl };
  }

  private computeNavMomentum(snapshots: NavSnapshot[]): {
    momentum: number;
    label: "up" | "down" | "flat";
  } {
    const recent = snapshots.slice(-5);
    if (recent.length < 2) {
      return { momentum: 0, label: "flat" };
    }

    const oldest = recent[0].navPerShare;
    const newest = recent[recent.length - 1].navPerShare;

    if (oldest === 0n) return { momentum: 0, label: "flat" };

    const changeNum = Number(newest - oldest);
    const baseNum = Number(oldest);
    const momentum = changeNum / baseNum;

    const label: "up" | "down" | "flat" =
      momentum > 0.01 ? "up" : momentum < -0.01 ? "down" : "flat";

    return { momentum, label };
  }

  private computeRebalanceEffectiveness(rebalances: RebalanceOutcome[]): {
    score: number;
    label: "effective" | "neutral" | "ineffective";
  } {
    const recent = rebalances.slice(-5);
    if (recent.length === 0) {
      return { score: 0.5, label: "neutral" };
    }

    let positiveCount = 0;
    for (const r of recent) {
      // A rebalance is "effective" if NAV improved (or at least didn't decline)
      if (r.navAfter >= r.navBefore) positiveCount++;
    }

    const score = positiveCount / recent.length;
    const label: "effective" | "neutral" | "ineffective" =
      score >= 0.6 ? "effective" : score >= 0.4 ? "neutral" : "ineffective";

    return { score, label };
  }

  private computeVolatility(hands: HandOutcome[]): {
    score: number;
    label: "low" | "medium" | "high";
  } {
    if (hands.length < 3) {
      return { score: 0.3, label: "low" };
    }

    const pnls = hands.map((h) => h.pnl);
    const mean = pnls.reduce((s, p) => s + p, 0) / pnls.length;
    const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / pnls.length;
    const stdDev = Math.sqrt(variance);

    // Normalize by typical chip values (e.g., big blind = 2 chips → stdDev of 100 chips is high)
    // Use coefficient of variation (stdDev / |mean|), capped at 1
    const absMean = Math.abs(mean);
    const cv = absMean > 0 ? Math.min(1, stdDev / (absMany(pnls) + 1)) : Math.min(1, stdDev / 100);

    const label: "low" | "medium" | "high" =
      cv < 0.3 ? "low" : cv < 0.6 ? "medium" : "high";

    return { score: cv, label };
  }

  private deriveSentiment(
    perf: { trend: string; winRate: number },
    nav: { label: string },
    rebEff: { label: string }
  ): Sentiment {
    let bullishScore = 0;
    let bearishScore = 0;

    if (perf.trend === "rising") bullishScore++;
    if (perf.trend === "falling") bearishScore++;
    if (perf.winRate > 0.55) bullishScore++;
    if (perf.winRate < 0.45) bearishScore++;
    if (nav.label === "up") bullishScore++;
    if (nav.label === "down") bearishScore++;
    if (rebEff.label === "effective") bullishScore++;
    if (rebEff.label === "ineffective") bearishScore++;

    if (bullishScore >= 2 && bullishScore > bearishScore) return "bullish";
    if (bearishScore >= 2 && bearishScore > bullishScore) return "bearish";
    return "neutral";
  }
}

/** Average of absolute values — helper for volatility normalization */
function absMany(values: number[]): number {
  return values.reduce((s, v) => s + Math.abs(v), 0) / (values.length || 1);
}
