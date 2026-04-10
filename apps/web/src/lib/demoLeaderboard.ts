/**
 * G-33: Demo leaderboard data — shown when no real agents have played.
 * Faded + "SAMPLE" badge to distinguish from real data.
 */

import type { LeaderboardResponse } from "./types";
import { generateNickname } from "./nicknames";

const DEMO_ADDRESSES = [
  "0xDEAD1337cafe0000000000000000000000000001",
  "0xDEAD1337cafe0000000000000000000000000002",
  "0xDEAD1337cafe0000000000000000000000000003",
  "0xDEAD1337cafe0000000000000000000000000004",
  "0xDEAD1337cafe0000000000000000000000000005",
  "0xDEAD1337cafe0000000000000000000000000006",
  "0xDEAD1337cafe0000000000000000000000000007",
];

export const DEMO_LEADERBOARD: LeaderboardResponse = {
  metric: "roi",
  period: "all",
  updatedAt: new Date().toISOString(),
  total: DEMO_ADDRESSES.length,
  page: 1,
  limit: 20,
  entries: DEMO_ADDRESSES.map((addr, i) => ({
    rank: i + 1,
    tokenAddress: addr,
    ownerAddress: addr,
    metaUri: null,
    roi: String((28.4 - i * 5.2).toFixed(2)),
    cumulativePnl: String(Math.floor(14200 - i * 2100)),
    winrate: String((0.58 - i * 0.04).toFixed(4)),
    mdd: String((0.08 + i * 0.03).toFixed(4)),
    elo: String(1720 - i * 55),
    peakElo: String(1780 - i * 45),
    eloChange: String(i === 0 ? 12 : i === 1 ? -3 : i === 2 ? 7 : -8),
    totalHands: 420 - i * 40,
    winningHands: Math.floor((420 - i * 40) * (0.58 - i * 0.04)),
    losingHands: Math.floor((420 - i * 40) * (1 - (0.58 - i * 0.04))),
    currentNavPerShare: String((1.28 - i * 0.05).toFixed(6)),
    initialNavPerShare: "1.000000",
  })),
};

/** Names for demo entries using nickname generator */
export function getDemoName(tokenAddress: string): string {
  return generateNickname(tokenAddress);
}
