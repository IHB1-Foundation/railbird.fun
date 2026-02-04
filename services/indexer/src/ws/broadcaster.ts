// WebSocket broadcaster - sends events to connected clients

import { getWsManager } from "./manager.js";
import type {
  WsActionData,
  WsHandStartedData,
  WsBettingRoundCompleteData,
  WsVRFRequestedData,
  WsCommunityCardsData,
  WsHandSettledData,
  WsSeatUpdatedData,
  WsPotUpdatedData,
  WsForceTimeoutData,
} from "./types.js";
import { gameStateToString, actionTypeToString } from "../events/abis.js";

// Broadcast action taken
export function broadcastAction(
  tableId: bigint,
  handId: bigint,
  seatIndex: number,
  action: number,
  amount: bigint,
  potAfter: bigint,
  blockNumber: bigint,
  txHash: string
): void {
  const data: WsActionData = {
    handId: handId.toString(),
    seatIndex,
    actionType: actionTypeToString(action),
    amount: amount.toString(),
    potAfter: potAfter.toString(),
    blockNumber: blockNumber.toString(),
    txHash,
  };
  getWsManager().broadcast(tableId.toString(), "action", data);
}

// Broadcast hand started
export function broadcastHandStarted(
  tableId: bigint,
  handId: bigint,
  smallBlind: bigint,
  bigBlind: bigint,
  buttonSeat: number
): void {
  const data: WsHandStartedData = {
    handId: handId.toString(),
    smallBlind: smallBlind.toString(),
    bigBlind: bigBlind.toString(),
    buttonSeat,
  };
  getWsManager().broadcast(tableId.toString(), "hand_started", data);
}

// Broadcast betting round complete
export function broadcastBettingRoundComplete(
  tableId: bigint,
  handId: bigint,
  fromState: number,
  toState: number
): void {
  const data: WsBettingRoundCompleteData = {
    handId: handId.toString(),
    fromState: gameStateToString(fromState),
    toState: gameStateToString(toState),
  };
  getWsManager().broadcast(tableId.toString(), "betting_round_complete", data);
}

// Broadcast VRF requested
export function broadcastVRFRequested(
  tableId: bigint,
  handId: bigint,
  street: number,
  requestId: bigint
): void {
  const data: WsVRFRequestedData = {
    handId: handId.toString(),
    street: gameStateToString(street),
    requestId: requestId.toString(),
  };
  getWsManager().broadcast(tableId.toString(), "vrf_requested", data);
}

// Broadcast community cards dealt
export function broadcastCommunityCards(
  tableId: bigint,
  handId: bigint,
  street: number,
  cards: readonly number[]
): void {
  const data: WsCommunityCardsData = {
    handId: handId.toString(),
    street: gameStateToString(street),
    cards: [...cards],
  };
  getWsManager().broadcast(tableId.toString(), "community_cards", data);
}

// Broadcast hand settled
export function broadcastHandSettled(
  tableId: bigint,
  handId: bigint,
  winnerSeat: number,
  potAmount: bigint
): void {
  const data: WsHandSettledData = {
    handId: handId.toString(),
    winnerSeat,
    potAmount: potAmount.toString(),
  };
  getWsManager().broadcast(tableId.toString(), "hand_settled", data);
}

// Broadcast seat updated
export function broadcastSeatUpdated(
  tableId: bigint,
  seatIndex: number,
  ownerAddress: string,
  operatorAddress: string,
  stack: bigint
): void {
  const data: WsSeatUpdatedData = {
    seatIndex,
    ownerAddress,
    operatorAddress,
    stack: stack.toString(),
  };
  getWsManager().broadcast(tableId.toString(), "seat_updated", data);
}

// Broadcast pot updated
export function broadcastPotUpdated(
  tableId: bigint,
  handId: bigint,
  pot: bigint
): void {
  const data: WsPotUpdatedData = {
    handId: handId.toString(),
    pot: pot.toString(),
  };
  getWsManager().broadcast(tableId.toString(), "pot_updated", data);
}

// Broadcast force timeout
export function broadcastForceTimeout(
  tableId: bigint,
  handId: bigint,
  seatIndex: number,
  forcedAction: number
): void {
  const data: WsForceTimeoutData = {
    handId: handId.toString(),
    seatIndex,
    forcedAction: actionTypeToString(forcedAction),
  };
  getWsManager().broadcast(tableId.toString(), "force_timeout", data);
}
