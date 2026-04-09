// T-1103: Strategy optimizer — (1+1) Evolutionary Strategy
// Applies Gaussian noise to parameters; keeps new params only if composite score improves.

import type { StrategyParams, PerformanceScore, EvolutionResult, EvolutionConfig } from "./types.js";
import { DEFAULT_EVOLUTION_CONFIG } from "./types.js";

// Parameter bounds
const BOUNDS: Record<keyof StrategyParams, [number, number]> = {
  aggression:     [0.10, 0.95],
  tightness:      [0.10, 0.95],
  bluffFrequency: [0.00, 0.80],
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Gaussian random number (Box–Muller transform).
 */
function gaussianRandom(mean = 0, stdDev = 1): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1 + 1e-9)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}

/**
 * StrategyOptimizer implements a simple (1+1) ES:
 *   - Mutate the current parameter vector by adding Gaussian noise.
 *   - If the new composite score > old score: adopt the mutation.
 *   - Otherwise: keep the current parameters.
 *
 * All parameters are clamped to their defined ranges after mutation.
 */
export class StrategyOptimizer {
  private config: EvolutionConfig;

  constructor(config: Partial<EvolutionConfig> = {}) {
    this.config = { ...DEFAULT_EVOLUTION_CONFIG, ...config };
  }

  /**
   * Attempt to evolve strategy parameters.
   *
   * @param currentParams - Current strategy parameters.
   * @param currentScore  - Performance score for the current window.
   * @param prevScore     - Performance score from the previous window (null = first eval).
   * @returns EvolutionResult with the (potentially) updated parameters.
   */
  evolve(
    currentParams: StrategyParams,
    currentScore: PerformanceScore,
    prevScore: PerformanceScore | null
  ): EvolutionResult {
    const shouldEvolve =
      prevScore === null || currentScore.composite > prevScore.composite;

    if (!shouldEvolve) {
      // Score did not improve — keep current parameters
      return {
        evolved: false,
        prevParams: { ...currentParams },
        newParams: { ...currentParams },
        delta: { aggression: 0, tightness: 0, bluffFrequency: 0 },
        currentScore,
        prevScore,
      };
    }

    // Apply mutation: Gaussian noise on each parameter
    const stdDev = this.config.mutationStdDev;
    const mutated: StrategyParams = {
      aggression:     clamp(currentParams.aggression     + gaussianRandom(0, stdDev), BOUNDS.aggression[0],     BOUNDS.aggression[1]),
      tightness:      clamp(currentParams.tightness      + gaussianRandom(0, stdDev), BOUNDS.tightness[0],      BOUNDS.tightness[1]),
      bluffFrequency: clamp(currentParams.bluffFrequency + gaussianRandom(0, stdDev), BOUNDS.bluffFrequency[0], BOUNDS.bluffFrequency[1]),
    };

    const delta: StrategyParams = {
      aggression:     mutated.aggression     - currentParams.aggression,
      tightness:      mutated.tightness      - currentParams.tightness,
      bluffFrequency: mutated.bluffFrequency - currentParams.bluffFrequency,
    };

    return {
      evolved: true,
      prevParams: { ...currentParams },
      newParams: mutated,
      delta,
      currentScore,
      prevScore,
    };
  }
}
