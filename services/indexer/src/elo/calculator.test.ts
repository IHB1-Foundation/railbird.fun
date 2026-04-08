import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  expectedScore,
  kFactor,
  computeDelta,
  computeHandEloUpdates,
} from "./calculator.js";

describe("expectedScore", () => {
  it("equal ratings → 0.5", () => {
    assert.ok(Math.abs(expectedScore(1500, 1500) - 0.5) < 0.001);
  });

  it("100-point advantage → >0.5", () => {
    assert.ok(expectedScore(1600, 1500) > 0.5);
  });

  it("100-point disadvantage → <0.5", () => {
    assert.ok(expectedScore(1400, 1500) < 0.5);
  });
});

describe("kFactor", () => {
  it("returns K=32 for fewer than 100 hands", () => {
    assert.equal(kFactor(0), 32);
    assert.equal(kFactor(99), 32);
  });

  it("returns K=16 for 100+ hands", () => {
    assert.equal(kFactor(100), 16);
    assert.equal(kFactor(500), 16);
  });
});

describe("computeDelta", () => {
  it("winner at equal ratings gains ~16 points (K=32, E=0.5)", () => {
    const delta = computeDelta(1500, 1500, 1, 0);
    assert.ok(Math.abs(delta - 16) < 0.01);
  });

  it("loser at equal ratings loses ~16 points", () => {
    const delta = computeDelta(1500, 1500, 0, 0);
    assert.ok(Math.abs(delta - (-16)) < 0.01);
  });
});

describe("computeHandEloUpdates — 2 players", () => {
  const ratings = new Map([["A", 1500], ["B", 1500]]);
  const hands = new Map([["A", 0], ["B", 0]]);
  const participants = [
    { tokenAddress: "A", seatIndex: 0 },
    { tokenAddress: "B", seatIndex: 1 },
  ];

  it("winner gains points, loser loses points", () => {
    const updates = computeHandEloUpdates(participants, 0, ratings, hands);
    const winner = updates.find((u) => u.tokenAddress === "A")!;
    const loser = updates.find((u) => u.tokenAddress === "B")!;
    assert.ok(winner.ratingAfter > winner.ratingBefore);
    assert.ok(loser.ratingAfter < loser.ratingBefore);
  });

  it("returns 2 updates for 2 players", () => {
    const updates = computeHandEloUpdates(participants, 0, ratings, hands);
    assert.equal(updates.length, 2);
  });
});

describe("computeHandEloUpdates — 4 players", () => {
  const tokens = ["A", "B", "C", "D"];
  const ratings = new Map(tokens.map((t) => [t, 1500] as [string, number]));
  const hands = new Map(tokens.map((t) => [t, 0] as [string, number]));
  const participants = tokens.map((t, i) => ({ tokenAddress: t, seatIndex: i }));

  it("returns 4 updates for 4 players", () => {
    const updates = computeHandEloUpdates(participants, 0, ratings, hands);
    assert.equal(updates.length, 4);
  });

  it("winner gains more points than in 2-player game (3 wins)", () => {
    const updates = computeHandEloUpdates(participants, 0, ratings, hands);
    const winner = updates.find((u) => u.tokenAddress === "A")!;
    // In 2-player: +16; in 4-player: 3×~16 ≈ +48
    assert.ok(winner.ratingAfter - winner.ratingBefore > 30);
  });

  it("all losers have lower rating after", () => {
    const updates = computeHandEloUpdates(participants, 0, ratings, hands);
    for (const u of updates) {
      if (u.tokenAddress === "A") {
        assert.ok(u.ratingAfter > u.ratingBefore);
      } else {
        assert.ok(u.ratingAfter < u.ratingBefore);
      }
    }
  });

  it("winner unknown seat → returns empty", () => {
    const updates = computeHandEloUpdates(participants, 99, ratings, hands);
    assert.equal(updates.length, 0);
  });

  it("K-factor switches after 100 hands", () => {
    const handsHigh = new Map(tokens.map((t) => [t, 100] as [string, number]));
    const updates = computeHandEloUpdates(participants, 0, ratings, handsHigh);
    for (const u of updates) {
      assert.equal(u.kFactor, 16);
    }
  });
});
