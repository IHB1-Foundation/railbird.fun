// Database repository - all DB operations

import { query } from "./pool.js";
import type {
  PokerTable,
  SeatWithTokenAddress,
  Hand,
  Action,
  Agent,
  VaultSnapshot,
  Settlement,
  IndexerState,
  RebalanceEvent,
  RevealedHolecard,
} from "./types.js";

// ============ Event Idempotency ============

export async function isEventProcessed(blockNumber: bigint, logIndex: number): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM processed_events
      WHERE block_number = $1 AND log_index = $2
    ) as exists`,
    [blockNumber.toString(), logIndex],
  );
  return result.rows[0]?.exists ?? false;
}

export async function markEventProcessed(
  blockNumber: bigint,
  logIndex: number,
  txHash: string,
  eventName: string,
): Promise<void> {
  await query(
    `INSERT INTO processed_events (block_number, log_index, tx_hash, event_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (block_number, log_index) DO NOTHING`,
    [blockNumber.toString(), logIndex, txHash, eventName],
  );
}

export async function getIndexerState(): Promise<IndexerState | null> {
  const result = await query<IndexerState>(`SELECT * FROM indexer_state WHERE id = 1`);
  return result.rows[0] || null;
}

export async function updateIndexerState(blockNumber: bigint, logIndex: number): Promise<void> {
  await query(
    `UPDATE indexer_state
     SET last_processed_block = $1, last_processed_log_index = $2, updated_at = NOW()
     WHERE id = 1`,
    [blockNumber.toString(), logIndex],
  );
}

// ============ Poker Tables ============

export async function upsertTable(
  tableId: bigint,
  contractAddress: string,
  smallBlind: bigint,
  bigBlind: bigint,
): Promise<void> {
  await query(
    `INSERT INTO poker_tables (table_id, contract_address, small_blind, big_blind)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (table_id) DO UPDATE SET
       contract_address = EXCLUDED.contract_address,
       small_blind = EXCLUDED.small_blind,
       big_blind = EXCLUDED.big_blind,
       updated_at = NOW()`,
    [tableId.toString(), contractAddress, smallBlind.toString(), bigBlind.toString()],
  );
}

export async function updateTableState(
  tableId: bigint,
  gameState: string,
  currentHandId?: bigint,
  buttonSeat?: number,
  actionDeadline?: Date | null,
): Promise<void> {
  const updates: string[] = ["game_state = $2", "updated_at = NOW()"];
  const params: unknown[] = [tableId.toString(), gameState];
  let paramIndex = 3;

  if (currentHandId !== undefined) {
    updates.push(`current_hand_id = $${paramIndex}`);
    params.push(currentHandId.toString());
    paramIndex++;
  }
  if (buttonSeat !== undefined) {
    updates.push(`button_seat = $${paramIndex}`);
    params.push(buttonSeat);
    paramIndex++;
  }
  if (actionDeadline !== undefined) {
    updates.push(`action_deadline = $${paramIndex}`);
    params.push(actionDeadline);
    paramIndex++;
  }

  await query(`UPDATE poker_tables SET ${updates.join(", ")} WHERE table_id = $1`, params);
}

export async function getTable(tableId: bigint): Promise<PokerTable | null> {
  const result = await query<PokerTable>(`SELECT * FROM poker_tables WHERE table_id = $1`, [
    tableId.toString(),
  ]);
  return result.rows[0] || null;
}

export async function getAllTables(): Promise<PokerTable[]> {
  const result = await query<PokerTable>(`SELECT * FROM poker_tables ORDER BY table_id`);
  return result.rows;
}

// ============ Seats ============

export async function upsertSeat(
  tableId: bigint,
  seatIndex: number,
  ownerAddress: string,
  operatorAddress: string,
  stack: bigint,
  isActive = false,
  currentBet: bigint = 0n,
): Promise<void> {
  await query(
    `INSERT INTO seats (table_id, seat_index, owner_address, operator_address, stack, is_active, current_bet)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (table_id, seat_index) DO UPDATE SET
       owner_address = EXCLUDED.owner_address,
       operator_address = EXCLUDED.operator_address,
       stack = EXCLUDED.stack,
       is_active = EXCLUDED.is_active,
       current_bet = EXCLUDED.current_bet,
       updated_at = NOW()`,
    [
      tableId.toString(),
      seatIndex,
      ownerAddress.toLowerCase(),
      operatorAddress.toLowerCase(),
      stack.toString(),
      isActive,
      currentBet.toString(),
    ],
  );
}

export async function updateSeatStack(
  tableId: bigint,
  seatIndex: number,
  stack: bigint,
): Promise<void> {
  await query(
    `UPDATE seats SET stack = $3, updated_at = NOW()
     WHERE table_id = $1 AND seat_index = $2`,
    [tableId.toString(), seatIndex, stack.toString()],
  );
}

export async function getSeats(tableId: bigint): Promise<SeatWithTokenAddress[]> {
  const result = await query<SeatWithTokenAddress>(
    `SELECT s.*, a.token_address
     FROM seats s
     LEFT JOIN agents a ON a.owner_address = s.owner_address
     WHERE s.table_id = $1 ORDER BY s.seat_index`,
    [tableId.toString()],
  );
  return result.rows;
}

// ============ Hands ============

export async function insertHand(
  tableId: bigint,
  handId: bigint,
  pot: bigint,
  buttonSeat: number,
  smallBlind: bigint,
  bigBlind: bigint,
  gameState: string,
): Promise<void> {
  await query(
    `INSERT INTO hands (table_id, hand_id, pot, button_seat, small_blind, big_blind, game_state)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (table_id, hand_id) DO UPDATE SET
       pot = EXCLUDED.pot,
       game_state = EXCLUDED.game_state`,
    [
      tableId.toString(),
      handId.toString(),
      pot.toString(),
      buttonSeat,
      smallBlind.toString(),
      bigBlind.toString(),
      gameState,
    ],
  );
}

export async function updateHand(
  tableId: bigint,
  handId: bigint,
  updates: Partial<{
    pot: bigint;
    currentBet: bigint;
    actorSeat: number;
    gameState: string;
    communityCards: number[];
    winnerSeat: number;
    settlementAmount: bigint;
    settledAt: Date;
  }>,
): Promise<void> {
  const setClauses: string[] = [];
  const params: unknown[] = [tableId.toString(), handId.toString()];
  let paramIndex = 3;

  if (updates.pot !== undefined) {
    setClauses.push(`pot = $${paramIndex++}`);
    params.push(updates.pot.toString());
  }
  if (updates.currentBet !== undefined) {
    setClauses.push(`current_bet = $${paramIndex++}`);
    params.push(updates.currentBet.toString());
  }
  if (updates.actorSeat !== undefined) {
    setClauses.push(`actor_seat = $${paramIndex++}`);
    params.push(updates.actorSeat);
  }
  if (updates.gameState !== undefined) {
    setClauses.push(`game_state = $${paramIndex++}`);
    params.push(updates.gameState);
  }
  if (updates.communityCards !== undefined) {
    setClauses.push(`community_cards = $${paramIndex++}`);
    params.push(updates.communityCards);
  }
  if (updates.winnerSeat !== undefined) {
    setClauses.push(`winner_seat = $${paramIndex++}`);
    params.push(updates.winnerSeat);
  }
  if (updates.settlementAmount !== undefined) {
    setClauses.push(`settlement_amount = $${paramIndex++}`);
    params.push(updates.settlementAmount.toString());
  }
  if (updates.settledAt !== undefined) {
    setClauses.push(`settled_at = $${paramIndex++}`);
    params.push(updates.settledAt);
  }

  if (setClauses.length === 0) return;

  await query(
    `UPDATE hands SET ${setClauses.join(", ")} WHERE table_id = $1 AND hand_id = $2`,
    params,
  );
}

export async function getHand(tableId: bigint, handId: bigint): Promise<Hand | null> {
  const result = await query<Hand>(`SELECT * FROM hands WHERE table_id = $1 AND hand_id = $2`, [
    tableId.toString(),
    handId.toString(),
  ]);
  return result.rows[0] || null;
}

export async function getTableHands(tableId: bigint, limit = 10): Promise<Hand[]> {
  const result = await query<Hand>(
    `SELECT * FROM hands WHERE table_id = $1 ORDER BY hand_id DESC LIMIT $2`,
    [tableId.toString(), limit],
  );
  return result.rows;
}

// ============ Actions ============

export async function insertAction(
  tableId: bigint,
  handId: bigint,
  seatIndex: number,
  actionType: string,
  amount: bigint,
  potAfter: bigint,
  blockNumber: bigint,
  txHash: string,
): Promise<void> {
  await query(
    `INSERT INTO actions (table_id, hand_id, seat_index, action_type, amount, pot_after, block_number, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      tableId.toString(),
      handId.toString(),
      seatIndex,
      actionType,
      amount.toString(),
      potAfter.toString(),
      blockNumber.toString(),
      txHash,
    ],
  );
}

