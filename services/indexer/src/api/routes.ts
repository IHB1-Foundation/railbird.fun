// REST API routes

import { Router, type Request, type Response, type NextFunction } from "express";
import type { Router as RouterType } from "express";
import { createLogger } from "@playerco/shared";

const logger = createLogger({ service: "indexer" });
import { TOKEN_PROFILES, type PlayerKey, type TokenProfile } from "./tokenProfiles.js";
import {
  getTable,
  getAllTables,
  getSeats,
  getHand,
  getTableHands,
  getHandActions,
  getAgent,
  getAllAgents,
  getAllAgentsPaginated,
  getAgentsByOwner,
  getRebalanceEvents,
  getRevealedHolecards,
  getLatestVaultSnapshot,
  getVaultSnapshots,
  getVaultSnapshotsInPeriod,
  getAgentSettlementsInPeriod,
  getAgentHands,
  getEloRatings,
  getEloLeaderboard,
} from "../db/index.js";
import { getWsManager } from "../ws/index.js";
import { getListenerHealth } from "../events/listenerState.js";
import { getPoolStats } from "../db/pool.js";
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
  PaginatedResponse,
} from "../db/types.js";

// ============ Simple in-memory rate limiter ============
interface RateLimitBucket { count: number; resetAt: number }
const _rateLimitStore = new Map<string, RateLimitBucket>();

function makeRateLimiter(maxPerMin: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0].trim() ?? req.socket.remoteAddress ?? "unknown";
    const key = `${ip}`;
    const now = Date.now();
    const bucket = _rateLimitStore.get(key);
    if (!bucket || now >= bucket.resetAt) {
      _rateLimitStore.set(key, { count: 1, resetAt: now + 60_000 });
    } else {
      bucket.count++;
      if (bucket.count > maxPerMin) {
        res.status(429).json({ error: "Too many requests", code: "RATE_LIMITED" });
        return;
      }
    }
    next();
  };
}

const globalRateLimit = makeRateLimiter(100);
const leaderboardRateLimit = makeRateLimiter(10);

export const router: RouterType = Router();
const CONFIGURED_TABLE_ADDRESSES = new Set(
  (process.env.POKER_TABLE_ADDRESSES || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean)
);


