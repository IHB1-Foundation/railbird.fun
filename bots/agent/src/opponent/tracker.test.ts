// Unit tests for OpponentTracker (T-1203)
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { OpponentTracker } from "./tracker.js";
import type { ObservedAction } from "./types.js";

function call(seatIndex: number, street: "preflop" | "flop" | "turn" | "river", facingBet = true): ObservedAction {
  return { seatIndex, action: "call", street, facingBet, isVoluntary: true };
}
function raise(seatIndex: number, street: "preflop" | "flop" | "turn" | "river", facingBet = false): ObservedAction {
  return { seatIndex, action: "raise", street, facingBet, isVoluntary: true };
}
function fold(seatIndex: number, street: "preflop" | "flop" | "turn" | "river", facingBet = true): ObservedAction {
  return { seatIndex, action: "fold", street, facingBet, isVoluntary: true };
}
function check(seatIndex: number, street: "flop" | "turn" | "river"): ObservedAction {
  return { seatIndex, action: "check", street, facingBet: false, isVoluntary: true };
}

describe("OpponentTracker", () => {
  let tracker: OpponentTracker;

  beforeEach(() => {
    tracker = new OpponentTracker();
  });

  // T1: Insufficient sample returns unknown style
  it("returns unknown style before 5 hands", () => {
    tracker.observe(call(0, "preflop"));
    tracker.finalizeHand([0]);
    const profile = tracker.getProfile(0);
    assert.equal(profile.style, "unknown");
    assert.equal(profile.sampleSize, 1);
  });

  // T2: VPIP tracks voluntary preflop participation
  it("tracks VPIP correctly", () => {
    for (let i = 0; i < 5; i++) {
      tracker.observe(call(0, "preflop"));
      tracker.finalizeHand([0]);
    }
    const profile = tracker.getProfile(0);
    assert.equal(profile.vpip, 100); // called all 5 hands
  });

  // T3: PFR tracks preflop raises
  it("tracks PFR correctly", () => {
    for (let i = 0; i < 5; i++) {
      if (i < 3) {
        tracker.observe(raise(0, "preflop"));
      } else {
        tracker.observe(call(0, "preflop"));
      }
      tracker.finalizeHand([0]);
    }
    const profile = tracker.getProfile(0);
    assert.equal(profile.pfr, 60); // 3 out of 5 hands
  });

  // T4: AF = bets+raises / calls
  it("calculates AF correctly", () => {
    for (let i = 0; i < 5; i++) {
      tracker.observe(call(0, "preflop"));
      tracker.observe(raise(0, "flop", true));
      tracker.observe(raise(0, "turn", true));
      tracker.finalizeHand([0]);
    }
    const profile = tracker.getProfile(0);
    // 10 bets+raises, 5 calls → AF = 2.0
    assert.equal(profile.af, 2);
  });

  // T5: Classify tight-aggressive
  it("classifies tight-aggressive opponent", () => {
    for (let i = 0; i < 10; i++) {
      // vpip ~20%, high af
      if (i < 2) {
        tracker.observe(raise(0, "preflop"));
      } else {
        tracker.observe(fold(0, "preflop"));
      }
      // Boost AF
      tracker.observe(raise(0, "flop", true));
      tracker.observe(raise(0, "flop", true));
      tracker.observe(raise(0, "flop", true));
      tracker.finalizeHand([0]);
    }
    const profile = tracker.getProfile(0);
    assert.equal(profile.style, "tight-aggressive");
  });

  // T6: Classify loose-passive
  it("classifies loose-passive opponent", () => {
    for (let i = 0; i < 10; i++) {
      tracker.observe(call(0, "preflop"));
      tracker.observe(call(0, "flop", true));
      tracker.observe(call(0, "turn", true));
      tracker.finalizeHand([0]);
    }
    const profile = tracker.getProfile(0);
    assert.equal(profile.style, "loose-passive");
    assert.ok(profile.vpip >= 50);
    assert.ok(profile.af < 2);
  });

  // T7: Classify tight-passive
  it("classifies tight-passive opponent", () => {
    for (let i = 0; i < 10; i++) {
      if (i < 1) {
        tracker.observe(call(0, "preflop"));
        tracker.observe(call(0, "flop", true));
      } else {
        tracker.observe(fold(0, "preflop"));
      }
      tracker.finalizeHand([0]);
    }
    const profile = tracker.getProfile(0);
    assert.equal(profile.style, "tight-passive");
  });

  // T8: Classify loose-aggressive
  it("classifies loose-aggressive opponent", () => {
    for (let i = 0; i < 10; i++) {
      tracker.observe(raise(0, "preflop"));
      tracker.observe(raise(0, "flop", true));
      tracker.observe(raise(0, "turn", true));
      tracker.finalizeHand([0]);
    }
    const profile = tracker.getProfile(0);
    assert.equal(profile.style, "loose-aggressive");
    assert.ok(profile.vpip >= 50);
    assert.ok(profile.af >= 2);
  });

  // T9: Fold-to-CBet tracking
  it("tracks fold to continuation bet", () => {
    for (let i = 0; i < 5; i++) {
      tracker.observe(call(0, "preflop"));
      // Face a CBet on flop
      if (i < 4) {
        tracker.observe(fold(0, "flop", true));
      } else {
        tracker.observe(call(0, "flop", true));
      }
      tracker.finalizeHand([0]);
    }
    const profile = tracker.getProfile(0);
    assert.equal(profile.foldToCBet, 80); // 4 out of 5
  });

  // T10: getSampleSize returns 0 for unseen seat
  it("getSampleSize returns 0 for unseen seat", () => {
    assert.equal(tracker.getSampleSize(99), 0);
  });

  // T11: Multiple seats tracked independently
  it("tracks multiple seats independently", () => {
    for (let i = 0; i < 5; i++) {
      tracker.observe(raise(0, "preflop")); // aggressive
      tracker.observe(fold(1, "preflop"));  // tight-passive
      tracker.finalizeHand([0, 1]);
    }
    const p0 = tracker.getProfile(0);
    const p1 = tracker.getProfile(1);
    assert.ok(p0.pfr > p1.pfr);
  });

  // T12: All-fold maniac (no calls at all)
  it("handles all-raise no-call scenario (AF = infinity clamped)", () => {
    for (let i = 0; i < 5; i++) {
      tracker.observe(raise(0, "preflop"));
      tracker.observe(raise(0, "flop", false));
      tracker.observe(raise(0, "turn", false));
      tracker.finalizeHand([0]);
    }
    const profile = tracker.getProfile(0);
    // No calls, so af = betsAndRaises (divisor=0 case: af = betsAndRaises count)
    assert.ok(profile.af > 0, "AF should be positive when there are raises and no calls");
    // Style should be aggressive (vpip=100% via raises, af>=2 via 3 raises per hand)
    assert.ok(profile.af >= 2, "AF should be >= 2 for all-raise scenario");
  });

  // T13: 3-bet frequency tracked correctly
  it("tracks 3-bet frequency", () => {
    for (let i = 0; i < 10; i++) {
      if (i < 3) {
        tracker.observe(raise(0, "preflop", true)); // 3-bet (facing a raise)
      } else {
        tracker.observe(call(0, "preflop"));
      }
      tracker.finalizeHand([0]);
    }
    const profile = tracker.getProfile(0);
    assert.equal(profile.threeBetFreq, 30); // 3 out of 10
  });

  // T14: WTSD and W$SD tracked
  it("tracks showdown statistics", () => {
    for (let i = 0; i < 5; i++) {
      tracker.observe(call(0, "preflop"));
      tracker.finalizeHand([0], [0], i < 3 ? 0 : undefined);
    }
    const profile = tracker.getProfile(0);
    assert.equal(profile.wtsd, 100); // went to showdown all 5 hands
    assert.equal(profile.wsd, 60);   // won 3 of 5
  });

  // T15: resetSeat clears data
  it("resetSeat clears seat data", () => {
    for (let i = 0; i < 6; i++) {
      tracker.observe(raise(0, "preflop"));
      tracker.finalizeHand([0]);
    }
    const before = tracker.getProfile(0);
    assert.notEqual(before.style, "unknown");

    tracker.resetSeat(0);
    const after = tracker.getProfile(0);
    assert.equal(after.style, "unknown");
    assert.equal(after.sampleSize, 0);
  });
});
