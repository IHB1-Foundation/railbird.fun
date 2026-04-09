// T-1103: Self-Play Strategy Evolution — shared types

export interface PerformanceScore {
  winRate: number;           // 0–1
  avgPnl: number;            // normalized 0–1
  positionalEdge: number;    // 0–1
  bluffSuccessRate: number;  // 0–1
  foldEfficiency: number;    // 0–1
  /** Composite score: weighted average of all metrics */
  composite: number;
}

export interface StrategyParams {
  aggression: number;     // 0.1–0.95
  tightness: number;      // 0.1–0.95
  bluffFrequency: number; // 0.0–0.80
}

export interface EvolutionResult {
  /** Whether the strategy improved and parameters were updated */
  evolved: boolean;
  /** Previous parameters (before mutation) */
  prevParams: StrategyParams;
  /** New parameters (may equal prevParams if no improvement) */
  newParams: StrategyParams;
  /** Per-parameter delta (non-zero only if evolved=true) */
  delta: StrategyParams;
  currentScore: PerformanceScore;
  prevScore: PerformanceScore | null;
}

export interface EvolutionConfig {
  /** Number of hands per evaluation window */
  evalWindowSize: number;       // default: 20
  /** Std dev of Gaussian noise for mutation */
  mutationStdDev: number;       // default: 0.05
  /** Minimum hands before running first evaluation */
  minHandsBeforeEval: number;   // default: 10
}

export const DEFAULT_EVOLUTION_CONFIG: EvolutionConfig = {
  evalWindowSize: 20,
  mutationStdDev: 0.05,
  minHandsBeforeEval: 10,
};

/** Summary of a single played hand for evaluation */
export interface HandResult {
  /** true if this agent won the hand */
  won: boolean;
  /** Net PnL (positive = profit, negative = loss) in chip units */
  pnl: number;
  /** Position: "SB" | "BB" */
  position: string;
  /** Final action taken: "fold" | "call" | "raise" | "check" */
  finalAction: string;
  /** Whether a bluff was attempted (raise without strong cards) */
  bluffAttempted: boolean;
  /** Whether a bluff attempt succeeded (won pot without showdown) */
  bluffSucceeded: boolean;
  /** Whether a fold was the correct decision (opponent had better hand) */
  foldWasCorrect: boolean;
}
