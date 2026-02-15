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
}

export enum Decision {
  FOLD = "fold",
  CHECK = "check",
  CALL = "call",
  RAISE = "raise",
}

export interface ActionDecision {
  action: Decision;
  raiseAmount?: bigint; // Only for RAISE
}

export type MaybePromise<T> = T | Promise<T>;

export interface Strategy {
  decide(context: DecisionContext): MaybePromise<ActionDecision>;
}
