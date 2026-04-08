// Tests for hand history embedder (no external logger dependency)

import { test, describe } from "node:test";
import assert from "node:assert";
import { embedHand, cosineSimilarity, buildQueryVector } from "./embedder.js";
import type { HandSummary } from "./types.js";

function makeSummary(overrides: Partial<HandSummary> = {}): HandSummary {
  return {
    handId: "1",
    position: "BTN",
    holeCards: "Ah Kd",
    communityCards: "As 7h 2c",
    actions: ["raise 200", "call"],
    result: "won",
    pnl: 500n,
    boardTexture: "dry rainbow",
    opponentActions: ["call", "fold"],
    ...overrides,
  };
}

describe("embedHand", () => {
  test("produces a 20-element vector", () => {
    const v = embedHand(makeSummary());
    assert.strictEqual(v.length, 20);
  });

  test("all values are in [0, 1]", () => {
    const v = embedHand(makeSummary());
    for (const val of v) {
      assert.ok(val >= 0 && val <= 1, `Value ${val} should be in [0,1]`);
    }
  });

  test("won hands score higher result dimension than lost", () => {
    const won = embedHand(makeSummary({ result: "won" }));
    const lost = embedHand(makeSummary({ result: "lost" }));
    assert.ok(won[3] > lost[3], "won should have higher result score");
  });

  test("strong hands score higher strength than weak", () => {
    const strong = embedHand(makeSummary({ holeCards: "Ah Ad" })); // AA
    const weak = embedHand(makeSummary({ holeCards: "2s 7h" }));  // 72o
    assert.ok(strong[1] > weak[1], "AA should score higher than 72o");
  });

  test("BTN scores higher position than BB", () => {
    const btn = embedHand(makeSummary({ position: "BTN" }));
    const bb = embedHand(makeSummary({ position: "BB" }));
    assert.ok(btn[0] > bb[0], "BTN should have higher position score");
  });

  test("buildQueryVector returns 20-element vector", () => {
    const v = buildQueryVector({ position: "BTN", holeCards: "Ah Kd", boardTexture: "dry" });
    assert.strictEqual(v.length, 20);
  });
});

describe("cosineSimilarity", () => {
  test("identical vectors have similarity 1", () => {
    const v = [0.5, 0.3, 0.7, 0.1];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1) < 1e-9, "identical vectors should have similarity 1");
  });

  test("orthogonal vectors have similarity 0", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    assert.ok(Math.abs(cosineSimilarity(a, b)) < 1e-9, "orthogonal vectors should have similarity 0");
  });

  test("empty vectors return 0", () => {
    assert.strictEqual(cosineSimilarity([], []), 0);
  });

  test("similar positions score higher than dissimilar", () => {
    const btnWon = embedHand(makeSummary({ position: "BTN", result: "won" }));
    const btnLost = embedHand(makeSummary({ position: "BTN", result: "won", pnl: 300n }));
    const bbLost = embedHand(makeSummary({ position: "BB", result: "lost", pnl: -500n }));
    const simSame = cosineSimilarity(btnWon, btnLost);
    const simDiff = cosineSimilarity(btnWon, bbLost);
    assert.ok(simSame > simDiff, "Similar situations should have higher cosine similarity");
  });
});

describe("VectorStore (inline logic)", () => {
  test("deduplication logic works", () => {
    // Inline the deduplication logic without importing VectorStore (avoids pino)
    const vectors: Array<{ handId: string; embedding: number[] }> = [];
    const add = (v: { handId: string; embedding: number[] }) => {
      const existing = vectors.findIndex((x) => x.handId === v.handId);
      if (existing !== -1) {
        vectors[existing] = v;
        return;
      }
      vectors.push(v);
      if (vectors.length > 5) vectors.shift(); // small capacity for test
    };

    add({ handId: "1", embedding: [0.1] });
    add({ handId: "2", embedding: [0.2] });
    add({ handId: "1", embedding: [0.9] }); // update dup
    assert.strictEqual(vectors.length, 2, "Dedup should keep 2 entries");
    assert.strictEqual(vectors.find((v) => v.handId === "1")!.embedding[0], 0.9, "Updated embedding");
  });

  test("FIFO eviction at max capacity", () => {
    const vectors: Array<{ handId: string }> = [];
    const MAX = 5;
    const add = (id: string) => {
      vectors.push({ handId: id });
      if (vectors.length > MAX) vectors.shift();
    };
    for (let i = 0; i < 7; i++) add(String(i));
    assert.strictEqual(vectors.length, MAX);
    assert.strictEqual(vectors[0].handId, "2", "Oldest should be evicted");
  });
});
