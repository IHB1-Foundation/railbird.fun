// T-1106: SignalCollector unit tests
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SignalCollector } from "./signals.js";
import type { HandOutcome, NavSnapshot, RebalanceOutcome } from "./signals.js";

const collector = new SignalCollector();

function hand(won: boolean, pnl: number): HandOutcome {
  return { won, pnl };
}

function snap(navPerShare: bigint, ts: number): NavSnapshot {
  return { navPerShare, timestamp: ts };
}

function rebal(direction: "buy" | "sell", navBefore: bigint, navAfter: bigint): RebalanceOutcome {
  return { direction, navBefore, navAfter, timestamp: Date.now() };
}

describe("SignalCollector — empty data returns neutral", () => {
  it("empty hands → neutral context", () => {
    const ctx = collector.collectSignals([], [], []);
    assert.equal(ctx.overallSentiment, "neutral");
    assert.equal(ctx.performanceTrend, "flat");
    assert.equal(ctx.navMomentumLabel, "flat");
    assert.equal(ctx.volatilityLabel, "low");
    assert.equal(ctx.rebalanceEffectivenessLabel, "neutral");
  });
});

describe("SignalCollector — performance signal", () => {
  it("all wins → high win rate", () => {
    const hands = Array.from({ length: 10 }, () => hand(true, 50));
    const ctx = collector.collectSignals(hands, [], []);
    assert.equal(ctx.winRate, 1);
    assert.ok(ctx.avgPnl > 0);
  });

  it("all losses → low win rate", () => {
    const hands = Array.from({ length: 10 }, () => hand(false, -30));
    const ctx = collector.collectSignals(hands, [], []);
    assert.equal(ctx.winRate, 0);
  });

  it("rising trend → performanceTrend=rising", () => {
    // First 5 lose, last 5 win big
    const hands = [
      hand(false, -10), hand(false, -10), hand(false, -10), hand(false, -10), hand(false, -10),
      hand(true, 100), hand(true, 100), hand(true, 100), hand(true, 100), hand(true, 100),
    ];
    const ctx = collector.collectSignals(hands, [], []);
    assert.equal(ctx.performanceTrend, "rising");
  });

  it("falling trend → performanceTrend=falling", () => {
    const hands = [
      hand(true, 100), hand(true, 100), hand(true, 100), hand(true, 100), hand(true, 100),
      hand(false, -50), hand(false, -50), hand(false, -50), hand(false, -50), hand(false, -50),
    ];
    const ctx = collector.collectSignals(hands, [], []);
    assert.equal(ctx.performanceTrend, "falling");
  });
});

describe("SignalCollector — NAV momentum", () => {
  it("rising NAV → navMomentumLabel=up", () => {
    const snaps = [snap(1000n, 1), snap(1020n, 2), snap(1050n, 3)];
    const ctx = collector.collectSignals([], snaps, []);
    assert.equal(ctx.navMomentumLabel, "up");
    assert.ok(ctx.navMomentum > 0);
  });

  it("falling NAV → navMomentumLabel=down", () => {
    const snaps = [snap(1000n, 1), snap(980n, 2), snap(950n, 3)];
    const ctx = collector.collectSignals([], snaps, []);
    assert.equal(ctx.navMomentumLabel, "down");
  });

  it("flat NAV → navMomentumLabel=flat", () => {
    const snaps = [snap(1000n, 1), snap(1001n, 2), snap(1000n, 3)];
    const ctx = collector.collectSignals([], snaps, []);
    assert.equal(ctx.navMomentumLabel, "flat");
  });

  it("single snapshot → flat momentum", () => {
    const ctx = collector.collectSignals([], [snap(1000n, 1)], []);
    assert.equal(ctx.navMomentumLabel, "flat");
  });
});

describe("SignalCollector — volatility", () => {
  it("stable returns → low volatility", () => {
    const hands = Array.from({ length: 10 }, () => hand(true, 50));
    const ctx = collector.collectSignals(hands, [], []);
    assert.equal(ctx.volatilityLabel, "low");
  });

  it("erratic returns → higher volatility", () => {
    const hands = [
      hand(true, 1000), hand(false, -1000), hand(true, 500), hand(false, -800),
      hand(true, 1200), hand(false, -900), hand(true, 700), hand(false, -1100),
    ];
    const ctx = collector.collectSignals(hands, [], []);
    assert.ok(["medium", "high"].includes(ctx.volatilityLabel));
  });
});

describe("SignalCollector — overall sentiment", () => {
  it("bullish conditions → bullish sentiment", () => {
    const hands = [
      hand(true, 100), hand(true, 120), hand(true, 80), hand(true, 90), hand(true, 110),
    ];
    const snaps = [snap(1000n, 1), snap(1030n, 2), snap(1060n, 3)];
    const rebalances = [rebal("buy", 1000n, 1050n), rebal("buy", 1050n, 1080n)];
    const ctx = collector.collectSignals(hands, snaps, rebalances);
    assert.equal(ctx.overallSentiment, "bullish");
  });

  it("bearish conditions → bearish sentiment", () => {
    const hands = [
      hand(false, -100), hand(false, -120), hand(false, -80),
      hand(false, -90), hand(false, -110),
    ];
    const snaps = [snap(1000n, 1), snap(970n, 2), snap(940n, 3)];
    const rebalances = [rebal("buy", 1000n, 950n)];
    const ctx = collector.collectSignals(hands, snaps, rebalances);
    assert.equal(ctx.overallSentiment, "bearish");
  });
});
