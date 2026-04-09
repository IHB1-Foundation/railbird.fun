// T-1104: DeviationAnalyzer unit tests
import { test, describe } from "node:test";
import assert from "node:assert";
import { DeviationAnalyzer } from "./deviation.js";

function card(rank: number, suit: number): number {
  return rank + suit * 13;
}

const Ac = card(12, 0), Ad = card(12, 1);     // AA pair
const Kc = card(11, 0);                         // AKs with Ac
const _7c = card(5, 0), _2d = card(0, 1);      // 72o (trash)
const Jc = card(9, 0), Tc = card(8, 0);         // JTs (BTN raise)

const analyzer = new DeviationAnalyzer();

describe("DeviationAnalyzer.analyze", () => {
  test("aligned: AI raises AA from UTG = GTO raise → not a deviation", () => {
    const result = analyzer.analyze("UTG", Ac, Ad, "raise", "none");
    assert.strictEqual(result.isDeviation, false);
    assert.strictEqual(result.deviationType, "aligned");
    assert.strictEqual(result.severity, 0);
  });

  test("tighter: AI folds AKs from UTG vs no action → deviation", () => {
    // GTO for AKs UTG = raise; AI chose fold
    const result = analyzer.analyze("UTG", Ac, Kc, "fold", "none");
    assert.strictEqual(result.isDeviation, true);
    assert.strictEqual(result.deviationType, "tighter");
    assert.ok(result.severity > 0);
  });

  test("looser: AI raises 72o from UTG → deviation (GTO=fold)", () => {
    const result = analyzer.analyze("UTG", _7c, _2d, "raise", "none");
    assert.strictEqual(result.isDeviation, true);
    assert.strictEqual(result.deviationType, "looser");
    assert.ok(result.severity > 0);
  });

  test("passive: AI calls AA vs raise (GTO=raise) → deviation", () => {
    const result = analyzer.analyze("BTN", Ac, Ad, "call", "raise");
    assert.strictEqual(result.isDeviation, true);
    assert.strictEqual(result.deviationType, "passive");
  });

  test("aggressive: AI raises when GTO says fold → looser (since fold→raise)", () => {
    const result = analyzer.analyze("UTG", _7c, _2d, "raise", "raise");
    // GTO for 72o UTG vs raise = fold; AI raised = looser/aggressive
    assert.strictEqual(result.isDeviation, true);
    assert.ok(["looser", "aggressive"].includes(result.deviationType));
  });

  test("severity = 0 when aligned", () => {
    const result = analyzer.analyze("BTN", Ac, Ad, "raise", "none");
    assert.strictEqual(result.severity, 0);
  });

  test("severity > 0 when deviated", () => {
    const result = analyzer.analyze("UTG", Ac, Kc, "fold", "none");
    assert.ok(result.severity > 0);
  });

  test("severity ≤ 1 always", () => {
    const result = analyzer.analyze("UTG", _7c, _2d, "raise", "raise");
    assert.ok(result.severity <= 1, `severity should be ≤1, got ${result.severity}`);
  });
});

describe("DeviationAnalyzer.getAggregate", () => {
  test("empty array returns 100% conformance", () => {
    const stats = analyzer.getAggregate([]);
    assert.strictEqual(stats.conformance, 100);
    assert.strictEqual(stats.avgSeverity, 0);
  });

  test("all aligned → 100% conformance", () => {
    const results = [
      analyzer.analyze("BTN", Ac, Ad, "raise", "none"),
      analyzer.analyze("BTN", Ac, Kc, "raise", "none"),
    ];
    const stats = analyzer.getAggregate(results);
    assert.strictEqual(stats.conformance, 100);
  });

  test("all deviating → 0% conformance", () => {
    const results = [
      analyzer.analyze("UTG", Ac, Ad, "fold", "none"), // AA UTG fold = tighter
      analyzer.analyze("UTG", Ac, Ad, "fold", "none"),
    ];
    const stats = analyzer.getAggregate(results);
    assert.strictEqual(stats.conformance, 0);
    assert.ok(stats.avgSeverity > 0);
  });

  test("50% aligned → 50% conformance", () => {
    const results = [
      analyzer.analyze("UTG", Ac, Ad, "raise", "none"),  // aligned
      analyzer.analyze("UTG", Ac, Ad, "fold", "none"),   // deviated
    ];
    const stats = analyzer.getAggregate(results);
    assert.strictEqual(stats.conformance, 50);
  });

  test("deviation counts sum to total results", () => {
    const results = [
      analyzer.analyze("UTG", Ac, Ad, "raise", "none"),   // aligned
      analyzer.analyze("UTG", Ac, Kc, "fold", "none"),    // tighter
      analyzer.analyze("UTG", _7c, _2d, "raise", "none"), // looser
      analyzer.analyze("BTN", Jc, Tc, "fold", "none"),    // tighter (JTs below BTN threshold? no, it's 7.5 > 5.5)
    ];
    const stats = analyzer.getAggregate(results);
    const totalCounted = Object.values(stats.deviationsByType).reduce((a, b) => a + b, 0);
    assert.strictEqual(totalCounted, results.length);
  });

  test("avgSeverity is in [0,1]", () => {
    const results = [
      analyzer.analyze("UTG", _7c, _2d, "raise", "none"),
      analyzer.analyze("BTN", Ac, Ad, "fold", "none"),
    ];
    const stats = analyzer.getAggregate(results);
    assert.ok(stats.avgSeverity >= 0 && stats.avgSeverity <= 1);
  });
});
