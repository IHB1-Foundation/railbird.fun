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
  insertRebalanceEvent,
  insertRevealedHolecard,
  insertDecisionVerification,
  insertStrategyRecord,
  getHand,
  getSeats,
  getEloRatings,
  upsertEloRating,
  insertEloHistory,
} from "../db/index.js";
import { computeHandEloUpdates } from "../elo/calculator.js";
import { gameStateToString, actionTypeToString } from "./abis.js";
import { createLogger } from "@playerco/shared";

const logger = createLogger({ service: "indexer" });
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
  logger.info({ tableId: ctx.tableId.toString(), seatIndex: args.seatIndex, stack: args.stack.toString() }, 'SeatUpdated');

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
  logger.info({ tableId: ctx.tableId.toString(), handId: args.handId.toString(), buttonSeat: args.buttonSeat }, 'HandStarted');

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
  logger.info({ handId: args.handId.toString(), seatIndex: args.seatIndex, actionType, amount: args.amount.toString() }, 'ActionTaken');

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
  logger.info({ handId: args.handId.toString(), fromState: gameStateToString(args.fromState), toState: toStateStr }, 'BettingRoundComplete');

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
  logger.info({ handId: args.handId.toString(), street: streetStr, requestId: args.requestId.toString() }, 'VRFRequested');

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
  logger.info({ handId: args.handId.toString(), cards: [...args.cards] }, 'CommunityCardsDealt');

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
  logger.info({ handId: args.handId.toString(), winnerSeat: args.winnerSeat, pot: args.potAmount.toString() }, 'HandSettled');

  // Update ELO ratings for all participants (non-blocking, best-effort)
  updateEloAfterSettlement(ctx.tableId, args.handId, args.winnerSeat).catch((err: unknown) => {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "ELO update failed (non-fatal)");
  });

  // Broadcast to WebSocket clients
  broadcastHandSettled(ctx.tableId, args.handId, args.winnerSeat, args.potAmount);
}

export async function handleShowdownTimedOut(
  log: Log,
  args: { handId: bigint; activePlayers: number; potAmount: bigint }
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;

  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "ShowdownTimedOut");
  logger.info({ handId: args.handId.toString(), activePlayers: args.activePlayers, pot: args.potAmount.toString() }, 'ShowdownTimedOut');
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
  logger.info({ handId: args.handId.toString(), seatIndex: args.seatIndex, forcedAction: actionTypeToString(args.forcedAction) }, 'ForceTimeout');

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
  logger.info({ token: args.token, owner: args.owner }, 'AgentRegistered');
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
  logger.info({ token: args.token, oldOperator: args.oldOperator, newOperator: args.newOperator }, 'OperatorUpdated');
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
  logger.info({ token: args.token, oldOwner: args.oldOwner, newOwner: args.newOwner }, 'OwnerUpdated');
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
  logger.info({ token: args.token, oldVault: args.oldVault, newVault: args.newVault }, 'VaultUpdated');
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
  logger.info({ token: args.token, oldTable: args.oldTable, newTable: args.newTable }, 'TableUpdated');
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
  logger.info({ token: args.token }, 'MetaURIUpdated');
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
  logger.info({ vaultAddress, handId: args.handId.toString(), A: args.A.toString(), P: args.P.toString() }, 'VaultSnapshot');
}

export async function handleTournamentWinner(
  log: Log,
  args: { winner: `0x${string}`; seatIndex: number; finalStack: bigint },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;
  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;
  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "TournamentWinner");
  logger.info({ tableId: ctx.tableId.toString(), winner: args.winner, seatIndex: args.seatIndex, finalStack: args.finalStack.toString() }, 'TournamentWinner');
}

export async function handleCardIntegrityViolation(
  log: Log,
  args: { handId: bigint; seatIndex: number; card: number; communityIndex: number },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;
  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;
  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "CardIntegrityViolation");
  logger.error({ tableId: ctx.tableId.toString(), handId: args.handId.toString(), seatIndex: args.seatIndex, card: args.card, communityIndex: args.communityIndex }, 'CardIntegrityViolation INTEGRITY ALERT');
}

export async function handleHoleCardsRevealed(
  log: Log,
  args: { handId: bigint; seatIndex: number; card1: number; card2: number },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;
  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await insertRevealedHolecard(
    ctx.tableId,
    args.handId,
    args.seatIndex,
    args.card1,
    args.card2,
    meta.blockNumber,
    meta.txHash
  );

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "HoleCardsRevealed");
  logger.info({ handId: args.handId.toString(), seatIndex: args.seatIndex, cards: [args.card1, args.card2] }, 'HoleCardsRevealed');
}

export async function handleRebalanceBuy(
  log: Log,
  args: { handId: bigint; monIn: bigint; tokenOut: bigint; navBefore: bigint; navAfter: bigint },
  vaultAddress: string
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;
  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;
  await insertRebalanceEvent(
    vaultAddress,
    args.handId,
    "buy",
    args.monIn,
    args.tokenOut,
    args.navBefore,
    args.navAfter,
    meta.blockNumber,
    meta.txHash
  );
  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "RebalanceBuy");
  logger.info({ vaultAddress, handId: args.handId.toString(), monIn: args.monIn.toString(), tokenOut: args.tokenOut.toString() }, 'RebalanceBuy');
}

