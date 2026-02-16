// Database repository - all DB operations

import { query, transaction } from "./pool.js";
import type {
  PokerTable,
  Seat,
  Hand,
  Action,
  Agent,
  VaultSnapshot,
  Settlement,
  IndexerState,
} from "./types.js";

// ============ Event Idempotency ============

export async function isEventProcessed(
  blockNumber: bigint,
  logIndex: number
): Promise<boolean> {
  const result = await query<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM processed_events
      WHERE block_number = $1 AND log_index = $2
    ) as exists`,
    [blockNumber.toString(), logIndex]
  );
  return result.rows[0]?.exists ?? false;
}

export async function markEventProcessed(
  blockNumber: bigint,
  logIndex: number,
  txHash: string,
  eventName: string
): Promise<void> {
  await query(
    `INSERT INTO processed_events (block_number, log_index, tx_hash, event_name)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (block_number, log_index) DO NOTHING`,
    [blockNumber.toString(), logIndex, txHash, eventName]
  );
}

export async function getIndexerState(): Promise<IndexerState | null> {
  const result = await query<IndexerState>(
    `SELECT * FROM indexer_state WHERE id = 1`
  );
  return result.rows[0] || null;
}

export async function updateIndexerState(
  blockNumber: bigint,
  logIndex: number
): Promise<void> {
  await query(
    `UPDATE indexer_state
     SET last_processed_block = $1, last_processed_log_index = $2, updated_at = NOW()
     WHERE id = 1`,
    [blockNumber.toString(), logIndex]
  );
}

// ============ Poker Tables ============

export async function upsertTable(
  tableId: bigint,
  contractAddress: string,
  smallBlind: bigint,
  bigBlind: bigint
): Promise<void> {
  await query(
    `INSERT INTO poker_tables (table_id, contract_address, small_blind, big_blind)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (table_id) DO UPDATE SET
       contract_address = EXCLUDED.contract_address,
       small_blind = EXCLUDED.small_blind,
       big_blind = EXCLUDED.big_blind,
       updated_at = NOW()`,
    [tableId.toString(), contractAddress, smallBlind.toString(), bigBlind.toString()]
  );
}

export async function updateTableState(
  tableId: bigint,
  gameState: string,
  currentHandId?: bigint,
  buttonSeat?: number,
  actionDeadline?: Date | null
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

  await query(
    `UPDATE poker_tables SET ${updates.join(", ")} WHERE table_id = $1`,
    params
  );
}

export async function getTable(tableId: bigint): Promise<PokerTable | null> {
  const result = await query<PokerTable>(
    `SELECT * FROM poker_tables WHERE table_id = $1`,
    [tableId.toString()]
  );
  return result.rows[0] || null;
}

export async function getAllTables(): Promise<PokerTable[]> {
  const result = await query<PokerTable>(
    `SELECT * FROM poker_tables ORDER BY table_id`
  );
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
  currentBet: bigint = 0n
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
    ]
  );
}

export async function updateSeatStack(
  tableId: bigint,
  seatIndex: number,
  stack: bigint
): Promise<void> {
  await query(
    `UPDATE seats SET stack = $3, updated_at = NOW()
     WHERE table_id = $1 AND seat_index = $2`,
    [tableId.toString(), seatIndex, stack.toString()]
  );
}

export async function getSeats(tableId: bigint): Promise<Seat[]> {
  const result = await query<Seat>(
    `SELECT * FROM seats WHERE table_id = $1 ORDER BY seat_index`,
    [tableId.toString()]
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
  gameState: string
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
    ]
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
  }>
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
    params
  );
}

export async function getHand(tableId: bigint, handId: bigint): Promise<Hand | null> {
  const result = await query<Hand>(
    `SELECT * FROM hands WHERE table_id = $1 AND hand_id = $2`,
    [tableId.toString(), handId.toString()]
  );
  return result.rows[0] || null;
}

export async function getTableHands(tableId: bigint, limit = 10): Promise<Hand[]> {
  const result = await query<Hand>(
    `SELECT * FROM hands WHERE table_id = $1 ORDER BY hand_id DESC LIMIT $2`,
    [tableId.toString(), limit]
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
  txHash: string
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
    ]
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
       ) AS ends_street
     FROM actions a
     WHERE a.table_id = $1 AND a.hand_id = $2
     ORDER BY a.id`,
    [tableId.toString(), handId.toString()]
  );
  return result.rows;
}

// ============ Agents ============

export async function upsertAgent(
  tokenAddress: string,
  ownerAddress: string,
  operatorAddress: string,
  vaultAddress?: string | null,
  tableAddress?: string | null,
  metaUri?: string | null
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
    ]
  );
}

