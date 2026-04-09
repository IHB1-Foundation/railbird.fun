// Unit tests for CounterStrategyAdvisor (T-1203)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CounterStrategyAdvisor } from "./counter.js";
import type { OpponentProfile } from "./types.js";

function makeProfile(style: OpponentProfile["style"], sampleSize = 10): OpponentProfile {
  return {
    seatIndex: 0,
    sampleSize,
    vpip: style.includes("loose") ? 60 : 18,
    pfr: style.includes("aggressive") ? 25 : 8,
    af: style.includes("aggressive") ? 3.5 : 0.8,
    foldToCBet: 40,
    wtsd: 30,
    wsd: 55,
    threeBetFreq: style.includes("aggressive") ? 12 : 3,
    checkRaiseFreq: 5,
    style,
  };
}

describe("CounterStrategyAdvisor", () => {
  const advisor = new CounterStrategyAdvisor();

  // C1: Unknown style → neutral adjustments
  it("returns neutral adjustments for unknown style", () => {
    const profile = makeProfile("unknown");
    const advice = advisor.advise(profile);
    assert.equal(advice.style, "Unknown");
    assert.equal(advice.adjustments.aggression, 0);
    assert.equal(advice.adjustments.tightness, 0);
    assert.equal(advice.adjustments.bluffFreq, 0);
    assert.ok(advice.promptInjection.toLowerCase().includes("gto"));
  });

  // C2: Tight-passive → steal more, bluff more
  it("advises steal and bluff vs tight-passive", () => {
    const profile = makeProfile("tight-passive");
    const advice = advisor.advise(profile);
    assert.equal(advice.style, "Tight-Passive (Nit)");
    assert.ok(advice.adjustments.aggression > 0, "Should increase aggression vs nit");
    assert.ok(advice.adjustments.bluffFreq > 0, "Should increase bluff freq vs nit");
    assert.ok(advice.promptInjection.toLowerCase().includes("steal"));
  });

  // C3: Loose-aggressive → tighten up, no bluffing
  it("advises tightening and no bluffs vs loose-aggressive", () => {
    const profile = makeProfile("loose-aggressive");
    const advice = advisor.advise(profile);
    assert.equal(advice.style, "Loose-Aggressive (LAG)");
    assert.ok(advice.adjustments.tightness > 0, "Should increase tightness vs LAG");
    assert.ok(advice.adjustments.bluffFreq < 0, "Should decrease bluff freq vs LAG");
    assert.ok(advice.promptInjection.toLowerCase().includes("trap"));
  });

  // C4: Tight-aggressive → respect raises, exploit fold-to-3bet
  it("advises polarized 3-bet vs tight-aggressive", () => {
    const profile = makeProfile("tight-aggressive");
    const advice = advisor.advise(profile);
    assert.equal(advice.style, "Tight-Aggressive (TAG)");
    assert.ok(advice.promptInjection.toLowerCase().includes("3-bet"));
    assert.ok(advice.adjustments.tightness > 0, "Should tighten vs TAG");
  });

  // C5: Loose-passive → value bet wide, never bluff
  it("advises value bet wide and no bluffing vs loose-passive", () => {
    const profile = makeProfile("loose-passive");
    const advice = advisor.advise(profile);
    assert.equal(advice.style, "Loose-Passive (Calling Station)");
    assert.ok(advice.adjustments.aggression > 0, "Should increase aggression (value) vs station");
    assert.ok(advice.adjustments.bluffFreq < 0, "Should never bluff vs station");
    assert.ok(advice.promptInjection.toLowerCase().includes("value bet"));
  });

  // C6: All styles return non-empty promptInjection
  it("every style returns non-empty promptInjection", () => {
    const styles: OpponentProfile["style"][] = [
      "tight-passive", "loose-aggressive", "tight-aggressive", "loose-passive", "unknown"
    ];
    for (const style of styles) {
      const profile = makeProfile(style);
      const advice = advisor.advise(profile);
      assert.ok(advice.promptInjection.length > 20, `${style} should have a meaningful promptInjection`);
    }
  });

  // C7: Adjustments are bounded to [-0.2, +0.2]
  it("adjustments are within [-0.2, +0.2] bounds", () => {
    const styles: OpponentProfile["style"][] = [
      "tight-passive", "loose-aggressive", "tight-aggressive", "loose-passive", "unknown"
    ];
    for (const style of styles) {
      const profile = makeProfile(style);
      const advice = advisor.advise(profile);
      const { aggression, tightness, bluffFreq } = advice.adjustments;
      assert.ok(aggression >= -0.2 && aggression <= 0.2, `${style} aggression out of bounds`);
      assert.ok(tightness >= -0.2 && tightness <= 0.2, `${style} tightness out of bounds`);
      assert.ok(bluffFreq >= -0.2 && bluffFreq <= 0.2, `${style} bluffFreq out of bounds`);
    }
  });

  // C8: formatPromptSection for unknown shows seat info
  it("formatPromptSection for unknown profile shows seat info", () => {
    const profile = makeProfile("unknown", 2);
    const advice = advisor.advise(profile);
    const section = advisor.formatPromptSection(1, "Seat 1", profile, advice);
    assert.ok(section.includes("Seat 1"));
    assert.ok(section.includes("==="));
  });

  // C9: formatPromptSection for known profile includes stats
  it("formatPromptSection for known profile includes VPIP/PFR/AF", () => {
    const profile = makeProfile("tight-passive");
    const advice = advisor.advise(profile);
    const section = advisor.formatPromptSection(0, "Aegis", profile, advice);
    assert.ok(section.includes("VPIP"));
    assert.ok(section.includes("PFR"));
    assert.ok(section.includes("AF"));
    assert.ok(section.includes("Aegis"));
  });

  // C10: Unknown with low sample does not show VPIP stats
  it("formatPromptSection for unknown hides stats (uses simpler format)", () => {
    const profile = makeProfile("unknown", 3);
    const advice = advisor.advise(profile);
    const section = advisor.formatPromptSection(2, "Maverick", profile, advice);
    // For unknown, the section doesn't show VPIP/PFR stats
    assert.ok(!section.includes("VPIP"), "Unknown profile should not show VPIP");
  });
});
