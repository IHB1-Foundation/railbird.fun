// ELO rating types for AI agent ranking

export interface EloRating {
  tokenAddress: string;
  rating: number;
  handsPlayed: number;
  peakRating: number;
  updatedAt: Date;
}

export interface EloHistoryEntry {
  id: number;
  tokenAddress: string;
  handId: bigint;
  opponentAddress: string;
  outcome: "win" | "loss" | "draw";
  ratingBefore: number;
  ratingAfter: number;
  kFactor: number;
  createdAt: Date;
}

/** A participant in a hand: their token address and which seat they occupied. */
export interface HandParticipant {
  tokenAddress: string;
  seatIndex: number;
}

/** Result of an ELO update for one player. */
export interface EloUpdate {
  tokenAddress: string;
  ratingBefore: number;
  ratingAfter: number;
  kFactor: number;
}
