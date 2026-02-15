import type { SeatResponse, TableResponse } from "./types";

export interface AgentProfile {
  seatIndex: number;
  codename: string;
  style: string;
  aggression: number;
  blurb: string;
  skill: number;
}

export interface SeatMarket {
  seatIndex: number;
  ownerAddress: string;
  stack: bigint;
  winProb: number;
  oddsBps: number;
  profile: AgentProfile;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export const AGENT_PROFILES: AgentProfile[] = [
  {
    seatIndex: 0,
    codename: "The Signal Keeper",
    style: "Tight Control",
    aggression: 0.15,
    blurb: "Extremely selective preflop range, focused on low-variance and capital preservation.",
    skill: 0.72,
  },
  {
    seatIndex: 1,
    codename: "The Track Reader",
    style: "Balanced Line",
    aggression: 0.35,
    blurb: "Balanced profile that adapts call/raise frequencies to opponent patterns.",
    skill: 0.7,
  },
  {
    seatIndex: 2,
    codename: "The Tunnel Shark",
    style: "Loose Pressure",
    aggression: 0.6,
    blurb: "Wider entry ranges and steady pressure in medium-pot situations.",
    skill: 0.66,
  },
  {
    seatIndex: 3,
    codename: "Last Train Maniac",
    style: "High Variance",
    aggression: 0.85,
    blurb: "Aggressive high-variance raiser designed to force difficult decisions.",
    skill: 0.63,
  },
];

function fallbackProfile(seatIndex: number): AgentProfile {
  const phase = seatIndex % 3;
  if (phase === 0) {
    return {
      seatIndex,
      codename: `Rail Scout ${seatIndex}`,
      style: "Measured",
      aggression: 0.3,
      blurb: "Waits for edge spots and applies position-based pressure selectively.",
      skill: 0.64,
    };
  }
  if (phase === 1) {
    return {
      seatIndex,
      codename: `Rail Scout ${seatIndex}`,
      style: "Adaptive",
      aggression: 0.45,
      blurb: "Adjusts call/fold thresholds dynamically to match table tempo.",
      skill: 0.62,
    };
  }
  return {
    seatIndex,
    codename: `Rail Scout ${seatIndex}`,
    style: "Pressure",
    aggression: 0.7,
    blurb: "Increases aggression in later streets to maximize pot control and fold equity.",
    skill: 0.6,
  };
}

function isOccupiedSeat(seat: SeatResponse): boolean {
  return seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS;
}

export function buildSeatMarket(table: TableResponse): SeatMarket[] {
  const occupied = table.seats.filter(isOccupiedSeat);
  if (occupied.length === 0) return [];

  const totalStack = occupied.reduce((acc, seat) => acc + BigInt(seat.stack), 0n);
  const weighted = occupied.map((seat) => {
    const profile = AGENT_PROFILES.find((p) => p.seatIndex === seat.seatIndex) ?? fallbackProfile(seat.seatIndex);
    const stackRatio = totalStack > 0n ? Number(BigInt(seat.stack) * 1_000_000n / totalStack) / 1_000_000 : 0.25;
    const baseScore = stackRatio * 0.55 + profile.skill * 0.45;
    return { seat, profile, baseScore };
  });

  const scoreSum = weighted.reduce((acc, item) => acc + item.baseScore, 0);
  const houseEdge = 0.94;

  return weighted.map(({ seat, profile, baseScore }) => {
    const winProb = scoreSum > 0 ? baseScore / scoreSum : 1 / weighted.length;
    const fairOdds = 1 / Math.max(winProb, 0.02);
    const offeredOdds = Math.max(1.15, fairOdds * houseEdge);
    const oddsBps = Math.round(offeredOdds * 10_000);

    return {
      seatIndex: seat.seatIndex,
      ownerAddress: seat.ownerAddress,
      stack: BigInt(seat.stack),
      winProb,
      oddsBps,
      profile,
    };
  });
}

export function formatOdds(oddsBps: number): string {
  return (oddsBps / 10_000).toFixed(2);
}

export function toImpliedPercent(prob: number): string {
  return `${(prob * 100).toFixed(1)}%`;
}
