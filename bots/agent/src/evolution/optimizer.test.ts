import { test, describe } from "node:test";
import assert from "node:assert";
import { StrategyOptimizer } from "./optimizer.js";
import type { StrategyParams, PerformanceScore } from "./types.js";

function makeScore(composite: number): PerformanceScore {
  return {
    winRate: composite,
    avgPnl: composite,
    positionalEdge: 0.5,
    bluffSuccessRate: 0.5,
    foldEfficiency: 0.5,
    composite,
  };
}

const defaultParams: StrategyParams = {
  aggression: 0.5,
  tightness: 0.5,
  bluffFrequency: 0.3,
};

describe("StrategyOptimizer", () => {
  const optimizer = new StrategyOptimizer({ evalWindowSize: 20, mutationStdDev: 0.05, minHandsBeforeEval: 10 });

  test("evolves on first eval (prevScore=null)", () => {
    const result = optimizer.evolve(defaultParams, makeScore(0.4), null);
    assert.strictEqual(result.evolved, true);
  });

  test("evolves when current score > prev score", () => {
    const result = optimizer.evolve(defaultParams, makeScore(0.7), makeScore(0.5));
    assert.strictEqual(result.evolved, true);
    assert.notDeepStrictEqual(result.newParams, result.prevParams);
  });

  test("does NOT evolve when current score <= prev score", () => {
    const result = optimizer.evolve(defaultParams, makeScore(0.4), makeScore(0.6));
    assert.strictEqual(result.evolved, false);
    assert.deepStrictEqual(result.newParams, result.prevParams);
    assert.strictEqual(result.delta.aggression, 0);
    assert.strictEqual(result.delta.tightness, 0);
    assert.strictEqual(result.delta.bluffFrequency, 0);
  });

  test("clamps aggression to [0.10, 0.95]", () => {
    const extreme: StrategyParams = { aggression: 0.94, tightness: 0.5, bluffFrequency: 0.3 };
    for (let i = 0; i < 50; i++) {
      const result = optimizer.evolve(extreme, makeScore(0.8), makeScore(0.5));
      if (result.evolved) {
        assert.ok(result.newParams.aggression >= 0.10, `aggression ${result.newParams.aggression} < 0.10`);
        assert.ok(result.newParams.aggression <= 0.95, `aggression ${result.newParams.aggression} > 0.95`);
      }
    }
  });

  test("clamps tightness to [0.10, 0.95]", () => {
    const extreme: StrategyParams = { aggression: 0.5, tightness: 0.11, bluffFrequency: 0.3 };
    for (let i = 0; i < 50; i++) {
      const result = optimizer.evolve(extreme, makeScore(0.8), makeScore(0.5));
      if (result.evolved) {
        assert.ok(result.newParams.tightness >= 0.10, `tightness ${result.newParams.tightness} < 0.10`);
        assert.ok(result.newParams.tightness <= 0.95, `tightness ${result.newParams.tightness} > 0.95`);
      }
    }
  });

  test("clamps bluffFrequency to [0.0, 0.80]", () => {
    const extreme: StrategyParams = { aggression: 0.5, tightness: 0.5, bluffFrequency: 0.79 };
    for (let i = 0; i < 50; i++) {
      const result = optimizer.evolve(extreme, makeScore(0.9), makeScore(0.5));
      if (result.evolved) {
        assert.ok(result.newParams.bluffFrequency >= 0.0, `bluffFrequency ${result.newParams.bluffFrequency} < 0.0`);
        assert.ok(result.newParams.bluffFrequency <= 0.80, `bluffFrequency ${result.newParams.bluffFrequency} > 0.80`);
      }
    }
  });

  test("delta is zero when not evolved", () => {
    const result = optimizer.evolve(defaultParams, makeScore(0.3), makeScore(0.7));
    assert.strictEqual(result.delta.aggression, 0);
    assert.strictEqual(result.delta.tightness, 0);
    assert.strictEqual(result.delta.bluffFrequency, 0);
  });

  test("prevParams matches input", () => {
    const result = optimizer.evolve(defaultParams, makeScore(0.8), makeScore(0.5));
    assert.strictEqual(result.prevParams.aggression, 0.5);
    assert.strictEqual(result.prevParams.tightness, 0.5);
    assert.strictEqual(result.prevParams.bluffFrequency, 0.3);
  });

  test("all params remain within bounds after 100 evolutions", () => {
    let params = { ...defaultParams };
    let prevScore: PerformanceScore | null = null;
    for (let i = 0; i < 100; i++) {
      const currentScore = makeScore(Math.random());
      const result = optimizer.evolve(params, currentScore, prevScore);
      params = result.newParams;
      prevScore = currentScore;
      assert.ok(params.aggression >= 0.10 && params.aggression <= 0.95, `aggression out of bounds: ${params.aggression}`);
      assert.ok(params.tightness >= 0.10 && params.tightness <= 0.95, `tightness out of bounds: ${params.tightness}`);
      assert.ok(params.bluffFrequency >= 0.0 && params.bluffFrequency <= 0.80, `bluffFrequency out of bounds: ${params.bluffFrequency}`);
    }
  });

  test("delta equals newParams - prevParams when evolved", () => {
    const opt = new StrategyOptimizer({ mutationStdDev: 0.1 });
    let evolved = false;
    for (let attempt = 0; attempt < 20 && !evolved; attempt++) {
      const result = opt.evolve(defaultParams, makeScore(0.8), makeScore(0.5));
      if (result.evolved) {
        evolved = true;
        const expectedDelta = {
          aggression: result.newParams.aggression - result.prevParams.aggression,
          tightness: result.newParams.tightness - result.prevParams.tightness,
          bluffFrequency: result.newParams.bluffFrequency - result.prevParams.bluffFrequency,
        };
        assert.ok(Math.abs(result.delta.aggression - expectedDelta.aggression) < 1e-9);
        assert.ok(Math.abs(result.delta.tightness - expectedDelta.tightness) < 1e-9);
        assert.ok(Math.abs(result.delta.bluffFrequency - expectedDelta.bluffFrequency) < 1e-9);
      }
    }
  });

  test("currentScore and prevScore are preserved in result", () => {
    const current = makeScore(0.6);
    const prev = makeScore(0.4);
    const result = optimizer.evolve(defaultParams, current, prev);
    assert.strictEqual(result.currentScore.composite, 0.6);
    assert.strictEqual(result.prevScore?.composite, 0.4);
  });
});
