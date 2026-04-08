// Database entity types for the indexer

export interface PokerTable {
  table_id: string;
  contract_address: string;
  small_blind: string;
  big_blind: string;
  current_hand_id: string;
  game_state: string;
  button_seat: number;
  action_deadline: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface Seat {
  table_id: string;
  seat_index: number;
  owner_address: string;
  operator_address: string;
  stack: string;
  is_active: boolean;
  current_bet: string;
  updated_at: Date;
}

export interface Hand {
  hand_id: string;
  table_id: string;
  pot: string;
  current_bet: string;
  actor_seat: number | null;
  game_state: string;
  button_seat: number;
  small_blind: string;
  big_blind: string;
  community_cards: number[];
  winner_seat: number | null;
  settlement_amount: string | null;
  started_at: Date;
  settled_at: Date | null;
}

export interface Action {
  id: number;
  table_id: string;
  hand_id: string;
  seat_index: number;
  action_type: string;
  amount: string;
  pot_after: string;
  block_number: string;
  tx_hash: string;
  ends_street?: boolean;
  created_at: Date;
}

export interface Agent {
  token_address: string;
  vault_address: string | null;
  table_address: string | null;
  owner_address: string;
  operator_address: string;
  meta_uri: string | null;
  is_registered: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface VaultSnapshot {
  id: number;
  vault_address: string;
  hand_id: string;
  external_assets: string;
  treasury_shares: string;
  outstanding_shares: string;
  nav_per_share: string;
  cumulative_pnl: string;
  block_number: string;
  created_at: Date;
}

export interface Settlement {
  id: number;
  table_id: string;
  hand_id: string;
  winner_seat: number;
  pot_amount: string;
  block_number: string;
  tx_hash: string;
  created_at: Date;
}

export interface IndexerState {
  id: number;
  last_processed_block: string;
  last_processed_log_index: number;
  updated_at: Date;
}

export interface ProcessedEvent {
  block_number: string;
  log_index: number;
  tx_hash: string;
  event_name: string;
  processed_at: Date;
}

// API response types (with proper formatting)

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

export interface RebalanceEvent {
  id: number;
  vault_address: string;
  hand_id: string;
  direction: "buy" | "sell";
  amount_in: string;
  amount_out: string;
  nav_before: string;
  nav_after: string;
  block_number: string;
  tx_hash: string;
  created_at: Date;
}

export interface RebalanceEventResponse {
  id: number;
  vaultAddress: string;
  handId: string;
  direction: "buy" | "sell";
  amountIn: string;
  amountOut: string;
  navBefore: string;
  navAfter: string;
  blockNumber: string;
  txHash: string;
  timestamp: string;
}

export interface RevealedHolecard {
  id: number;
  table_id: string;
  hand_id: string;
  seat_index: number;
  card1: number;
  card2: number;
  block_number: string;
  tx_hash: string;
  created_at: Date;
}

export interface RevealedHolecardResponse {
  seatIndex: number;
  card1: number;
  card2: number;
  blockNumber: string;
  txHash: string;
}

// ============ Leaderboard Types ============

export type LeaderboardMetric = "roi" | "pnl" | "winrate" | "mdd";
export type LeaderboardPeriod = "24h" | "7d" | "30d" | "all";

export interface LeaderboardEntry {
  rank: number;
  tokenAddress: string;
  ownerAddress: string;
  metaUri: string | null;
  // Metrics
  roi: string; // percentage as decimal string (e.g., "0.15" = 15%)
  cumulativePnl: string;
  winrate: string; // percentage as decimal string (e.g., "0.55" = 55%)
  mdd: string; // max drawdown as decimal string (e.g., "0.10" = 10%)
  // Stats
  totalHands: number;
  winningHands: number;
  losingHands: number;
  // Current state
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
