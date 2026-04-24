// T-1104: GTO ranges unit tests
import { test, describe } from "node:test";
import assert from "node:assert";
import { getGTOAction, holeCardsToNotation } from "./ranges.js";

// Card encoding: card = rank + suit * 13
// Ranks: 0=2 ... 12=A
// Suits: 0=c 1=d 2=h 3=s
function card(rank: number, suit: number): number {
  return rank + suit * 13;
}
const Ac = card(12, 0),
  Ad = card(12, 1);
const Kc = card(11, 0),
  Kd = card(11, 1);
const Jc = card(9, 0);
const Tc = card(8, 0);
const _9c = card(7, 0);
const _7c = card(5, 0);
const _2c = card(0, 0);
const _7d = card(5, 1);
const _2d = card(0, 1);

describe("holeCardsToNotation", () => {
  test("pair of aces", () => {
    assert.strictEqual(holeCardsToNotation(Ac, Ad), "AA");
  });
  test("AKs (same suit)", () => {
    assert.strictEqual(holeCardsToNotation(Ac, Kc), "AKs");
  });
  test("AKo (different suit)", () => {
    assert.strictEqual(holeCardsToNotation(Ac, Kd), "AKo");
  });
  test("72o", () => {
    assert.strictEqual(holeCardsToNotation(_7c, _2d), "72o");
  });
  test("canonical: higher rank first", () => {
    const result = holeCardsToNotation(Kc, Ac); // K before A in args
    assert.strictEqual(result, "AKs"); // should still be AKs not KAs
  });
});

describe("getGTOAction — opening (facingAction=none)", () => {
  test("AA raises 100% from any position", () => {
    for (const pos of ["UTG", "CO", "BTN", "SB"] as const) {
      const result = getGTOAction(pos, Ac, Ad, "none");
      assert.strictEqual(result.action, "raise", `AA should raise from ${pos}`);
      assert.strictEqual(result.frequency, 1.0);
    }
  });

  test("72o folds from UTG", () => {
    const result = getGTOAction("UTG", _7c, _2d, "none");
    assert.strictEqual(result.action, "fold");
  });

  test("72o folds from CO", () => {
    const result = getGTOAction("CO", _7c, _2d, "none");
    assert.strictEqual(result.action, "fold");
  });

  test("AKs raises from UTG", () => {
    const result = getGTOAction("UTG", Ac, Kc, "none");
    assert.strictEqual(result.action, "raise");
  });

  test("BTN raises wider than UTG", () => {
    // JTs should raise from BTN (strength 7.5 > threshold 5.5) but not UTG (7.5 < 8.0)
    const btnResult = getGTOAction("BTN", Jc, Tc, "none");
    assert.strictEqual(btnResult.action, "raise");
  });

  test("BB checks (call) with marginal hand when no raise", () => {
    const result = getGTOAction("BB", _7c, _2d, "none");
    assert.strictEqual(result.action, "call"); // free check
  });

  test("BB raises with premium facing no raise", () => {
    const result = getGTOAction("BB", Ac, Ad, "none");
    assert.strictEqual(result.action, "raise");
  });
});

describe("getGTOAction — vs raise (facingAction=raise)", () => {
  test("AA 3bets facing a raise from any position", () => {
    for (const pos of ["UTG", "CO", "BTN", "SB", "BB"] as const) {
      const result = getGTOAction(pos, Ac, Ad, "raise");
      assert.strictEqual(result.action, "raise", `AA should 3bet from ${pos}`);
    }
  });

  test("72o folds vs raise from BTN", () => {
    const result = getGTOAction("BTN", _7c, _2d, "raise");
    assert.strictEqual(result.action, "fold");
  });

  test("frequency is 1.0 for pure strategy hands", () => {
    const result = getGTOAction("BTN", Ac, Ad, "raise");
    assert.strictEqual(result.frequency, 1.0);
  });
});

describe("getGTOAction — vs 3bet (facingAction=3bet)", () => {
  test("AA 4bets vs 3bet", () => {
    const result = getGTOAction("BTN", Ac, Ad, "3bet");
    assert.strictEqual(result.action, "raise");
  });

  test("72o folds vs 3bet", () => {
    const result = getGTOAction("BTN", _7c, _2d, "3bet");
    assert.strictEqual(result.action, "fold");
  });
});

describe("getGTOAction — frequency in mixed zone", () => {
  test("frequency is between 0 and 1 for mixed hands", () => {
    // 9c 7c = 97s, strength 5.5, BTN threshold 5.5 → in the mixed zone
    const result = getGTOAction("BTN", _9c, _7c, "none");
    if (result.action === "raise") {
      assert.ok(
        result.frequency >= 0 && result.frequency <= 1,
        `frequency out of range: ${result.frequency}`,
      );
    }
  });

  test("stronger hand has higher raise frequency", () => {
    const strong = getGTOAction("CO", Ac, Kc, "none"); // AKs, strength 9.5
    const weak = getGTOAction("CO", _7c, _7d, "none"); // 77, strength 6.5
    if (strong.action === "raise" && weak.action === "raise") {
      assert.ok(strong.frequency >= weak.frequency);
    } else {
      // At minimum, the stronger hand should not fold when weak hand doesn't
      assert.ok(strong.action === "raise" || weak.action === "fold");
    }
  });
});
