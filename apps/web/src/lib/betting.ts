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
    blurb: "핸드 선별이 극단적으로 보수적이고, 리스크가 낮은 구간만 공략합니다.",
    skill: 0.72,
  },
  {
    seatIndex: 1,
    codename: "The Track Reader",
    style: "Balanced Line",
    aggression: 0.35,
    blurb: "상대 패턴에 따라 콜/레이즈 밸런스를 맞추는 표준형 플레이어입니다.",
    skill: 0.7,
  },
  {
    seatIndex: 2,
    codename: "The Tunnel Shark",
    style: "Loose Pressure",
    aggression: 0.6,
    blurb: "진입 빈도가 높고, 미들팟에서 압박을 누적하는 타입입니다.",
    skill: 0.66,
  },
  {
    seatIndex: 3,
    codename: "Last Train Maniac",
    style: "High Variance",
    aggression: 0.85,
    blurb: "고변동성 레이즈를 반복해 판을 크게 흔드는 공격형 플레이어입니다.",
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
      blurb: "핸드 우위를 기다리며 포지션 기반으로 압박 타이밍을 고릅니다.",
      skill: 0.64,
    };
  }
  if (phase === 1) {
    return {
      seatIndex,
      codename: `Rail Scout ${seatIndex}`,
      style: "Adaptive",
      aggression: 0.45,
      blurb: "상대 템포에 맞춰 콜/폴드 경계를 민첩하게 조정합니다.",
      skill: 0.62,
    };
  }
  return {
    seatIndex,
    codename: `Rail Scout ${seatIndex}`,
    style: "Pressure",
    aggression: 0.7,
    blurb: "중반 이후 팟 점유율을 높이기 위해 공격 빈도를 끌어올립니다.",
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
