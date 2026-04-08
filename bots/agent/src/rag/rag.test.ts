// Tests for hand history RAG (embedder + vector store)

import { test, describe } from "node:test";
import assert from "node:assert";
import { embedHand, cosineSimilarity, buildQueryVector } from "./embedder.js";
import { VectorStore } from "./vectorStore.js";
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
    // Dimension 3 is result
    assert.ok(won[3] > lost[3], "won should have higher result score");
  });

  test("strong hands score higher strength than weak", () => {
    const strong = embedHand(makeSummary({ holeCards: "Ah Ad" })); // AA
    const weak = embedHand(makeSummary({ holeCards: "2s 7h" }));  // 72o
    // Dimension 1 is hand strength
    assert.ok(strong[1] > weak[1], "AA should score higher than 72o");
  });

  test("BTN scores higher position than BB", () => {
    const btn = embedHand(makeSummary({ position: "BTN" }));
    const bb = embedHand(makeSummary({ position: "BB" }));
    assert.ok(btn[0] > bb[0], "BTN should have higher position score");
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
});

describe("VectorStore", () => {
  test("stores and retrieves vectors", () => {
    const store = new VectorStore(":memory:");
    const v = embedHand(makeSummary({ handId: "test-1" }));
    store.add({ handId: "test-1", summary: makeSummary({ handId: "test-1" }), embedding: v });
    assert.strictEqual(store.size, 1);
  });

  test("search returns top-K similar vectors", () => {
    const store = new VectorStore(":memory:");

    // Add 3 vectors
    const summaries = [
      makeSummary({ handId: "1", position: "BTN", result: "won" }),
      makeSummary({ handId: "2", position: "BB", result: "lost" }),
      makeSummary({ handId: "3", position: "BTN", holeCards: "Ah Kd", result: "won" }),
    ];

    for (const s of summaries) {
      store.add({ handId: s.handId, summary: s, embedding: embedHand(s) });
    }

    const query = buildQueryVector({ position: "BTN", holeCards: "As Ks", boardTexture: "dry rainbow" });
    const results = store.search(query, 2);
    assert.strictEqual(results.length, 2);
    // BTN hands should rank higher than BB for BTN query
    assert.ok(results.some((r) => r.summary.position === "BTN"), "BTN should appear in results");
  });

  test("evicts oldest when over capacity (simulated with small limit)", () => {
    // Use a custom small store by adding 501 entries manually
    const store = new VectorStore(":memory:");
    for (let i = 0; i < 502; i++) {
      const s = makeSummary({ handId: String(i) });
      store.add({ handId: String(i), summary: s, embedding: embedHand(s) });
    }
    assert.ok(store.size <= 500, `Size should be ≤ 500 but got ${store.size}`);
  });

  test("deduplicates by handId", () => {
    const store = new VectorStore(":memory:");
    const s = makeSummary({ handId: "dup" });
    const v = embedHand(s);
    store.add({ handId: "dup", summary: s, embedding: v });
    store.add({ handId: "dup", summary: s, embedding: v });
    assert.strictEqual(store.size, 1, "Duplicate handId should not be stored twice");
  });
});