export async function handleRebalanceSell(
  log: Log,
  args: { handId: bigint; tokenIn: bigint; monOut: bigint; navBefore: bigint; navAfter: bigint },
  vaultAddress: string
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;
  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;
  await insertRebalanceEvent(
    vaultAddress,
    args.handId,
    "sell",
    args.tokenIn,
    args.monOut,
    args.navBefore,
    args.navAfter,
    meta.blockNumber,
    meta.txHash
  );
  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "RebalanceSell");
  logger.info({ vaultAddress, handId: args.handId.toString(), tokenIn: args.tokenIn.toString(), monOut: args.monOut.toString() }, 'RebalanceSell');
}

// ─── ELO helpers ─────────────────────────────────────────────────────────────

/**
 * Update ELO ratings for all participants of the settled hand.
 * Seats without a linked agent token address are skipped.
 */
async function updateEloAfterSettlement(
  tableId: bigint,
  handId: bigint,
  winnerSeat: number
): Promise<void> {
  const seats = await getSeats(tableId);
  // Only seats with an agent token address participate in ELO
  const participants = seats
    .filter((s): s is typeof s & { token_address: string } =>
      !!(s as any).token_address &&
      (s as any).token_address !== "0x0000000000000000000000000000000000000000"
    )
    .map((s) => ({
      tokenAddress: (s as any).token_address as string,
      seatIndex: s.seat_index,
    }));

  if (participants.length < 2) return;

  // Load current ratings and hands-played counts
  const tokenAddresses = participants.map((p) => p.tokenAddress);
  const currentRatingsMap = await getEloRatings(tokenAddresses);

  const ratings = new Map(
    tokenAddresses.map((addr) => [addr, currentRatingsMap.get(addr)?.rating ?? 1500])
  );
  const handsPlayed = new Map(
    tokenAddresses.map((addr) => [addr, currentRatingsMap.get(addr)?.handsPlayed ?? 0])
  );

  const updates = computeHandEloUpdates(participants, winnerSeat, ratings, handsPlayed);
  const winner = participants.find((p) => p.seatIndex === winnerSeat);

  // Persist all updates
  for (const update of updates) {
    await upsertEloRating(update.tokenAddress, update.ratingAfter, 1);
    // Insert history record for the winner/loser pair
    const isWinner = winner?.tokenAddress === update.tokenAddress;
    const opponent = isWinner
      ? participants.find((p) => p.seatIndex !== winnerSeat)?.tokenAddress ?? ""
      : winner?.tokenAddress ?? "";
    if (opponent) {
      await insertEloHistory(
        update.tokenAddress,
        handId,
        opponent,
        isWinner ? "win" : "loss",
        update.ratingBefore,
        update.ratingAfter,
        update.kFactor
      );
    }
  }

  logger.info({
    handId: handId.toString(),
    participants: updates.length,
    winnerSeat,
    updates: updates.map((u) => ({ addr: u.tokenAddress.slice(0, 8), before: u.ratingBefore, after: u.ratingAfter })),
  }, "ELO ratings updated");
}

/**
 * Handle DecisionRevealed: store verified AI decision in DB.
 * This allows ActionResponse.verified to be true for this (handId, seatIndex).
 */
export async function handleDecisionRevealed(
  log: Log,
  args: { handId: bigint; seatIndex: number; action: string; reasoning: string },
  ctx: EventContext
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;
  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await insertDecisionVerification(
    ctx.tableId,
    args.handId,
    args.seatIndex,
    args.action,
    args.reasoning,
    meta.txHash,
    meta.blockNumber
  );

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "DecisionRevealed");
  logger.info(
    { handId: args.handId.toString(), seatIndex: args.seatIndex, action: args.action, txHash: meta.txHash },
    "DecisionRevealed — AI decision verified on-chain"
  );
}


export async function handleStrategyUpdated(
  log: import("viem").Log,
  args: {
    agent: string;
    version: bigint;
    configHash: `0x${string}`;
    personaId: string;
    aggressionBps: number;
    tightnessBps: number;
    bluffFreqBps: number;
  }
): Promise<void> {
  const meta = getLogMeta(log);
  if (!meta) return;
  if (await isEventProcessed(meta.blockNumber, meta.logIndex)) return;

  await insertStrategyRecord(
    args.agent,
    args.version,
    args.configHash,
    args.personaId,
    args.aggressionBps,
    args.tightnessBps,
    args.bluffFreqBps,
    meta.blockNumber,
    meta.txHash,
  );

  await markEventProcessed(meta.blockNumber, meta.logIndex, meta.txHash, "StrategyUpdated");
  logger.info(
    { agent: args.agent, version: args.version.toString(), personaId: args.personaId },
    "StrategyUpdated — on-chain strategy version recorded"
  );
}
