import { describe, it, expect } from "vitest";
import { buildSeatMarket, formatOdds, toImpliedPercent } from "../betting";
import type { TableResponse, SeatResponse } from "../types";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

function makeSeat(seatIndex: number, ownerAddress: string, stack: string): SeatResponse {
  return {
    seatIndex,
    ownerAddress,
    operatorAddress: ownerAddress,
    stack,
    isActive: true,
    currentBet: "0",
    tokenAddress: null,
  };
}

function makeTable(seats: SeatResponse[]): TableResponse {
  return {
    tableId: "1",
    contractAddress: "0xabc",
    gameState: "WAITING_FOR_SEATS",
    seats,
    smallBlind: "10",
    bigBlind: "20",
    currentHandId: "0",
    buttonSeat: 0,
    actionDeadline: null,
    currentHand: null,
  } as TableResponse;
}

// ─── buildSeatMarket ─────────────────────────────────────────────────────────

describe("buildSeatMarket", () => {
  it("returns empty array when no occupied seats", () => {
    const table = makeTable([makeSeat(0, ZERO_ADDR, "1000")]);
    expect(buildSeatMarket(table)).toEqual([]);
  });

  it("returns one entry per occupied seat", () => {
    const seats = [
      makeSeat(0, "0xaaaa", "1000"),
      makeSeat(1, "0xbbbb", "1000"),
      makeSeat(2, ZERO_ADDR, "0"),
    ];
    const market = buildSeatMarket(makeTable(seats));
    expect(market).toHaveLength(2);
    expect(market.map((m) => m.seatIndex)).toContain(0);
    expect(market.map((m) => m.seatIndex)).toContain(1);
  });

  it("winProb sums to 1 across all entries", () => {
    const seats = [
      makeSeat(0, "0xaaaa", "500"),
      makeSeat(1, "0xbbbb", "1500"),
    ];
    const market = buildSeatMarket(makeTable(seats));
    const total = market.reduce((sum, m) => sum + m.winProb, 0);
    expect(total).toBeCloseTo(1, 5);
  });

  it("oddsBps is positive for all entries", () => {
    const seats = [
      makeSeat(0, "0xaaaa", "1000"),
      makeSeat(1, "0xbbbb", "1000"),
      makeSeat(2, "0xcccc", "1000"),
    ];
    const market = buildSeatMarket(makeTable(seats));
    for (const entry of market) {
      expect(entry.oddsBps).toBeGreaterThan(0);
    }
  });

  it("higher stack results in higher win probability", () => {
    const seats = [
      makeSeat(0, "0xaaaa", "100"),
      makeSeat(1, "0xbbbb", "10000"),
    ];
    const market = buildSeatMarket(makeTable(seats));
    const m0 = market.find((m) => m.seatIndex === 0)!;
    const m1 = market.find((m) => m.seatIndex === 1)!;
    expect(m1.winProb).toBeGreaterThan(m0.winProb);
  });

  it("offered odds are at least 1.15x", () => {
    const seats = [makeSeat(0, "0xaaaa", "9999999"), makeSeat(1, "0xbbbb", "1")];
    const market = buildSeatMarket(makeTable(seats));
    for (const entry of market) {
      expect(entry.oddsBps).toBeGreaterThanOrEqual(11_500); // 1.15 * 10000
    }
  });

  it("empty seats array returns empty market", () => {
    expect(buildSeatMarket(makeTable([]))).toEqual([]);
  });
});

// ─── formatOdds ──────────────────────────────────────────────────────────────

describe("formatOdds", () => {
  it("formats 10000 bps as 1.00", () => {
    expect(formatOdds(10_000)).toBe("1.00");
  });

  it("formats 15000 bps as 1.50", () => {
    expect(formatOdds(15_000)).toBe("1.50");
  });

  it("formats 25000 bps as 2.50", () => {
    expect(formatOdds(25_000)).toBe("2.50");
  });
});

// ─── toImpliedPercent ────────────────────────────────────────────────────────

describe("toImpliedPercent", () => {
  it("formats 0.5 as 50.0%", () => {
    expect(toImpliedPercent(0.5)).toBe("50.0%");
  });

  it("formats 0.25 as 25.0%", () => {
    expect(toImpliedPercent(0.25)).toBe("25.0%");
  });

  it("formats 1 as 100.0%", () => {
    expect(toImpliedPercent(1)).toBe("100.0%");
  });
});
