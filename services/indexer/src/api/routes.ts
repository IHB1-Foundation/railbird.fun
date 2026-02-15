// REST API routes

import { Router, type Request, type Response } from "express";
import type { Router as RouterType } from "express";
import {
  getTable,
  getAllTables,
  getSeats,
  getHand,
  getTableHands,
  getHandActions,
  getAgent,
  getAllAgents,
  getLatestVaultSnapshot,
  getVaultSnapshots,
  getVaultSnapshotsInPeriod,
  getAgentSettlementsInPeriod,
} from "../db/index.js";
import { getWsManager } from "../ws/index.js";
import type {
  TableResponse,
  SeatResponse,
  HandResponse,
  ActionResponse,
  AgentResponse,
  VaultSnapshotResponse,
  LeaderboardEntry,
  LeaderboardResponse,
  LeaderboardMetric,
  LeaderboardPeriod,
} from "../db/types.js";

export const router: RouterType = Router();

// ============ Health Check ============

router.get("/health", async (_req, res) => {
  const wsStats = getWsManager().getStats();

  // Check database readiness
  let dbReady = false;
  try {
    const { query: dbQuery } = await import("../db/index.js");
    await dbQuery("SELECT 1");
    dbReady = true;
  } catch {
    dbReady = false;
  }

  // Check chain config readiness
  const chainReady = !!(
    process.env.POKER_TABLE_ADDRESS &&
    process.env.PLAYER_REGISTRY_ADDRESS &&
    process.env.RPC_URL
  );

  const allReady = dbReady && chainReady;

  res.status(allReady ? 200 : 503).json({
    status: allReady ? "ready" : "degraded",
    timestamp: new Date().toISOString(),
    dependencies: {
      database: dbReady ? "ready" : "unavailable",
      chain: chainReady ? "ready" : "unavailable",
    },
    websocket: wsStats,
  });
});

// ============ Tables ============

