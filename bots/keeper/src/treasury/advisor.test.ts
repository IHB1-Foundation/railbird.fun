import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { TreasuryAdvisor } from "./advisor.js";
import type { RebalanceContext } from "./types.js";

const BASE_CTX: RebalanceContext = {
  navPerShare: 1000n,         // 1000 base units per share
  externalAssets: 50000n,
  treasuryShares: 10000n,
  outstandingShares: 90000n,
  tokenMarketPrice: 1000n,    // at parity
  recentPnl: 0n,
  cumulativePnl: 0n,
  tokenStage: "bonding",
  rebalanceMaxMonBps: 300,
  rebalanceMaxTokenBps: 200,
};

// Advisor with no API key — always uses rule-based fallback
const advisor = new TreasuryAdvisor({ apiKey: "invalid-key-for-test" });

describe("TreasuryAdvisor rule-based fallback", () => {
  it("recommends skip when price equals NAV", async () => {
    const rec = await advisor.recommend({ ...BASE_CTX, tokenMarketPrice: 1000n });
    assert.equal(rec.action, "skip");
    assert.equal(rec.amountBps, 0);
    assert.ok(rec.reasoning.length > 0);
    assert.ok(rec.confidence > 0);
  });

  it("recommends buy when price is 10% below NAV", async () => {
    const rec = await advisor.recommend({ ...BASE_CTX, tokenMarketPrice: 900n }); // 10% discount
    assert.equal(rec.action, "buy");
    assert.ok(rec.amountBps > 0 && rec.amountBps <= BASE_CTX.rebalanceMaxMonBps);
    assert.ok(rec.reasoning.includes("below NAV") || rec.reasoning.includes("discount"));
  });

  it("recommends sell when price is 10% above NAV", async () => {
    const rec = await advisor.recommend({ ...BASE_CTX, tokenMarketPrice: 1100n }); // 10% premium
    assert.equal(rec.action, "sell");
    assert.ok(rec.amountBps > 0 && rec.amountBps <= BASE_CTX.rebalanceMaxTokenBps);
    assert.ok(rec.reasoning.includes("above NAV") || rec.reasoning.includes("premium"));
  });

  it("never recommends buy when price >= NAV (accretive constraint)", async () => {
    // Simulate AI trying to buy at parity — enforcer should override to skip
    const rec = await advisor.recommend({ ...BASE_CTX, tokenMarketPrice: 1000n });
    assert.notEqual(rec.action, "buy");
  });

  it("respects rebalanceMaxMonBps cap on buy amount", async () => {
    const rec = await advisor.recommend({ ...BASE_CTX, tokenMarketPrice: 800n, rebalanceMaxMonBps: 50 });
    if (rec.action === "buy") {
      assert.ok(rec.amountBps <= 50);
    }
  });

  it("skip when no external assets available for buy", async () => {
    const rec = await advisor.recommend({ ...BASE_CTX, tokenMarketPrice: 800n, externalAssets: 0n });
    assert.equal(rec.action, "skip");
  });

  it("returns factors with all required keys", async () => {
    const rec = await advisor.recommend(BASE_CTX);
    assert.ok(typeof rec.factors.navVsMarket === "string");
    assert.ok(typeof rec.factors.pnlTrend === "string");
    assert.ok(typeof rec.factors.sizeJustification === "string");
  });
});
