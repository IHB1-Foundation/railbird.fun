import { describe, it, expect } from "vitest";
import {
  cardToInfo,
  formatCard,
  formatCards,
  formatMon,
  formatChips,
  shortenAddress,
  formatPercent,
  cn,
} from "../utils";

describe("cardToInfo", () => {
  it("returns correct rank and suit for card 0 (2♠)", () => {
    const info = cardToInfo(0);
    expect(info).not.toBeNull();
    expect(info!.rank).toBe("2");
    expect(info!.suit).toBe("s");
    expect(info!.display).toBe("2♠");
  });

  it("returns correct info for card 51 (A♣)", () => {
    const info = cardToInfo(51);
    expect(info).not.toBeNull();
    expect(info!.rank).toBe("A");
    expect(info!.suit).toBe("c");
    expect(info!.display).toBe("A♣");
  });

  it("returns null for 255 (placeholder for unrevealed card)", () => {
    expect(cardToInfo(255)).toBeNull();
  });

  it("returns null for out-of-range negative index", () => {
    expect(cardToInfo(-1)).toBeNull();
  });

  it("returns null for index > 51", () => {
    expect(cardToInfo(52)).toBeNull();
  });
});

describe("formatCard", () => {
  it("formats valid card", () => {
    expect(formatCard(0)).toBe("2♠");
  });

  it("returns '??' for invalid card", () => {
    expect(formatCard(255)).toBe("??");
  });
});

describe("formatCards", () => {
  it("filters out 255 placeholders", () => {
    expect(formatCards([0, 255, 13, 255, 255])).toBe("2♠ 2♥");
  });

  it("formats all valid cards", () => {
    expect(formatCards([0, 1])).toBe("2♠ 3♠");
  });
});

describe("formatMon", () => {
  it("formats amounts >= 1 ETH with 2 decimals", () => {
    expect(formatMon(1_000_000_000_000_000_000n)).toBe("1.00");
  });

  it("formats thousands with K suffix", () => {
    expect(formatMon(1_500_000_000_000_000_000_000n)).toBe("1.50K");
  });

  it("formats small amounts with 8 decimals (< 0.001 ETH)", () => {
    const result = formatMon(500_000_000_000_000n); // 0.0005 ETH
    expect(result).toBe("0.00050000");
  });

  it("accepts string input", () => {
    expect(formatMon("1000000000000000000")).toBe("1.00");
  });
});

describe("formatChips", () => {
  it("converts wei to chip units", () => {
    expect(formatChips(1_000_000_000_000_000_000n)).toBe("1");
  });

  it("formats larger amounts with locale separators", () => {
    // 1000 chips = 1,000 with en-US locale
    expect(formatChips(1_000n * 10n ** 18n)).toMatch(/1,000|1000/);
  });
});

describe("shortenAddress", () => {
  it("shortens a full address to 6+4 chars", () => {
    const addr = "0x1234567890abcdef1234567890abcdef12345678";
    expect(shortenAddress(addr)).toBe("0x1234...5678");
  });

  it("returns short strings unchanged", () => {
    expect(shortenAddress("0x123")).toBe("0x123");
  });
});

describe("formatPercent", () => {
  it("formats 0.5 as 50.00%", () => {
    expect(formatPercent(0.5)).toBe("50.00%");
  });

  it("formats string input", () => {
    expect(formatPercent("0.25")).toBe("25.00%");
  });
});

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("a", "b", "c")).toBe("a b c");
  });

  it("filters out falsy values", () => {
    expect(cn("a", false, undefined, "b")).toBe("a b");
  });

  it("returns empty string when all are falsy", () => {
    expect(cn(false, undefined)).toBe("");
  });
});