export async function updateAgentOperator(
  tokenAddress: string,
  operatorAddress: string
): Promise<void> {
  await query(
    `UPDATE agents SET operator_address = $2, updated_at = NOW()
     WHERE token_address = $1`,
    [tokenAddress.toLowerCase(), operatorAddress.toLowerCase()]
  );
}

export async function updateAgentOwner(
  tokenAddress: string,
  ownerAddress: string
): Promise<void> {
  await query(
    `UPDATE agents SET owner_address = $2, updated_at = NOW()
     WHERE token_address = $1`,
    [tokenAddress.toLowerCase(), ownerAddress.toLowerCase()]
  );
}

export async function updateAgentVault(
  tokenAddress: string,
  vaultAddress: string
): Promise<void> {
  await query(
    `UPDATE agents SET vault_address = $2, updated_at = NOW()
     WHERE token_address = $1`,
    [tokenAddress.toLowerCase(), vaultAddress.toLowerCase()]
  );
}

export async function updateAgentTable(
  tokenAddress: string,
  tableAddress: string
): Promise<void> {
  await query(
    `UPDATE agents SET table_address = $2, updated_at = NOW()
     WHERE token_address = $1`,
    [tokenAddress.toLowerCase(), tableAddress.toLowerCase()]
  );
}

export async function updateAgentMetaUri(
  tokenAddress: string,
  metaUri: string
): Promise<void> {
  await query(
    `UPDATE agents SET meta_uri = $2, updated_at = NOW()
     WHERE token_address = $1`,
    [tokenAddress.toLowerCase(), metaUri]
  );
}

export async function getAgent(tokenAddress: string): Promise<Agent | null> {
  const result = await query<Agent>(
    `SELECT * FROM agents WHERE token_address = $1`,
    [tokenAddress.toLowerCase()]
  );
  return result.rows[0] || null;
}

export async function getAllAgents(): Promise<Agent[]> {
  const result = await query<Agent>(
    `SELECT * FROM agents WHERE is_registered = true ORDER BY created_at DESC`
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
  blockNumber: bigint
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
    ]
  );
}

export async function getLatestVaultSnapshot(vaultAddress: string): Promise<VaultSnapshot | null> {
  const result = await query<VaultSnapshot>(
    `SELECT * FROM vault_snapshots
     WHERE vault_address = $1
     ORDER BY block_number DESC, id DESC
     LIMIT 1`,
    [vaultAddress.toLowerCase()]
  );
  return result.rows[0] || null;
}

export async function getVaultSnapshots(
  vaultAddress: string,
  limit = 100
): Promise<VaultSnapshot[]> {
  const result = await query<VaultSnapshot>(
    `SELECT * FROM vault_snapshots
     WHERE vault_address = $1
     ORDER BY block_number DESC, id DESC
     LIMIT $2`,
    [vaultAddress.toLowerCase(), limit]
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
  txHash: string
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
    ]
  );
}

export async function getSettlement(
  tableId: bigint,
  handId: bigint
): Promise<Settlement | null> {
  const result = await query<Settlement>(
    `SELECT * FROM settlements WHERE table_id = $1 AND hand_id = $2`,
    [tableId.toString(), handId.toString()]
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
  periodStart: Date | null
): Promise<AgentLeaderboardData[]> {
  // This query aggregates:
  // 1. Agent info
  // 2. Initial NAV (first snapshot or snapshot at period start)
  // 3. Current NAV (latest snapshot)
  // 4. Peak NAV (max NAV in period for MDD)
  // 5. Win/loss stats from settlements

  const periodCondition = periodStart
    ? `AND vs.created_at >= $1`
    : "";
  const settlementCondition = periodStart
    ? `AND s.created_at >= $1`
    : "";

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
  periodStart: Date | null
): Promise<{ total: number; wins: number }> {
  // Get agent's vault to find their table/seat
  const agent = await getAgent(tokenAddress);
  if (!agent || !agent.vault_address) {
    return { total: 0, wins: 0 };
  }

  const periodCondition = periodStart
    ? `AND s.created_at >= $2`
    : "";
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
  periodStart: Date | null
): Promise<VaultSnapshot[]> {
  const periodCondition = periodStart
    ? `AND created_at >= $2`
    : "";
  const params = periodStart
    ? [vaultAddress.toLowerCase(), periodStart.toISOString()]
    : [vaultAddress.toLowerCase()];

  const result = await query<VaultSnapshot>(
    `SELECT * FROM vault_snapshots
     WHERE vault_address = $1
     ${periodCondition}
     ORDER BY created_at ASC`,
    params
  );
  return result.rows;
}
