// WebSocket message types for table streaming

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
  | "force_timeout"
  | "error";

export interface WsMessage {
  type: WsMessageType;
  tableId: string;
  timestamp: string;
  data: unknown;
}

export interface WsConnectedData {
  message: string;
}

export interface WsActionData {
  handId: string;
  seatIndex: number;
  actionType: string;
  amount: string;
  potAfter: string;
  blockNumber: string;
  txHash: string;
}

export interface WsHandStartedData {
  handId: string;
  smallBlind: string;
  bigBlind: string;
  buttonSeat: number;
}

export interface WsBettingRoundCompleteData {
  handId: string;
  fromState: string;
  toState: string;
}

export interface WsVRFRequestedData {
  handId: string;
  street: string;
  requestId: string;
}

export interface WsCommunityCardsData {
  handId: string;
  street: string;
  cards: number[];
}

export interface WsHandSettledData {
  handId: string;
  winnerSeat: number;
  potAmount: string;
}

export interface WsSeatUpdatedData {
  seatIndex: number;
  ownerAddress: string;
  operatorAddress: string;
  stack: string;
}

export interface WsPotUpdatedData {
  handId: string;
  pot: string;
}

export interface WsForceTimeoutData {
  handId: string;
  seatIndex: number;
  forcedAction: string;
}

export interface WsErrorData {
  code: string;
  message: string;
}
