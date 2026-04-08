// Typed interfaces for decoded contract event arguments.
// Used to replace `as any` casts when dispatching to event handlers.

// ============ PokerTable Events ============

export interface SeatUpdatedArgs {
  seatIndex: number;
  owner: string;
  operator: string;
  stack: bigint;
}

export interface HandStartedArgs {
  handId: bigint;
  smallBlind: bigint;
  bigBlind: bigint;
  buttonSeat: number;
}

export interface ActionTakenArgs {
  handId: bigint;
  seatIndex: number;
  action: number;
  amount: bigint;
  potAfter: bigint;
}

export interface PotUpdatedArgs {
  handId: bigint;
  pot: bigint;
}

export interface BettingRoundCompleteArgs {
  handId: bigint;
  fromState: number;
  toState: number;
}

export interface VRFRequestedArgs {
  handId: bigint;
  street: number;
  requestId: bigint;
}

export interface CommunityCardsDealtArgs {
  handId: bigint;
  street: number;
  cards: readonly number[];
}

export interface HandSettledArgs {
  handId: bigint;
  winnerSeat: number;
  potAmount: bigint;
}

export interface ShowdownTimedOutArgs {
  handId: bigint;
  activePlayers: number;
  potAmount: bigint;
}

export interface ForceTimeoutArgs {
  handId: bigint;
  seatIndex: number;
  forcedAction: number;
}

export interface TournamentWinnerArgs {
  winner: `0x${string}`;
  seatIndex: number;
  finalStack: bigint;
}

export interface CardIntegrityViolationArgs {
  handId: bigint;
  seatIndex: number;
  card: number;
  communityIndex: number;
}

export interface HoleCardsRevealedArgs {
  handId: bigint;
  seatIndex: number;
  card1: number;
  card2: number;
}

// ============ PlayerRegistry Events ============

export interface AgentRegisteredArgs {
  token: string;
  owner: string;
  vault: string;
  table: string;
  operator: string;
  metaURI: string;
}

export interface OperatorUpdatedArgs {
  token: string;
  oldOperator: string;
  newOperator: string;
}

export interface OwnerUpdatedArgs {
  token: string;
  oldOwner: string;
  newOwner: string;
}

export interface VaultUpdatedArgs {
  token: string;
  oldVault: string;
  newVault: string;
}

export interface TableUpdatedArgs {
  token: string;
  oldTable: string;
  newTable: string;
}

export interface MetaURIUpdatedArgs {
  token: string;
  oldMetaURI: string;
  newMetaURI: string;
}

// ============ PlayerVault Events ============

export interface VaultSnapshotArgs {
  handId: bigint;
  A: bigint;
  B: bigint;
  N: bigint;
  P: bigint;
  cumulativePnl: bigint;
}

export interface RebalanceBuyArgs {
  handId: bigint;
  monIn: bigint;
  tokenOut: bigint;
  navBefore: bigint;
  navAfter: bigint;
}

export interface RebalanceSellArgs {
  handId: bigint;
  tokenIn: bigint;
  monOut: bigint;
  navBefore: bigint;
  navAfter: bigint;
}

export interface DecisionRevealedArgs {
  handId: bigint;
  seatIndex: number;
  action: string;
  reasoning: string;
}

export interface StrategyUpdatedArgs {
  agent: string;
  version: bigint;
  configHash: `0x${string}`;
  personaId: string;
  aggressionBps: number;
  tightnessBps: number;
  bluffFreqBps: number;
}
