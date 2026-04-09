// Strategy types

import type { TableState } from "../chain/client.js";

export interface HoleCards {
  card1: number;
  card2: number;
}

export interface DecisionContext {
  tableState: TableState;
  mySeatIndex: number;
  holeCards: HoleCards | null;
  canCheck: boolean;
  amountToCall: bigint;
  /** T-1203: Opponent read — counter-strategy text injected into Gemini prompt */
  opponentRead?: string;
}

export enum Decision {
  FOLD = "fold",
  CHECK = "check",
  CALL = "call",
  RAISE = "raise",
}

export interface ReasoningFactors {
  handStrength: string;    // e.g., "top pair, ace kicker"
  potOdds: string;         // e.g., "25% — favorable"
  position: string;        // e.g., "BTN — positional advantage"
  opponentRead: string;    // e.g., "Seat 2 is tight (fold 70%), likely weak range"
  sizing?: string;         // e.g., "65% pot — standard value bet"
  riskAssessment?: string; // e.g., "medium risk — flush draw possible on board"
}

/**
 * T-1205: Deep decision breakdown for explainability.
 * Parsed from Gemini structured output.
 */
export interface DecisionBreakdown {
  handStrength: string;    // e.g., "Top pair with ace kicker — top 15% of hands"
  potOdds: string;         // e.g., "Need 25% equity to call. Estimated equity: 62%"
  evEstimate: string;      // e.g., "+EV call: risking 200 to win 800"
  opponentRead: string;    // e.g., "Opponent's check suggests weakness or slow-play"
  keyFactor: string;       // The single most important factor
  confidence: number;      // 0–100
  gtoDeviation?: { action: string; severity: number; explanation: string };
  counterStrategy?: string;
}

export interface ActionDecision {
  action: Decision;
  raiseAmount?: bigint;         // Only for RAISE
  reasoning?: string;           // Natural language explanation of the decision
  factors?: ReasoningFactors;   // Structured reasoning factors
  breakdown?: DecisionBreakdown; // T-1205: Deep explainability breakdown
}

export type MaybePromise<T> = T | Promise<T>;

export interface Strategy {
  decide(context: DecisionContext): MaybePromise<ActionDecision>;
}
