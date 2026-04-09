import { test, describe } from "node:test";
import assert from "node:assert";
import { PerformanceEvaluator } from "./evaluator.js";
import type { HandResult } from "./types.js";

const evaluator = new PerformanceEvaluator();

function makeHand(overrides: Partial<HandResult> = {}): HandResult {
  return {
    won: false,
    pnl: 0,
    position: "BB",
    finalAction: "fold",
    bluffAttempted: false,
    bluffSucceeded: false,
    foldWasCorrect: true,
    ...overrides,
  };
}

describe("PerformanceEvaluator", () => {
  test("returns neutral score for empty hand list", () => {
    const score = evaluator.evaluate([]);
    assert.strictEqual(score.winRate, 0);
    assert.strictEqual(score.avgPnl, 0.5);
    assert.strictEqual(score.composite, 0.3);
  });

  test("computes win rate correctly", () => {
    const hands = [
      makeHand({ won: true }),
      makeHand({ won: true }),
      makeHand({ won: false }),
      makeHand({ won: false }),
    ];
    const score = evaluator.evaluate(hands);
    assert.strictEqual(score.winRate, 0.5);
  });

  test("returns winRate=1 when all hands are won", () => {
    const hands = Array.from({ length: 10 }, () => makeHand({ won: true, pnl: 50 }));
    const score = evaluator.evaluate(hands);
    assert.strictEqual(score.winRate, 1);
    assert.ok(score.composite > 0.7, `Expected composite > 0.7, got ${score.composite}`);
  });

  test("returns low composite when all hands are lost", () => {
    const hands = Array.from({ length: 10 }, () => makeHand({ won: false, pnl: -50 }));
    const score = evaluator.evaluate(hands);
    assert.strictEqual(score.winRate, 0);
    assert.ok(score.composite < 0.4, `Expected composite < 0.4, got ${score.composite}`);
  });

  test("normalizes avgPnl for positive PnL", () => {
    const score = evaluator.evaluate([makeHand({ pnl: 200 })]);
    assert.ok(score.avgPnl >= 0.9, `Expected avgPnl >= 0.9, got ${score.avgPnl}`);
  });

  test("normalizes avgPnl for negative PnL", () => {
    const score = evaluator.evaluate([makeHand({ pnl: -200 })]);
    assert.ok(score.avgPnl <= 0.1, `Expected avgPnl <= 0.1, got ${score.avgPnl}`);
  });

  test("computes bluff success rate = 0.5 when no bluffs attempted", () => {
    const hands = [makeHand({ bluffAttempted: false })];
    const score = evaluator.evaluate(hands);
    assert.strictEqual(score.bluffSuccessRate, 0.5);
  });

  test("computes bluff success rate correctly", () => {
    const hands = [
      makeHand({ bluffAttempted: true, bluffSucceeded: true }),
      makeHand({ bluffAttempted: true, bluffSucceeded: true }),
      makeHand({ bluffAttempted: true, bluffSucceeded: false }),
    ];
    const score = evaluator.evaluate(hands);
    assert.ok(Math.abs(score.bluffSuccessRate - 2 / 3) < 0.001, `Expected 0.667, got ${score.bluffSuccessRate}`);
  });

  test("computes fold efficiency = 0.5 when no folds made", () => {
    const hands = [makeHand({ finalAction: "raise" })];
    const score = evaluator.evaluate(hands);
    assert.strictEqual(score.foldEfficiency, 0.5);
  });

  test("returns composite in [0,1]", () => {
    const hands = Array.from({ length: 20 }, (_, i) =>
      makeHand({ won: i % 3 === 0, pnl: i % 3 === 0 ? 20 : -10 })
    );
    const score = evaluator.evaluate(hands);
    assert.ok(score.composite >= 0, "composite should be >= 0");
    assert.ok(score.composite <= 1, "composite should be <= 1");
  });

  test("all fields are in [0,1]", () => {
    const hands = [makeHand({ won: true, pnl: 30, bluffAttempted: true, bluffSucceeded: true, finalAction: "raise" })];
    const score = evaluator.evaluate(hands);
    for (const [key, val] of Object.entries(score)) {
      assert.ok(val >= 0 && val <= 1, `${key}=${val} should be in [0,1]`);
    }
  });
});