function getBaseUrl(req: Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

function getProfileByParam(raw: string | undefined): TokenProfile | null {
  if (!raw) return null;
  const normalized = raw.toLowerCase().replace(".json", "").replace(".svg", "").replace("player-", "");
  if (normalized === "a" || normalized === "b" || normalized === "c" || normalized === "d") {
    return TOKEN_PROFILES[normalized];
  }
  return null;
}

function buildTokenMetadata(req: Request, profile: TokenProfile) {
  const baseUrl = getBaseUrl(req);
  const imageUrl = `${baseUrl}/api/token-assets/${profile.slug}.svg`;
  const externalUrl = `${baseUrl}/agent/${profile.key}`;
  return {
    name: profile.name,
    symbol: profile.symbol,
    description: profile.description,
    image: imageUrl,
    external_url: externalUrl,
    attributes: [
      { trait_type: "Project", value: "Railbird" },
      { trait_type: "Role", value: "Poker Agent" },
      { trait_type: "Player", value: profile.player },
      { trait_type: "Archetype", value: profile.archetype },
      { trait_type: "Aggression", value: profile.aggression },
      { trait_type: "Risk Profile", value: profile.riskProfile },
      { trait_type: "Play Style", value: profile.style },
    ],
  };
}

function buildTokenSvg(profile: TokenProfile): string {
  const { bgA, bgB, accent, text } = profile.palette;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 1200" role="img" aria-label="${profile.name}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bgA}"/>
      <stop offset="100%" stop-color="${bgB}"/>
    </linearGradient>
    <radialGradient id="glow" cx="70%" cy="30%" r="45%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="1200" fill="url(#bg)"/>
  <rect width="1200" height="1200" fill="url(#glow)"/>
  <g>
    <circle cx="600" cy="600" r="310" fill="none" stroke="${accent}" stroke-width="14" opacity="0.85"/>
    <circle cx="600" cy="600" r="250" fill="none" stroke="${text}" stroke-width="2" opacity="0.35"/>
  </g>
  <text x="600" y="590" fill="${text}" font-size="220" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-weight="800" text-anchor="middle">${profile.player}</text>
  <text x="600" y="700" fill="${accent}" font-size="56" font-family="system-ui, -apple-system, Segoe UI, sans-serif" font-weight="700" text-anchor="middle">${profile.symbol}</text>
  <text x="600" y="770" fill="${text}" opacity="0.9" font-size="38" font-family="system-ui, -apple-system, Segoe UI, sans-serif" text-anchor="middle">${profile.archetype} - Aggression ${profile.aggression}</text>
</svg>`;
}

// ============ Health Check ============

// Apply global rate limit to all routes
router.use(globalRateLimit);

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
    process.env.POKER_TABLE_ADDRESSES &&
    process.env.PLAYER_REGISTRY_ADDRESS &&
    process.env.RPC_URL
  );

  const listenerHealth = getListenerHealth();
  const listenerReady =
    listenerHealth.status === "running" || listenerHealth.status === "disabled";
  const allReady = dbReady && chainReady && listenerReady;

  const poolStats = getPoolStats();

  res.status(allReady ? 200 : 503).json({
    status: allReady ? "ready" : "degraded",
    timestamp: new Date().toISOString(),
    dependencies: {
      database: dbReady ? "ready" : "unavailable",
      chain: chainReady ? "ready" : "unavailable",
      eventListener: listenerHealth,
    },
    pool: poolStats,
    websocket: wsStats,
  });
});

// ============ Token Metadata / Assets ============

router.get("/token-metadata/:player", (req, res) => {
  const profile = getProfileByParam(req.params.player);
  if (!profile) {
    return res.status(404).json({ error: "Unknown player metadata" });
  }

  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.json(buildTokenMetadata(req, profile));
});

router.get("/token-assets/:player", (req, res) => {
  const profile = getProfileByParam(req.params.player);
  if (!profile) {
    return res.status(404).json({ error: "Unknown player asset" });
  }

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=300");
  res.send(buildTokenSvg(profile));
});

// ============ Tables ============

router.get("/tables", async (_req, res) => {
  try {
    const allTables = await getAllTables();
    const tables = CONFIGURED_TABLE_ADDRESSES.size > 0
      ? allTables.filter(
          (table) => CONFIGURED_TABLE_ADDRESSES.has(String(table.contract_address).toLowerCase())
        )
      : allTables;

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
    logger.error({ err: error }, "Error fetching tables:");
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
    if (
      CONFIGURED_TABLE_ADDRESSES.size > 0 &&
      !CONFIGURED_TABLE_ADDRESSES.has(String(table.contract_address).toLowerCase())
    ) {
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
    logger.error({ err: error }, "Error fetching table:");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tables/:id/hands", async (req, res) => {
  try {
    const tableId = BigInt(req.params.id);
    const table = await getTable(tableId);
    if (
      !table ||
      (CONFIGURED_TABLE_ADDRESSES.size > 0 &&
        !CONFIGURED_TABLE_ADDRESSES.has(String(table.contract_address).toLowerCase()))
    ) {
      return res.status(404).json({ error: "Table not found" });
    }

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
    logger.error({ err: error }, "Error fetching hands:");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tables/:tableId/hands/:handId", async (req, res) => {
  try {
    const tableId = BigInt(req.params.tableId);
    const table = await getTable(tableId);
    if (
      !table ||
      (CONFIGURED_TABLE_ADDRESSES.size > 0 &&
        !CONFIGURED_TABLE_ADDRESSES.has(String(table.contract_address).toLowerCase()))
    ) {
      return res.status(404).json({ error: "Table not found" });
    }

    const handId = BigInt(req.params.handId);

    const hand = await getHand(tableId, handId);
    if (!hand) {
      return res.status(404).json({ error: "Hand not found" });
    }

    const dbActions = await getHandActions(tableId, handId);
    const actions = dbActions.map(formatActionResponse);

    res.json(formatHandResponse(hand, actions));
  } catch (error) {
    logger.error({ err: error }, "Error fetching hand:");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/tables/:tableId/hands/:handId/revealed-holecards", async (req, res) => {
  try {
    const tableId = BigInt(req.params.tableId);
    const table = await getTable(tableId);
    if (
      !table ||
      (CONFIGURED_TABLE_ADDRESSES.size > 0 &&
        !CONFIGURED_TABLE_ADDRESSES.has(String(table.contract_address).toLowerCase()))
    ) {
      return res.status(404).json({ error: "Table not found" });
    }

    const handId = BigInt(req.params.handId);
    const holecards = await getRevealedHolecards(tableId, handId);

    res.json(
      holecards.map((h) => ({
        seatIndex: h.seat_index,
        card1: h.card1,
        card2: h.card2,
        blockNumber: h.block_number,
        txHash: h.tx_hash,
      }))
    );
  } catch (error) {
    logger.error({ err: error }, "Error fetching revealed holecards:");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ Agents ============

router.get("/agents", async (req, res) => {
  try {
    const ownerParam = req.query.owner as string | undefined;

    if (ownerParam) {
      // Owner-filtered query — no pagination (small result set)
      const agents = await getAgentsByOwner(ownerParam);
      const data = await Promise.all(
        agents.map(async (agent) => {
          const snapshot = agent.vault_address
            ? await getLatestVaultSnapshot(agent.vault_address)
            : null;
          return formatAgentResponse(agent, snapshot);
        })
      );
      res.json(data);
      return;
    }

    // Paginated agents list
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);

    const { rows, total } = await getAllAgentsPaginated(page, limit);
    const data = await Promise.all(
      rows.map(async (agent) => {
        const snapshot = agent.vault_address
          ? await getLatestVaultSnapshot(agent.vault_address)
          : null;
        return formatAgentResponse(agent, snapshot);
      })
    );

    const response: PaginatedResponse<AgentResponse> = { data, total, page, limit };
    res.json(response);
  } catch (error) {
    logger.error({ err: error }, "Error fetching agents:");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agents/:address", async (req, res) => {
  try {
    const tokenAddress = req.params.address.toLowerCase();
    const agent = await getAgent(tokenAddress);

    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const snapshot = agent.vault_address
      ? await getLatestVaultSnapshot(agent.vault_address)
      : null;

    res.json(formatAgentResponse(agent, snapshot));
  } catch (error) {
    logger.error({ err: error }, "Error fetching agent:");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agents/:address/snapshots", async (req, res) => {
  try {
    const tokenAddress = req.params.address.toLowerCase();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);

    const agent = await getAgent(tokenAddress);
    if (!agent || !agent.vault_address) {
      return res.status(404).json({ error: "Agent or vault not found" });
    }

    const snapshots = await getVaultSnapshots(agent.vault_address, limit);
    res.json(snapshots.map(formatSnapshotResponse));
  } catch (error) {
    logger.error({ err: error }, "Error fetching snapshots:");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agents/:address/hands", async (req, res) => {
  try {
    const tokenAddress = req.params.address.toLowerCase();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const agent = await getAgent(tokenAddress);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    const hands = await getAgentHands(tokenAddress, limit);
    const formatted = await Promise.all(
      hands.map(async (hand) => {
        const actions = await getHandActions(BigInt(hand.table_id), BigInt(hand.hand_id));
        const actionResponses: ActionResponse[] = actions.map((a) => ({
          seatIndex: a.seat_index,
          actionType: a.action_type,
          amount: a.amount,
          potAfter: a.pot_after,
          blockNumber: a.block_number,
          txHash: a.tx_hash,
          endsStreet: (a as any).ends_street ?? false,
          timestamp: a.created_at?.toISOString?.() ?? new Date().toISOString(),
        }));
        return formatHandResponse(hand, actionResponses);
      })
    );

    res.json(formatted);
  } catch (error) {
    logger.error({ err: error }, "Error fetching agent hands:");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agents/:address/rebalances", async (req, res) => {
  try {
    const tokenAddress = req.params.address.toLowerCase();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);

    const agent = await getAgent(tokenAddress);
    if (!agent || !agent.vault_address) {
      return res.status(404).json({ error: "Agent or vault not found" });
    }

    const events = await getRebalanceEvents(agent.vault_address, limit);
    res.json(
      events.map((e) => ({
        id: e.id,
        vaultAddress: e.vault_address,
        handId: e.hand_id,
        direction: e.direction,
        amountIn: e.amount_in,
        amountOut: e.amount_out,
        navBefore: e.nav_before,
        navAfter: e.nav_after,
        blockNumber: e.block_number,
        txHash: e.tx_hash,
        timestamp: e.created_at.toISOString(),
      }))
    );
  } catch (error) {
    logger.error({ err: error }, "Error fetching rebalance events:");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ Leaderboard ============

const VALID_METRICS: LeaderboardMetric[] = ["roi", "pnl", "winrate", "mdd", "elo"];
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

// ── Reasoning proxy ──────────────────────────────────────────────────────────
// Simple proxy to OwnerView /reasoning endpoint.
// Gracefully returns empty entries when OwnerView is unavailable.

const OWNERVIEW_BASE_URL = (process.env.OWNERVIEW_URL || "http://localhost:3001").replace(/\/$/, "");

router.get("/tables/:tableId/hands/:handId/reasoning", async (req, res) => {
  const { tableId, handId } = req.params;
  const seatIndex = req.query.seatIndex as string | undefined;
  try {
    let url = `${OWNERVIEW_BASE_URL}/reasoning?tableAddress=${encodeURIComponent(tableId)}&handId=${encodeURIComponent(handId)}`;
    if (seatIndex !== undefined) {
      url += `&seatIndex=${encodeURIComponent(seatIndex)}`;
    }
    const upstream = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok) {
      logger.warn({ tableId, handId, status: upstream.status }, "OwnerView reasoning returned non-OK");
      res.json({ tableAddress: tableId, handId, entries: [] });
      return;
    }
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    logger.warn({ tableId, handId, err: err instanceof Error ? err.message : String(err) }, "OwnerView reasoning unavailable — returning empty");
    res.json({ tableAddress: tableId, handId, entries: [] });
  }
});

router.get("/leaderboard", leaderboardRateLimit, async (req, res) => {
  try {
    // Parse and validate query params
    const metric = (req.query.metric as string || "roi").toLowerCase() as LeaderboardMetric;
    const period = (req.query.period as string || "all").toLowerCase() as LeaderboardPeriod;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 20), 100);

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

    // Fetch ELO ratings for all agents in one query
    const allTokenAddresses = agents.map((a) => a.token_address);
    const eloMap = await getEloRatings(allTokenAddresses).catch(() => new Map<string, { rating: number; handsPlayed: number }>());

    // Build leaderboard entries
    const entries: LeaderboardEntry[] = [];

    for (const agent of agents) {
      if (!agent.vault_address) continue;

      // Get snapshots in period
      const snapshots = await getVaultSnapshotsInPeriod(agent.vault_address, periodStart);

      // Get win/loss stats
      const { total, wins } = await getAgentSettlementsInPeriod(agent.token_address, periodStart);

      // Defaults keep agents visible even when period has no snapshots yet.
      let initialNav = 0n;
      let currentNav = 0n;
      let cumulativePnl = 0n;
      let roi = "0";
      let mdd = "0";

      // Winrate: wins / total
      let winrate = "0";
      if (total > 0) {
        winrate = (wins / total).toFixed(4);
      }

      if (snapshots.length > 0) {
        const firstSnapshot = snapshots[0];
        const lastSnapshot = snapshots[snapshots.length - 1];

        // Calculate metrics
        initialNav = BigInt(firstSnapshot.nav_per_share);
        currentNav = BigInt(lastSnapshot.nav_per_share);
        cumulativePnl = BigInt(lastSnapshot.cumulative_pnl);

        // ROI: (currentNav - initialNav) / initialNav
        // Scale: 1e18 precision
        if (initialNav > 0n) {
          const roiNum = ((currentNav - initialNav) * 10000n) / initialNav;
          roi = (Number(roiNum) / 10000).toString();
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
        mdd = (Number(maxDrawdown) / 10000).toString();
      }

      const eloData = eloMap.get(agent.token_address.toLowerCase());
      entries.push({
        rank: 0, // Will be set after sorting
        tokenAddress: agent.token_address,
        ownerAddress: agent.owner_address,
        metaUri: agent.meta_uri,
        roi,
        cumulativePnl: cumulativePnl.toString(),
        winrate,
        mdd,
        elo: eloData ? eloData.rating.toFixed(2) : "1500",
        peakElo: eloData ? eloData.rating.toFixed(2) : "1500", // simplified: use current rating
        eloChange: "0", // Would need elo_history to compute recent change
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
          if (BigInt(b.cumulativePnl) === BigInt(a.cumulativePnl)) return 0;
          return BigInt(b.cumulativePnl) > BigInt(a.cumulativePnl) ? 1 : -1;
        case "winrate":
          return parseFloat(b.winrate) - parseFloat(a.winrate);
        case "mdd":
          // Lower MDD is better, so ascending order
          return parseFloat(a.mdd) - parseFloat(b.mdd);
        case "elo":
          return parseFloat(b.elo ?? "1500") - parseFloat(a.elo ?? "1500");
        default:
          return 0;
      }
    });

    // Assign ranks (global rank before pagination slice)
    entries.forEach((entry, index) => {
      entry.rank = index + 1;
    });

    const total = entries.length;
    const start = (page - 1) * limit;
    const pagedEntries = entries.slice(start, start + limit);

    const response: LeaderboardResponse = {
      metric,
      period,
      entries: pagedEntries,
      updatedAt: new Date().toISOString(),
      total,
      page,
      limit,
    };

    res.json(response);
  } catch (error) {
    logger.error({ err: error }, "Error fetching leaderboard:");
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
    tokenAddress: seat.token_address ?? null,
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
    endsStreet: Boolean(action.ends_street),
    timestamp: action.created_at?.toISOString() || new Date().toISOString(),
    verified: Boolean(action.verified),
    revealTxHash: action.reveal_tx_hash ?? undefined,
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