router.get("/tables", async (_req, res) => {
  try {
    const tables = await getAllTables();

    const response = await Promise.all(
      tables.map(async (table) => {
        const seats = await getSeats(BigInt(table.table_id));
        const hand = table.current_hand_id
          ? await getHand(BigInt(table.table_id), BigInt(table.current_hand_id))
          : null;

        return formatTableResponse(table, seats, hand);
      })
    );

    res.json(response);
  } catch (error) {
    console.error("Error fetching tables:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tables/:id", async (req, res) => {
  try {
    const tableId = BigInt(req.params.id);
    const table = await getTable(tableId);

    if (!table) {
      return res.status(404).json({ error: "Table not found" });
    }

    const seats = await getSeats(tableId);
    const hand = table.current_hand_id
      ? await getHand(tableId, BigInt(table.current_hand_id))
      : null;

    let actions: ActionResponse[] = [];
    if (hand) {
      const dbActions = await getHandActions(tableId, BigInt(hand.hand_id));
      actions = dbActions.map(formatActionResponse);
    }

    const response = formatTableResponse(table, seats, hand, actions);
    res.json(response);
  } catch (error) {
    console.error("Error fetching table:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tables/:id/hands", async (req, res) => {
  try {
    const tableId = BigInt(req.params.id);
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 100);

    const hands = await getTableHands(tableId, limit);

    const response = await Promise.all(
      hands.map(async (hand) => {
        const actions = await getHandActions(tableId, BigInt(hand.hand_id));
        return formatHandResponse(hand, actions.map(formatActionResponse));
      })
    );

    res.json(response);
  } catch (error) {
    console.error("Error fetching hands:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tables/:tableId/hands/:handId", async (req, res) => {
  try {
    const tableId = BigInt(req.params.tableId);
    const handId = BigInt(req.params.handId);

    const hand = await getHand(tableId, handId);
    if (!hand) {
      return res.status(404).json({ error: "Hand not found" });
    }

    const dbActions = await getHandActions(tableId, handId);
    const actions = dbActions.map(formatActionResponse);

    res.json(formatHandResponse(hand, actions));
  } catch (error) {
    console.error("Error fetching hand:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ Agents ============

router.get("/agents", async (_req, res) => {
  try {
    const agents = await getAllAgents();

    const response = await Promise.all(
      agents.map(async (agent) => {
        const snapshot = agent.vault_address
          ? await getLatestVaultSnapshot(agent.vault_address)
          : null;
        return formatAgentResponse(agent, snapshot);
      })
    );

    res.json(response);
  } catch (error) {
    console.error("Error fetching agents:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agents/:token", async (req, res) => {
  try {
    const tokenAddress = req.params.token.toLowerCase();
    const agent = await getAgent(tokenAddress);

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const snapshot = agent.vault_address
      ? await getLatestVaultSnapshot(agent.vault_address)
      : null;

    res.json(formatAgentResponse(agent, snapshot));
  } catch (error) {
    console.error("Error fetching agent:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agents/:token/snapshots", async (req, res) => {
  try {
    const tokenAddress = req.params.token.toLowerCase();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);

    const agent = await getAgent(tokenAddress);
    if (!agent || !agent.vault_address) {
      return res.status(404).json({ error: "Agent or vault not found" });
    }

    const snapshots = await getVaultSnapshots(agent.vault_address, limit);
    res.json(snapshots.map(formatSnapshotResponse));
  } catch (error) {
    console.error("Error fetching snapshots:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ Leaderboard ============

const VALID_METRICS: LeaderboardMetric[] = ["roi", "pnl", "winrate", "mdd"];
const VALID_PERIODS: LeaderboardPeriod[] = ["24h", "7d", "30d", "all"];

function getPeriodStartDate(period: LeaderboardPeriod): Date | null {
  if (period === "all") return null;

  const now = new Date();
  switch (period) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    default:
      return null;
  }
}

router.get("/leaderboard", async (req, res) => {
  try {
    // Parse and validate query params
    const metric = (req.query.metric as string || "roi").toLowerCase() as LeaderboardMetric;
    const period = (req.query.period as string || "all").toLowerCase() as LeaderboardPeriod;

    if (!VALID_METRICS.includes(metric)) {
      return res.status(400).json({
        error: `Invalid metric. Valid values: ${VALID_METRICS.join(", ")}`,
      });
    }
    if (!VALID_PERIODS.includes(period)) {
      return res.status(400).json({
        error: `Invalid period. Valid values: ${VALID_PERIODS.join(", ")}`,
      });
    }

    const periodStart = getPeriodStartDate(period);

    // Get all agents
    const agents = await getAllAgents();

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = [];

    for (const agent of agents) {
      if (!agent.vault_address) continue;

      // Get snapshots in period
      const snapshots = await getVaultSnapshotsInPeriod(agent.vault_address, periodStart);

      if (snapshots.length === 0) {
        // No data for this agent in this period
        continue;
      }

      const firstSnapshot = snapshots[0];
      const lastSnapshot = snapshots[snapshots.length - 1];

      // Get win/loss stats
      const { total, wins } = await getAgentSettlementsInPeriod(agent.token_address, periodStart);

      // Calculate metrics
      const initialNav = BigInt(firstSnapshot.nav_per_share);
      const currentNav = BigInt(lastSnapshot.nav_per_share);
      const cumulativePnl = BigInt(lastSnapshot.cumulative_pnl);

      // ROI: (currentNav - initialNav) / initialNav
      // Scale: 1e18 precision
      let roi = "0";
      if (initialNav > 0n) {
        const roiNum = ((currentNav - initialNav) * 10000n) / initialNav;
        roi = (Number(roiNum) / 10000).toString();
      }

      // Winrate: wins / total
      let winrate = "0";
      if (total > 0) {
        winrate = (wins / total).toFixed(4);
      }

      // MDD: Maximum Drawdown
      // Track peak and calculate max drawdown
      let peakNav = 0n;
      let maxDrawdown = 0n;
      for (const snap of snapshots) {
        const nav = BigInt(snap.nav_per_share);
        if (nav > peakNav) {
          peakNav = nav;
        }
        if (peakNav > 0n) {
          const drawdown = ((peakNav - nav) * 10000n) / peakNav;
          if (drawdown > maxDrawdown) {
            maxDrawdown = drawdown;
          }
        }
      }
      const mdd = (Number(maxDrawdown) / 10000).toString();

      entries.push({
        rank: 0, // Will be set after sorting
        tokenAddress: agent.token_address,
        ownerAddress: agent.owner_address,
        metaUri: agent.meta_uri,
        roi,
        cumulativePnl: cumulativePnl.toString(),
        winrate,
        mdd,
        totalHands: total,
        winningHands: wins,
        losingHands: total - wins,
        currentNavPerShare: currentNav.toString(),
        initialNavPerShare: initialNav.toString(),
      });
    }

    // Sort by selected metric
    entries.sort((a, b) => {
      switch (metric) {
        case "roi":
          return parseFloat(b.roi) - parseFloat(a.roi);
        case "pnl":
          return Number(BigInt(b.cumulativePnl) - BigInt(a.cumulativePnl));
        case "winrate":
          return parseFloat(b.winrate) - parseFloat(a.winrate);
        case "mdd":
          // Lower MDD is better, so ascending order
          return parseFloat(a.mdd) - parseFloat(b.mdd);
        default:
          return 0;
      }
    });

    // Assign ranks
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    const response: LeaderboardResponse = {
      metric,
      period,
      entries,
      updatedAt: new Date().toISOString(),
    };

    res.json(response);
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ Response Formatters ============

function formatTableResponse(
  table: any,
  seats: any[],
  hand: any | null,
  actions?: ActionResponse[]
): TableResponse {
  return {
    tableId: table.table_id,
    contractAddress: table.contract_address,
    smallBlind: table.small_blind,
    bigBlind: table.big_blind,
    currentHandId: table.current_hand_id,
    gameState: table.game_state,
    buttonSeat: table.button_seat,
    actionDeadline: table.action_deadline?.toISOString() || null,
    seats: seats.map(formatSeatResponse),
    currentHand: hand ? formatHandResponse(hand, actions || []) : null,
  };
}

function formatSeatResponse(seat: any): SeatResponse {
  return {
    seatIndex: seat.seat_index,
    ownerAddress: seat.owner_address,
    operatorAddress: seat.operator_address,
    stack: seat.stack,
    isActive: seat.is_active,
    currentBet: seat.current_bet,
  };
}

function formatHandResponse(hand: any, actions: ActionResponse[]): HandResponse {
  return {
    handId: hand.hand_id,
    tableId: hand.table_id,
    pot: hand.pot,
    currentBet: hand.current_bet || "0",
    actorSeat: hand.actor_seat,
    gameState: hand.game_state,
    buttonSeat: hand.button_seat,
    communityCards: hand.community_cards || [],
    winnerSeat: hand.winner_seat,
    settlementAmount: hand.settlement_amount,
    actions,
  };
}

function formatActionResponse(action: any): ActionResponse {
  return {
    seatIndex: action.seat_index,
    actionType: action.action_type,
    amount: action.amount,
    potAfter: action.pot_after,
    blockNumber: action.block_number,
    txHash: action.tx_hash,
    timestamp: action.created_at?.toISOString() || new Date().toISOString(),
  };
}

function formatAgentResponse(
  agent: any,
  snapshot: any | null
): AgentResponse {
  return {
    tokenAddress: agent.token_address,
    vaultAddress: agent.vault_address,
    tableAddress: agent.table_address,
    ownerAddress: agent.owner_address,
    operatorAddress: agent.operator_address,
    metaUri: agent.meta_uri,
    isRegistered: agent.is_registered,
    latestSnapshot: snapshot ? formatSnapshotResponse(snapshot) : null,
  };
}

function formatSnapshotResponse(snapshot: any): VaultSnapshotResponse {
  return {
    handId: snapshot.hand_id,
    externalAssets: snapshot.external_assets,
    treasuryShares: snapshot.treasury_shares,
    outstandingShares: snapshot.outstanding_shares,
    navPerShare: snapshot.nav_per_share,
    cumulativePnl: snapshot.cumulative_pnl,
    blockNumber: snapshot.block_number,
  };
}
