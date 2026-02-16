// Event handlers for all contract events

import type { Log } from "viem";
import {
  isEventProcessed,
  markEventProcessed,
  upsertTable,
  updateTableState,
  upsertSeat,
  insertHand,
  updateHand,
  insertAction,
  insertSettlement,
  upsertAgent,
  updateAgentOperator,
  updateAgentOwner,
  updateAgentVault,
  updateAgentTable,
  updateAgentMetaUri,
  insertVaultSnapshot,
  getHand,
} from "../db/index.js";
import { gameStateToString, actionTypeToString } from "./abis.js";
import {
  broadcastAction,
  broadcastHandStarted,
  broadcastBettingRoundComplete,
  broadcastVRFRequested,
  broadcastCommunityCards,
  broadcastHandSettled,
  broadcastSeatUpdated,
  broadcastPotUpdated,
  broadcastForceTimeout,
} from "../ws/index.js";

export interface EventContext {
  tableId: bigint;
  contractAddress: string;
  smallBlind: bigint;
  bigBlind: bigint;
}

// Helper to extract and validate log metadata
function getLogMeta(log: Log): { blockNumber: bigint; logIndex: number; txHash: string } | null {
  const { blockNumber, logIndex, transactionHash } = log;
  if (blockNumber === null || logIndex === null || !transactionHash) {
    return null;
  }
  return { blockNumber, logIndex, txHash: transactionHash };
}

// ============ PokerTable Event Handlers ============

export async function handleSeatUpdated(
  log: Log,
  args: { seatIndex: number; owner: string; operator: string; stack: bigint },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  // Ensure table exists
  await upsertTable(ctx.tableId, ctx.contractAddress, ctx.smallBlind, ctx.bigBlind);

  // Upsert seat
  await upsertSeat(
    ctx.tableId,
    args.seatIndex,
    args.owner,
    args.operator,
    args.stack
  );

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "SeatUpdated");
  console.log(`[SeatUpdated] table=${ctx.tableId} seat=${args.seatIndex} stack=${args.stack}`);

  // Broadcast to WebSocket clients
  broadcastSeatUpdated(ctx.tableId, args.seatIndex, args.owner, args.operator, args.stack);
}

export async function handleHandStarted(
  log: Log,
  args: { handId: bigint; smallBlind: bigint; bigBlind: bigint; buttonSeat: number },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  // Insert hand
  const pot = args.smallBlind + args.bigBlind;
  await insertHand(
    ctx.tableId,
    args.handId,
    pot,
    args.buttonSeat,
    args.smallBlind,
    args.bigBlind,
    "BETTING_PRE"
  );

  // Update table state
  await updateTableState(ctx.tableId, "BETTING_PRE", args.handId, args.buttonSeat);

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "HandStarted");
  console.log(`[HandStarted] table=${ctx.tableId} hand=${args.handId} button=${args.buttonSeat}`);

  // Broadcast to WebSocket clients
  broadcastHandStarted(ctx.tableId, args.handId, args.smallBlind, args.bigBlind, args.buttonSeat);
}

export async function handleActionTaken(
  log: Log,
  args: { handId: bigint; seatIndex: number; action: number; amount: bigint; potAfter: bigint },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  const actionType = actionTypeToString(args.action);

  await insertAction(
    ctx.tableId,
    args.handId,
    args.seatIndex,
    actionType,
    args.amount,
    args.potAfter,
    meta.blockNumber,
    meta.txHash
  );

  // Update hand pot
  await updateHand(ctx.tableId, args.handId, { pot: args.potAfter });

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "ActionTaken");
  console.log(`[ActionTaken] hand=${args.handId} seat=${args.seatIndex} action=${actionType} amount=${args.amount}`);

  // Broadcast to WebSocket clients
  broadcastAction(
    ctx.tableId,
    args.handId,
    args.seatIndex,
    args.action,
    args.amount,
    args.potAfter,
    meta.blockNumber,
    meta.txHash
  );
}

export async function handlePotUpdated(
  log: Log,
  args: { handId: bigint; pot: bigint },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await updateHand(ctx.tableId, args.handId, { pot: args.pot });

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "PotUpdated");

  // Broadcast to WebSocket clients
  broadcastPotUpdated(ctx.tableId, args.handId, args.pot);
}

export async function handleBettingRoundComplete(
  log: Log,
  args: { handId: bigint; fromState: number; toState: number },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  const toStateStr = gameStateToString(args.toState);
  await updateHand(ctx.tableId, args.handId, { gameState: toStateStr });
  await updateTableState(ctx.tableId, toStateStr);

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "BettingRoundComplete");
  console.log(`[BettingRoundComplete] hand=${args.handId} ${gameStateToString(args.fromState)} -> ${toStateStr}`);

  // Broadcast to WebSocket clients
  broadcastBettingRoundComplete(ctx.tableId, args.handId, args.fromState, args.toState);
}

export async function handleVRFRequested(
  log: Log,
  args: { handId: bigint; street: number; requestId: bigint },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  // Just track the state transition - VRF request details are handled elsewhere
  const streetStr = gameStateToString(args.street);
  await updateTableState(ctx.tableId, streetStr);

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "VRFRequested");
  console.log(`[VRFRequested] hand=${args.handId} street=${streetStr} requestId=${args.requestId}`);

  // Broadcast to WebSocket clients
  broadcastVRFRequested(ctx.tableId, args.handId, args.street, args.requestId);
}