export async function getHandActions(tableId: bigint, handId: bigint): Promise<Action[]> {
  const result = await query<Action>(
    `SELECT
       a.*,
       EXISTS(
         SELECT 1
         FROM processed_events pe
         WHERE pe.tx_hash = a.tx_hash
           AND pe.event_name = 'BettingRoundComplete'
       ) AS ends_street,
       dv.reveal_tx_hash IS NOT NULL AS verified,
       dv.reveal_tx_hash
     FROM actions a
     LEFT JOIN decision_verifications dv
       ON dv.table_id = a.table_id
      AND dv.hand_id = a.hand_id
      AND dv.seat_index = a.seat_index
     WHERE a.table_id = $1 AND a.hand_id = $2
     ORDER BY a.id`,
    [tableId.toString(), handId.toString()],
  );
  return result.rows;
}

export async function insertDecisionVerification(
  tableId: bigint,
  handId: bigint,
  seatIndex: number,
  action: string,
  reasoning: string,
  revealTxHash: string,
  blockNumber: bigint,
): Promise<void> {
  await query(
    `INSERT INTO decision_verifications
       (table_id, hand_id, seat_index, action, reasoning, reveal_tx_hash, block_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (table_id, hand_id, seat_index) DO UPDATE SET
       action = EXCLUDED.action,
       reasoning = EXCLUDED.reasoning,
       reveal_tx_hash = EXCLUDED.reveal_tx_hash,
       block_number = EXCLUDED.block_number`,
    [
      tableId.toString(),
      handId.toString(),
      seatIndex,
      action,
      reasoning,
      revealTxHash,
      blockNumber.toString(),
    ],
  );
}

