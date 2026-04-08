// API response types from indexer

export interface TableResponse {
  tableId: string;
  contractAddress: string;
  smallBlind: string;
  bigBlind: string;
  currentHandId: string;
  gameState: string;
  buttonSeat: number;
  actionDeadline: string | null;
  seats: SeatResponse[];
  currentHand: HandResponse | null;
}

export interface SeatResponse {
  seatIndex: number;
  ownerAddress: string;
  operatorAddress: string;
  stack: string;
  isActive: boolean;
  currentBet: string;
  /** Agent token address, if the seat owner is a registered agent. */
  tokenAddress: string | null;
}

export interface HandResponse {
  handId: string;
  tableId: string;
  pot: string;
  currentBet: string;
  actorSeat: number | null;
  gameState: string;
  buttonSeat: number;
  communityCards: number[];
  winnerSeat: number | null;
  settlementAmount: string | null;
  actions: ActionResponse[];
}

export interface ReasoningFactors {
  handStrength: string;
  potOdds: string;
  position: string;
  opponentRead: string;
  sizing?: string;
  riskAssessment?: string;
}

export interface ActionResponse {
  seatIndex: number;
  actionType: string;
  amount: string;
  potAfter: string;
  blockNumber: string;
  txHash: string;
  endsStreet: boolean;
  timestamp: string;
  reasoning?: string;
  factors?: ReasoningFactors;
}

export interface AgentResponse {
  tokenAddress: string;
  vaultAddress: string | null;
  tableAddress: string | null;
  ownerAddress: string;
  operatorAddress: string;
  metaUri: string | null;
  isRegistered: boolean;
  latestSnapshot: VaultSnapshotResponse | null;
}

export interface VaultSnapshotResponse {
  handId: string;
  externalAssets: string;
  treasuryShares: string;
  outstandingShares: string;
  navPerShare: string;
  cumulativePnl: string;
  blockNumber: string;
}

export type LeaderboardMetric = "roi" | "pnl" | "winrate" | "mdd" | "elo";
export type LeaderboardPeriod = "24h" | "7d" | "30d" | "all";

export interface LeaderboardEntry {
  rank: number;
  tokenAddress: string;
  ownerAddress: string;
  metaUri: string | null;
  roi: string;
  cumulativePnl: string;
  winrate: string;
  mdd: string;
  elo?: string;
  peakElo?: string;
  eloChange?: string;
  totalHands: number;
  winningHands: number;
  losingHands: number;
  currentNavPerShare: string;
  initialNavPerShare: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface LeaderboardResponse {
  metric: LeaderboardMetric;
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
  updatedAt: string;
  total: number;
  page: number;
  limit: number;
}

// UI Helper types

export interface CardInfo {
  rank: string;
  suit: string;
  display: string;
}

export const GAME_STATES: Record<string, string> = {
  "0": "Waiting for Players",
  "1": "Starting Hand",
  "2": "Dealing Hole Cards\u2026",
  "3": "Pre-flop",
  "4": "Dealing Flop\u2026",
  "5": "Flop",
  "6": "Dealing Turn\u2026",
  "7": "Turn",
  "8": "Dealing River\u2026",
  "9": "River",
  "10": "Showdown \u2014 Reveal Cards",
  "11": "Settled",
  "12": "Dealing Hole Cards\u2026",
  "13": "Dealing Hole Cards\u2026",
  WAITING_FOR_SEATS: "Waiting for Players",
  HAND_INIT: "Starting Hand",
  WAITING_FOR_HOLECARDS: "Dealing Hole Cards\u2026",
  BETTING_PRE: "Pre-flop",
  WAITING_VRF_FLOP: "Dealing Flop\u2026",
  BETTING_FLOP: "Flop",
  WAITING_VRF_TURN: "Dealing Turn\u2026",
  BETTING_TURN: "Turn",
  WAITING_VRF_RIVER: "Dealing River\u2026",
  BETTING_RIVER: "River",
  SHOWDOWN: "Showdown \u2014 Reveal Cards",
  SETTLED: "Settled",
  TOURNAMENT_OVER: "Tournament Over",
  WAITING_VRF_HOLECARDS: "Dealing Hole Cards\u2026",
};

/** Fallback label when game state is not in the map. */
export function getGameStateLabel(state: string): string {
  return GAME_STATES[state] ?? "Unknown State";
}

export const ACTION_LABELS: Record<string, string> = {
  "0": "Fold",
  "1": "Check",
  "2": "Call",
  "3": "Raise",
  FOLD: "Fold",
  CHECK: "Check",
  CALL: "Call",
  RAISE: "Raise",
  BET: "Bet",
  ALL_IN: "All-in",
};

/** @deprecated Use ACTION_LABELS instead */
export const ACTION_TYPES = ACTION_LABELS;