export async function handleCommunityCardsDealt(
  log: Log,
  args: { handId: bigint; street: number; cards: readonly number[] },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  // cards contains only newly dealt cards for this street (flop=3, turn=1, river=1).
  // Merge with already revealed community cards.
  const hand = await getHand(ctx.tableId, args.handId);
  const existingCards = Array.isArray(hand?.community_cards) ? hand.community_cards : [];
  const mergedCards = [...existingCards, ...args.cards];

  await updateHand(ctx.tableId, args.handId, {
    communityCards: mergedCards,
  });

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "CommunityCardsDealt");
  console.log(`[CommunityCardsDealt] hand=${args.handId} cards=[${args.cards.join(",")}]`);

  // Broadcast to WebSocket clients
  broadcastCommunityCards(ctx.tableId, args.handId, args.street, args.cards);
}

export async function handleHandSettled(
  log: Log,
  args: { handId: bigint; winnerSeat: number; potAmount: bigint },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  // Update hand
  await updateHand(ctx.tableId, args.handId, {
    winnerSeat: args.winnerSeat,
    settlementAmount: args.potAmount,
    settledAt: new Date(),
    gameState: "SETTLED",
  });

  // Insert settlement record
  await insertSettlement(
    ctx.tableId,
    args.handId,
    args.winnerSeat,
    args.potAmount,
    meta.blockNumber,
    meta.txHash
  );

  // Update table state
  await updateTableState(ctx.tableId, "SETTLED");

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "HandSettled");
  console.log(`[HandSettled] hand=${args.handId} winner=${args.winnerSeat} pot=${args.potAmount}`);

  // Broadcast to WebSocket clients
  broadcastHandSettled(ctx.tableId, args.handId, args.winnerSeat, args.potAmount);
}

export async function handleForceTimeout(
  log: Log,
  args: { handId: bigint; seatIndex: number; forcedAction: number },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  // ForceTimeout is informational - ActionTaken will handle the actual action
  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "ForceTimeout");
  console.log(`[ForceTimeout] hand=${args.handId} seat=${args.seatIndex} action=${actionTypeToString(args.forcedAction)}`);

  // Broadcast to WebSocket clients
  broadcastForceTimeout(ctx.tableId, args.handId, args.seatIndex, args.forcedAction);
}

// ============ PlayerRegistry Event Handlers ============

export async function handleAgentRegistered(
  log: Log,
  args: {
    token: string;
    owner: string;
    vault: string;
    table: string;
    operator: string;
    metaURI: string;
  }
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await upsertAgent(
    args.token,
    args.owner,
    args.operator,
    args.vault,
    args.table,
    args.metaURI
  );

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "AgentRegistered");
  console.log(`[AgentRegistered] token=${args.token} owner=${args.owner}`);
}

export async function handleOperatorUpdated(
  log: Log,
  args: { token: string; oldOperator: string; newOperator: string }
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await updateAgentOperator(args.token, args.newOperator);

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "OperatorUpdated");
  console.log(`[OperatorUpdated] token=${args.token} ${args.oldOperator} -> ${args.newOperator}`);
}

export async function handleOwnerUpdated(
  log: Log,
  args: { token: string; oldOwner: string; newOwner: string }
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await updateAgentOwner(args.token, args.newOwner);

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "OwnerUpdated");
  console.log(`[OwnerUpdated] token=${args.token} ${args.oldOwner} -> ${args.newOwner}`);
}

export async function handleVaultUpdated(
  log: Log,
  args: { token: string; oldVault: string; newVault: string }
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await updateAgentVault(args.token, args.newVault);

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "VaultUpdated");
  console.log(`[VaultUpdated] token=${args.token} ${args.oldVault} -> ${args.newVault}`);
}

export async function handleTableUpdated(
  log: Log,
  args: { token: string; oldTable: string; newTable: string }
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await updateAgentTable(args.token, args.newTable);

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "TableUpdated");
  console.log(`[TableUpdated] token=${args.token} ${args.oldTable} -> ${args.newTable}`);
}

export async function handleMetaURIUpdated(
  log: Log,
  args: { token: string; oldMetaURI: string; newMetaURI: string }
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await updateAgentMetaUri(args.token, args.newMetaURI);

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "MetaURIUpdated");
  console.log(`[MetaURIUpdated] token=${args.token}`);
}

// ============ PlayerVault Event Handlers ============

export async function handleVaultSnapshot(
  log: Log,
  args: {
    handId: bigint;
    A: bigint;
    B: bigint;
    N: bigint;
    P: bigint;
    cumulativePnl: bigint;
  },
  vaultAddress: string
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await insertVaultSnapshot(
    vaultAddress,
    args.handId,
    args.A,
    args.B,
    args.N,
    args.P,
    args.cumulativePnl,
    meta.blockNumber
  );

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "VaultSnapshot");
  console.log(`[VaultSnapshot] vault=${vaultAddress} hand=${args.handId} A=${args.A} P=${args.P}`);
}