// ============ Agents ============

export async function upsertAgent(
  tokenAddress: string,
  ownerAddress: string,
  operatorAddress: string,
  vaultAddress?: string | null,
  tableAddress?: string | null,
  metaUri?: string | null,
): Promise<void> {
  await query(
    `INSERT INTO agents (token_address, owner_address, operator_address, vault_address, table_address, meta_uri)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (token_address) DO UPDATE SET
       owner_address = EXCLUDED.owner_address,
       operator_address = EXCLUDED.operator_address,
       vault_address = COALESCE(EXCLUDED.vault_address, agents.vault_address),
       table_address = COALESCE(EXCLUDED.table_address, agents.table_address),
       meta_uri = COALESCE(EXCLUDED.meta_uri, agents.meta_uri),
       updated_at = NOW()`,
    [
      tokenAddress.toLowerCase(),
      ownerAddress.toLowerCase(),
      operatorAddress.toLowerCase(),
      vaultAddress?.toLowerCase() || null,
      tableAddress?.toLowerCase() || null,
      metaUri || null,
    ],
  );
}

export async function updateAgentOperator(
  tokenAddress: string,
  operatorAddress: string,
): Promise<void> {
  await query(
    `UPDATE agents SET operator_address = $2, updated_at = NOW()
     WHERE token_address = $1`,
    [tokenAddress.toLowerCase(), operatorAddress.toLowerCase()],
  );
}

export async function updateAgentOwner(tokenAddress: string, ownerAddress: string): Promise<void> {
  await query(
    `UPDATE agents SET owner_address = $2, updated_at = NOW()
     WHERE token_address = $1`,
    [tokenAddress.toLowerCase(), ownerAddress.toLowerCase()],
  );
}

export async function updateAgentVault(tokenAddress: string, vaultAddress: string): Promise<void> {
  await query(
    `UPDATE agents SET vault_address = $2, updated_at = NOW()
     WHERE token_address = $1`,
    [tokenAddress.toLowerCase(), vaultAddress.toLowerCase()],
  );
}

export async function updateAgentTable(tokenAddress: string, tableAddress: string): Promise<void> {
  await query(
    `UPDATE agents SET table_address = $2, updated_at = NOW()
     WHERE token_address = $1`,
    [tokenAddress.toLowerCase(), tableAddress.toLowerCase()],
  );
}

