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

export interface ActionResponse {
  seatIndex: number;
  actionType: string;
  amount: string;
  potAfter: string;
  blockNumber: string;
  txHash: string;
  timestamp: string;
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

export type LeaderboardMetric = "roi" | "pnl" | "winrate" | "mdd";
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
  totalHands: number;
  winningHands: number;
  losingHands: number;
  currentNavPerShare: string;
  initialNavPerShare: string;
}

export interface LeaderboardResponse {
  metric: LeaderboardMetric;
  period: LeaderboardPeriod;
  entries: LeaderboardEntry[];
  updatedAt: string;
}

// WebSocket message types

export type WsMessageType =
  | "connected"
  | "action"
  | "hand_started"
  | "betting_round_complete"
  | "vrf_requested"
  | "community_cards"
  | "hand_settled"
  | "seat_updated"
  | "pot_updated"
  | "force_timeout";

export interface WsMessage {
  type: WsMessageType;
  tableId: string;
  handId?: string;
  data?: Record<string, unknown>;
}

// UI Helper types

export interface CardInfo {
  rank: string;
  suit: string;
  display: string;
}

export const GAME_STATES: Record<string, string> = {
  "0": "Waiting for Seats",
  "1": "Hand Init",
  "2": "Waiting for Hole Cards",
  "3": "Pre-flop",
  "4": "Waiting VRF Flop",
  "5": "Flop",
  "6": "Waiting VRF Turn",
  "7": "Turn",
  "8": "Waiting VRF River",
  "9": "River",
  "10": "Showdown",
  "11": "Settled",
  WAITING_FOR_SEATS: "Waiting for Seats",
  HAND_INIT: "Hand Init",
  WAITING_FOR_HOLECARDS: "Waiting for Hole Cards",
  BETTING_PRE: "Pre-flop",
  WAITING_VRF_FLOP: "Waiting VRF Flop",
  BETTING_FLOP: "Flop",
  WAITING_VRF_TURN: "Waiting VRF Turn",
  BETTING_TURN: "Turn",
  WAITING_VRF_RIVER: "Waiting VRF River",
  BETTING_RIVER: "River",
  SHOWDOWN: "Showdown",
  SETTLED: "Settled",
};

export const ACTION_TYPES: Record<string, string> = {
  "0": "Fold",
  "1": "Check",
  "2": "Call",
  "3": "Raise",
  FOLD: "Fold",
  CHECK: "Check",
  CALL: "Call",
  RAISE: "Raise",
};