export async function updateAgentMetaUri(tokenAddress: string, metaUri: string): Promise<void> {
  await query(
    `UPDATE agents SET meta_uri = $2, updated_at = NOW()
     WHERE token_address = $1`,
    [tokenAddress.toLowerCase(), metaUri],
  );
}

export async function getAgent(tokenAddress: string): Promise<Agent | null> {
  const result = await query<Agent>(`SELECT * FROM agents WHERE token_address = $1`, [
    tokenAddress.toLowerCase(),
  ]);
  return result.rows[0] || null;
}

export async function getAllAgents(): Promise<Agent[]> {
  const result = await query<Agent>(
    `SELECT * FROM agents WHERE is_registered = true ORDER BY created_at DESC`,
  );
  return result.rows;
}

export async function getAllAgentsPaginated(
  page: number,
  limit: number,
): Promise<{ rows: Agent[]; total: number }> {
  const offset = (page - 1) * limit;
  const [dataResult, countResult] = await Promise.all([
    query<Agent>(
      `SELECT * FROM agents WHERE is_registered = true ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset],
    ),
    query<{ count: string }>(`SELECT COUNT(*) AS count FROM agents WHERE is_registered = true`),
  ]);
  return {
    rows: dataResult.rows,
    total: parseInt(countResult.rows[0]?.count ?? "0", 10),
  };
}

export async function getAgentHands(tokenAddress: string, limit = 20): Promise<Hand[]> {
  const agent = await getAgent(tokenAddress);
  if (!agent) return [];

  const result = await query<Hand>(
    `SELECT DISTINCT h.*
     FROM hands h
     JOIN seats s ON s.table_id::text = h.table_id
     WHERE s.owner_address = $1
       AND h.game_state IN ('10', '11', 'SHOWDOWN', 'SETTLED', 'TOURNAMENT_OVER')
     ORDER BY h.settled_at DESC NULLS LAST, h.hand_id DESC
     LIMIT $2`,
    [agent.owner_address.toLowerCase(), limit],
  );
  return result.rows;
}

export async function getAgentsByOwner(ownerAddress: string): Promise<Agent[]> {
  const result = await query<Agent>(
    `SELECT * FROM agents WHERE is_registered = true AND owner_address = $1 ORDER BY created_at DESC`,
    [ownerAddress.toLowerCase()],
  );
  return result.rows;
}

// ============ Vault Snapshots ============

export async function insertVaultSnapshot(
  vaultAddress: string,
  handId: bigint,
  externalAssets: bigint,
  treasuryShares: bigint,
  outstandingShares: bigint,
  navPerShare: bigint,
  cumulativePnl: bigint,
  blockNumber: bigint,
): Promise<void> {
  await query(
    `INSERT INTO vault_snapshots
       (vault_address, hand_id, external_assets, treasury_shares, outstanding_shares, nav_per_share, cumulative_pnl, block_number)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      vaultAddress.toLowerCase(),
      handId.toString(),
      externalAssets.toString(),
      treasuryShares.toString(),
      outstandingShares.toString(),
      navPerShare.toString(),
      cumulativePnl.toString(),
      blockNumber.toString(),
    ],
  );
}

export async function getLatestVaultSnapshot(vaultAddress: string): Promise<VaultSnapshot | null> {
  const result = await query<VaultSnapshot>(
    `SELECT * FROM vault_snapshots
     WHERE vault_address = $1
     ORDER BY block_number DESC, id DESC
     LIMIT 1`,
    [vaultAddress.toLowerCase()],
  );
  return result.rows[0] || null;
}

export async function getVaultSnapshots(
  vaultAddress: string,
  limit = 100,
): Promise<VaultSnapshot[]> {
  const result = await query<VaultSnapshot>(
    `SELECT * FROM vault_snapshots
     WHERE vault_address = $1
     ORDER BY block_number DESC, id DESC
     LIMIT $2`,
    [vaultAddress.toLowerCase(), limit],
  );
  return result.rows;
}

// ============ Settlements ============

export async function insertSettlement(
  tableId: bigint,
  handId: bigint,
  winnerSeat: number,
  potAmount: bigint,
  blockNumber: bigint,
  txHash: string,
): Promise<void> {
  await query(
    `INSERT INTO settlements (table_id, hand_id, winner_seat, pot_amount, block_number, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      tableId.toString(),
      handId.toString(),
      winnerSeat,
      potAmount.toString(),
      blockNumber.toString(),
      txHash,
    ],
  );
}

export async function getSettlement(tableId: bigint, handId: bigint): Promise<Settlement | null> {
  const result = await query<Settlement>(
    `SELECT * FROM settlements WHERE table_id = $1 AND hand_id = $2`,
    [tableId.toString(), handId.toString()],
  );
  return result.rows[0] || null;
}

// ============ Leaderboard ============

export interface AgentLeaderboardData {
  token_address: string;
  owner_address: string;
  meta_uri: string | null;
  vault_address: string | null;
  // Initial state (for ROI calculation)
  initial_nav_per_share: string | null;
  // Current/latest state
  current_nav_per_share: string | null;
  cumulative_pnl: string | null;
  // Peak nav for MDD calculation
  peak_nav_per_share: string | null;
  // Win/loss stats from settlements in period
  total_hands: number;
  winning_hands: number;
}

export async function getLeaderboardData(
  periodStart: Date | null,
): Promise<AgentLeaderboardData[]> {
  // This query aggregates:
  // 1. Agent info
  // 2. Initial NAV (first snapshot or snapshot at period start)
  // 3. Current NAV (latest snapshot)
  // 4. Peak NAV (max NAV in period for MDD)
  // 5. Win/loss stats from settlements

  const periodCondition = periodStart ? `AND vs.created_at >= $1` : "";
  const settlementCondition = periodStart ? `AND s.created_at >= $1` : "";

  const params = periodStart ? [periodStart.toISOString()] : [];

  const sql = `
    WITH agent_snapshots AS (
      SELECT
        a.token_address,
        a.owner_address,
        a.meta_uri,
        a.vault_address,
        vs.nav_per_share,
        vs.cumulative_pnl,
        vs.created_at,
        ROW_NUMBER() OVER (PARTITION BY a.token_address ORDER BY vs.created_at ASC) as first_rank,
        ROW_NUMBER() OVER (PARTITION BY a.token_address ORDER BY vs.created_at DESC) as last_rank,
        MAX(vs.nav_per_share::numeric) OVER (PARTITION BY a.token_address) as peak_nav
      FROM agents a
      LEFT JOIN vault_snapshots vs ON a.vault_address = vs.vault_address
      WHERE a.is_registered = true
      ${periodCondition}
    ),
    initial_snapshots AS (
      SELECT token_address, nav_per_share as initial_nav
      FROM agent_snapshots
      WHERE first_rank = 1
    ),
    latest_snapshots AS (
      SELECT token_address, nav_per_share as current_nav, cumulative_pnl, peak_nav
      FROM agent_snapshots
      WHERE last_rank = 1
    ),
    win_stats AS (
      SELECT
        a.token_address,
        COUNT(s.id) as total_hands,
        COUNT(CASE
          WHEN (s.winner_seat = 0 AND se.seat_index = 0) OR
               (s.winner_seat = 1 AND se.seat_index = 1)
          THEN 1
        END) as winning_hands
      FROM agents a
      LEFT JOIN seats se ON a.owner_address = se.owner_address
      LEFT JOIN settlements s ON se.table_id::text = s.table_id
        AND s.table_id IS NOT NULL
        ${settlementCondition}
      WHERE a.is_registered = true
      GROUP BY a.token_address
    )
    SELECT
      a.token_address,
      a.owner_address,
      a.meta_uri,
      a.vault_address,
      i.initial_nav as initial_nav_per_share,
      l.current_nav as current_nav_per_share,
      l.cumulative_pnl,
      l.peak_nav::text as peak_nav_per_share,
      COALESCE(w.total_hands, 0)::int as total_hands,
      COALESCE(w.winning_hands, 0)::int as winning_hands
    FROM agents a
    LEFT JOIN initial_snapshots i ON a.token_address = i.token_address
    LEFT JOIN latest_snapshots l ON a.token_address = l.token_address
    LEFT JOIN win_stats w ON a.token_address = w.token_address
    WHERE a.is_registered = true
  `;

  const result = await query<AgentLeaderboardData>(sql, params);
  return result.rows;
}

export async function getAgentSettlementsInPeriod(
  tokenAddress: string,
  periodStart: Date | null,
): Promise<{ total: number; wins: number }> {
  // Get agent's vault to find their table/seat
  const agent = await getAgent(tokenAddress);
  if (!agent || !agent.vault_address) {
    return { total: 0, wins: 0 };
  }

  const periodCondition = periodStart ? `AND s.created_at >= $2` : "";
  const params = periodStart
    ? [agent.owner_address.toLowerCase(), periodStart.toISOString()]
    : [agent.owner_address.toLowerCase()];

  // Find settlements where this agent's seat won
  const sql = `
    SELECT
      COUNT(*) as total,
      COUNT(CASE
        WHEN (s.winner_seat = se.seat_index)
        THEN 1
      END) as wins
    FROM seats se
    JOIN settlements s ON se.table_id::text = s.table_id
    WHERE se.owner_address = $1
    ${periodCondition}
  `;

  const result = await query<{ total: string; wins: string }>(sql, params);
  const row = result.rows[0];
  return {
    total: parseInt(row?.total || "0"),
    wins: parseInt(row?.wins || "0"),
  };
}

export async function getVaultSnapshotsInPeriod(
  vaultAddress: string,
  periodStart: Date | null,
): Promise<VaultSnapshot[]> {
  const periodCondition = periodStart ? `AND created_at >= $2` : "";
  const params = periodStart
    ? [vaultAddress.toLowerCase(), periodStart.toISOString()]
    : [vaultAddress.toLowerCase()];

  const result = await query<VaultSnapshot>(
    `SELECT * FROM vault_snapshots
     WHERE vault_address = $1
     ${periodCondition}
     ORDER BY created_at ASC`,
    params,
  );
  return result.rows;
}

// ============ Rebalance Events ============

export async function insertRebalanceEvent(
  vaultAddress: string,
  handId: bigint,
  direction: "buy" | "sell",
  amountIn: bigint,
  amountOut: bigint,
  navBefore: bigint,
  navAfter: bigint,
  blockNumber: bigint,
  txHash: string,
): Promise<void> {
  await query(
    `INSERT INTO rebalance_events
       (vault_address, hand_id, direction, amount_in, amount_out, nav_before, nav_after, block_number, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      vaultAddress.toLowerCase(),
      handId.toString(),
      direction,
      amountIn.toString(),
      amountOut.toString(),
      navBefore.toString(),
      navAfter.toString(),
      blockNumber.toString(),
      txHash,
    ],
  );
}

export async function getRebalanceEvents(
  vaultAddress: string,
  limit = 50,
): Promise<RebalanceEvent[]> {
  const result = await query<RebalanceEvent>(
    `SELECT * FROM rebalance_events
     WHERE vault_address = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [vaultAddress.toLowerCase(), limit],
  );
  return result.rows;
}

// ============ Revealed Holecards ============

export async function insertRevealedHolecard(
  tableId: bigint,
  handId: bigint,
  seatIndex: number,
  card1: number,
  card2: number,
  blockNumber: bigint,
  txHash: string,
): Promise<void> {
  await query(
    `INSERT INTO revealed_holecards (table_id, hand_id, seat_index, card1, card2, block_number, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (table_id, hand_id, seat_index) DO NOTHING`,
    [
      tableId.toString(),
      handId.toString(),
      seatIndex,
      card1,
      card2,
      blockNumber.toString(),
      txHash,
    ],
  );
}

export async function getRevealedHolecards(
  tableId: bigint,
  handId: bigint,
): Promise<RevealedHolecard[]> {
  const result = await query<RevealedHolecard>(
    `SELECT * FROM revealed_holecards
     WHERE table_id = $1 AND hand_id = $2
     ORDER BY seat_index ASC`,
    [tableId.toString(), handId.toString()],
  );
  return result.rows;
}

// ============ ELO Ratings ============

export interface EloRow {
  token_address: string;
  rating: string;
  hands_played: number;
  peak_rating: string;
  updated_at: Date;
}

/**
 * Get ELO ratings for the given token addresses.
 * Returns a Map for O(1) lookup.
 */
export async function getEloRatings(
  tokenAddresses: string[],
): Promise<Map<string, { rating: number; handsPlayed: number }>> {
  if (tokenAddresses.length === 0) return new Map();
  const placeholders = tokenAddresses.map((_, i) => `$${i + 1}`).join(", ");
  const result = await query<EloRow>(
    `SELECT token_address, rating, hands_played FROM elo_ratings WHERE token_address IN (${placeholders})`,
    tokenAddresses.map((a) => a.toLowerCase()),
  );
  const map = new Map<string, { rating: number; handsPlayed: number }>();
  for (const row of result.rows) {
    map.set(row.token_address, {
      rating: parseFloat(row.rating),
      handsPlayed: row.hands_played,
    });
  }
  return map;
}

/**
 * Upsert ELO rating for one agent (use inside a transaction).
 */
export async function upsertEloRating(
  tokenAddress: string,
  newRating: number,
  handsIncrement: number = 1,
): Promise<void> {
  await query(
    `INSERT INTO elo_ratings (token_address, rating, hands_played, peak_rating)
     VALUES ($1, $2, $3, $2)
     ON CONFLICT (token_address) DO UPDATE SET
       rating = EXCLUDED.rating,
       hands_played = elo_ratings.hands_played + $3,
       peak_rating = GREATEST(elo_ratings.peak_rating, EXCLUDED.rating),
       updated_at = NOW()`,
    [tokenAddress.toLowerCase(), newRating.toFixed(2), handsIncrement],
  );
}

/**
 * Insert one ELO history record.
 */
export async function insertEloHistory(
  tokenAddress: string,
  handId: bigint,
  opponentAddress: string,
  outcome: "win" | "loss" | "draw",
  ratingBefore: number,
  ratingAfter: number,
  k: number,
): Promise<void> {
  await query(
    `INSERT INTO elo_history
       (token_address, hand_id, opponent_address, outcome, rating_before, rating_after, k_factor)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      tokenAddress.toLowerCase(),
      handId.toString(),
      opponentAddress.toLowerCase(),
      outcome,
      ratingBefore.toFixed(2),
      ratingAfter.toFixed(2),
      k,
    ],
  );
}

/**
 * Get ELO leaderboard sorted by rating descending.
 */
export async function getEloLeaderboard(
  limit = 100,
  offset = 0,
): Promise<
  Array<{
    token_address: string;
    rating: string;
    hands_played: number;
    peak_rating: string;
  }>
> {
  const result = await query<{
    token_address: string;
    rating: string;
    hands_played: number;
    peak_rating: string;
  }>(
    `SELECT token_address, rating, hands_played, peak_rating
     FROM elo_ratings
     ORDER BY rating DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return result.rows;
}

// ============ Strategy History ============

export async function insertStrategyRecord(
  agent: string,
  version: bigint,
  configHash: string,
  personaId: string,
  aggressionBps: number,
  tightnessBps: number,
  bluffFreqBps: number,
  blockNumber: bigint,
  txHash: string,
): Promise<void> {
  await query(
    `INSERT INTO strategy_history
       (agent, version, config_hash, persona_id, aggression_bps, tightness_bps, bluff_freq_bps, block_number, tx_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (agent, version) DO NOTHING`,
    [
      agent.toLowerCase(),
      version.toString(),
      configHash,
      personaId,
      aggressionBps,
      tightnessBps,
      bluffFreqBps,
      blockNumber.toString(),
      txHash,
    ],
  );
}

export interface StrategyRecord {
  agent: string;
  version: string;
  config_hash: string;
  persona_id: string;
  aggression_bps: number;
  tightness_bps: number;
  bluff_freq_bps: number;
  block_number: string;
  tx_hash: string;
  created_at: Date;
}

export async function getAgentStrategies(agent: string, limit = 50): Promise<StrategyRecord[]> {
  const result = await query<StrategyRecord>(
    `SELECT agent, version, config_hash, persona_id, aggression_bps, tightness_bps, bluff_freq_bps, block_number, tx_hash, created_at
     FROM strategy_history
     WHERE agent = $1
     ORDER BY version DESC
     LIMIT $2`,
    [agent.toLowerCase(), limit],
  );
  return result.rows;
}

// ============ Decision Audit (T-1206) ============

export async function upsertDecisionAudit(
  tableAddress: string,
  handId: bigint,
  seatIndex: number,
  reasoningHash: string,
  commitTxHash: string,
  blockNumber: bigint,
): Promise<void> {
  await query(
    `INSERT INTO decision_audit
       (table_address, hand_id, seat_index, reasoning_hash, commit_tx_hash, block_number)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (table_address, hand_id, seat_index) DO UPDATE SET
       reasoning_hash = EXCLUDED.reasoning_hash,
       commit_tx_hash = EXCLUDED.commit_tx_hash,
       block_number = EXCLUDED.block_number`,
    [
      tableAddress.toLowerCase(),
      handId.toString(),
      seatIndex,
      reasoningHash,
      commitTxHash,
      blockNumber.toString(),
    ],
  );
}
