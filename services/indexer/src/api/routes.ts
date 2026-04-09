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
  getAgentStrategies,
} from "../db/index.js";
import { getWsManager } from "../ws/index.js";
import { broadcastAiCommentary } from "../ws/broadcaster.js";
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

  // Check database readiness and fetch last processed block
  let dbReady = false;
  let lastBlock: number | null = null;
  try {
    const { query: dbQuery } = await import("../db/index.js");
    await dbQuery("SELECT 1");
    dbReady = true;
    const stateRow = await dbQuery<{ last_processed_block: string }>(
      "SELECT last_processed_block FROM indexer_state WHERE id = 1"
    );
    if (stateRow.rows.length > 0) {
      lastBlock = parseInt(stateRow.rows[0].last_processed_block, 10);
    }
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
    lastBlock,
    dependencies: {
      database: dbReady ? "ready" : "unavailable",
      chain: chainReady ? "ready" : "unavailable",
      eventListener: listenerHealth,
    },
    pool: poolStats,
    websocket: {
      connections: wsStats.totalConnections,
      tables: wsStats.tables,
    },
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
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);

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
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

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

/**
 * GET /agents/:address/gto-stats
 * T-1104: Aggregate GTO conformance statistics for an agent.
 * Fetches recent reasoning entries from OwnerView and aggregates deviation data.
 */
router.get("/agents/:address/gto-stats", async (req, res) => {
  const address = req.params.address.toLowerCase();
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  try {
    // Fetch agent's recent hands to get tableAddress + handIds
    const agent = await getAgent(address);
    if (!agent) {
      return res.status(404).json({ error: "Agent not found" });
    }

    // Fetch recent hands to get tableAddress
    const hands = await getAgentHands(address, limit);
    if (hands.length === 0) {
      return res.json({ agent: address, conformance: null, avgSeverity: null, totalDecisions: 0, deviationsByType: null, recentDeviations: [] });
    }

    const tableAddress = hands[0].table_id;

    // Fetch reasoning entries from OwnerView for recent hands
    type GTOData = { gtoAction: string; aiAction: string; isDeviation: boolean; deviationType: string; severity: number; gtoFrequency: number };
    type ReasoningEntry = { handId: string; action: string; gtoDeviation?: GTOData; timestamp: number };

    const allEntries: ReasoningEntry[] = [];
    const uniqueHandIds = [...new Set(hands.map((h) => String(h.hand_id)))].slice(0, 20);

    for (const handId of uniqueHandIds) {
      try {
        const url = `${OWNERVIEW_BASE_URL}/reasoning?tableAddress=${encodeURIComponent(tableAddress)}&handId=${encodeURIComponent(handId)}`;
        const upstream = await fetch(url, { signal: AbortSignal.timeout(3000) });
        if (upstream.ok) {
          const data = await upstream.json() as { entries: ReasoningEntry[] };
          allEntries.push(...(data.entries ?? []));
        }
      } catch {
        // skip on error
      }
    }

    // Aggregate GTO deviation data
    const withDeviation = allEntries.filter((e) => e.gtoDeviation);
    const total = withDeviation.length;

    if (total === 0) {
      return res.json({ agent: address, conformance: null, avgSeverity: null, totalDecisions: 0, deviationsByType: null, recentDeviations: [] });
    }

    const aligned = withDeviation.filter((e) => !e.gtoDeviation?.isDeviation).length;
    const conformance = Math.round((aligned / total) * 100);
    const deviatingEntries = withDeviation.filter((e) => e.gtoDeviation?.isDeviation);
    const avgSeverity = deviatingEntries.length > 0
      ? deviatingEntries.reduce((sum, e) => sum + (e.gtoDeviation?.severity ?? 0), 0) / deviatingEntries.length
      : 0;

    const typeCount: Record<string, number> = { aligned: 0, tighter: 0, looser: 0, passive: 0, aggressive: 0 };
    for (const e of withDeviation) {
      const t = e.gtoDeviation?.deviationType ?? "aligned";
      typeCount[t] = (typeCount[t] ?? 0) + 1;
    }

    const recentDeviations = withDeviation
      .filter((e) => e.gtoDeviation?.isDeviation)
      .slice(-5)
      .map((e) => ({
        handId: e.handId,
        aiAction: e.gtoDeviation?.aiAction,
        gtoAction: e.gtoDeviation?.gtoAction,
        deviationType: e.gtoDeviation?.deviationType,
        severity: e.gtoDeviation?.severity,
        timestamp: e.timestamp,
      }));

    res.json({
      agent: address,
      conformance,
      avgSeverity: Math.round(avgSeverity * 100) / 100,
      totalDecisions: total,
      deviationsByType: typeCount,
      recentDeviations,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching GTO stats:");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/agents/:address/strategies", async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const records = await getAgentStrategies(address, limit);
    res.json({
      agent: address,
      strategies: records.map((r) => ({
        version: r.version,
        configHash: r.config_hash,
        personaId: r.persona_id,
        aggressionBps: r.aggression_bps,
        tightnessBps: r.tightness_bps,
        bluffFreqBps: r.bluff_freq_bps,
        blockNumber: r.block_number,
        txHash: r.tx_hash,
        timestamp: r.created_at.toISOString(),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching agent strategies:");
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

// ── Commentary proxy + broadcast ─────────────────────────────────────────────
// GET proxies to OwnerView; POST (internal) stores + broadcasts via WS.

// In-memory cache for commentary entries (mirrors OwnerView store)
interface CachedCommentary {
  handId: string;
  street: string;
  commentary: string;
  personaContext?: string;
  timestamp: number;
}
const _commentaryCache = new Map<string, CachedCommentary[]>();

function _commentaryCacheKey(tableId: string, handId: string): string {
  return `${tableId.toLowerCase()}:${handId}`;
}

/**
 * POST /tables/:tableId/commentary
 * Internal endpoint: KeeperBot POSTs commentary data here to trigger WS broadcast.
 * Body: { handId, street, commentary, personaContext? }
 */
router.post("/tables/:tableId/commentary", (req, res) => {
  const { tableId } = req.params;
  const { handId, street, commentary, personaContext } = req.body as Record<string, unknown>;

  if (typeof handId !== "string" || typeof street !== "string" || typeof commentary !== "string") {
    res.status(400).json({ error: "Missing required fields: handId, street, commentary" });
    return;
  }

  const entry: CachedCommentary = {
    handId,
    street,
    commentary,
    personaContext: typeof personaContext === "string" ? personaContext : undefined,
    timestamp: Date.now(),
  };

  const key = _commentaryCacheKey(tableId, handId);
  const list = _commentaryCache.get(key) ?? [];
  list.push(entry);
  _commentaryCache.set(key, list);

  broadcastAiCommentary(tableId, handId, street, commentary, entry.personaContext);
  logger.info({ tableId, handId, street }, "AI commentary broadcast");
  res.status(201).json({ ok: true });
});

/**
 * GET /tables/:tableId/hands/:handId/commentary
 * Returns commentary for a hand. Serves from local cache first, falls back to OwnerView proxy.
 */
router.get("/tables/:tableId/hands/:handId/commentary", async (req, res) => {
  const { tableId, handId } = req.params;

  // Serve from local cache if available
  const key = _commentaryCacheKey(tableId, handId);
  const cached = _commentaryCache.get(key);
  if (cached && cached.length > 0) {
    res.json({ tableAddress: tableId, handId, entries: cached });
    return;
  }

  // Fall back to OwnerView proxy
  try {
    const url = `${OWNERVIEW_BASE_URL}/commentary?tableAddress=${encodeURIComponent(tableId)}&handId=${encodeURIComponent(handId)}`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok) {
      res.json({ tableAddress: tableId, handId, entries: [] });
      return;
    }
    const data = await upstream.json();
    res.json(data);
  } catch (err) {
    logger.warn({ tableId, handId, err: err instanceof Error ? err.message : String(err) }, "OwnerView commentary proxy failed — returning empty");
    res.json({ tableAddress: tableId, handId, entries: [] });
  }
});

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

// ============ T-1105: Evolution Endpoints ============

/**
 * GET /evolution/timeline?agents=addr1,addr2,...&limit=100
 * Returns strategy evolution history per agent with ELO snapshots.
 */
router.get("/evolution/timeline", async (req, res) => {
  try {
    const agentsParam = (req.query.agents as string | undefined) ?? "";
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 100);

    let agentAddresses: string[];
    if (agentsParam) {
      agentAddresses = agentsParam.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
    } else {
      // Default: all agents
      const all = await getAllAgents();
      agentAddresses = all.map((a) => a.token_address);
    }

    if (agentAddresses.length === 0) {
      return res.json({ agents: [] });
    }

    const eloMap = await getEloRatings(agentAddresses).catch(() => new Map<string, { rating: number; handsPlayed: number }>());

    const results = await Promise.all(
      agentAddresses.map(async (addr) => {
        const strategies = await getAgentStrategies(addr, limit).catch(() => []);
        const elo = eloMap.get(addr);
        return {
          agent: addr,
          eloRating: elo ? elo.rating : 1500,
          strategies: strategies.map((s) => ({
            version: s.version,
            aggressionBps: s.aggression_bps,
            tightnessBps: s.tightness_bps,
            bluffFreqBps: s.bluff_freq_bps,
            personaId: s.persona_id,
            configHash: s.config_hash,
            blockNumber: s.block_number,
            txHash: s.tx_hash,
            timestamp: s.created_at.toISOString(),
          })),
        };
      })
    );

    res.json({ agents: results });
  } catch (error) {
    logger.error({ err: error }, "Error fetching evolution timeline:");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /evolution/meta-shifts?period=24h|7d|all
 * Returns aggregate meta-game trend: average aggression/tightness across all agents over time.
 */
router.get("/evolution/meta-shifts", async (req, res) => {
  try {
    const period = (req.query.period as string || "all").toLowerCase();
    const validPeriods = ["24h", "7d", "all"];
    if (!validPeriods.includes(period)) {
      return res.status(400).json({ error: "Invalid period. Valid: 24h, 7d, all" });
    }

    const agents = await getAllAgents();
    const allTokenAddresses = agents.map((a) => a.token_address);
    const eloMap = await getEloRatings(allTokenAddresses).catch(() => new Map<string, { rating: number; handsPlayed: number }>());

    const periodStartMs = period === "24h" ? Date.now() - 86_400_000
      : period === "7d" ? Date.now() - 7 * 86_400_000
      : 0;

    // Gather latest strategy per agent
    const agentCurrentStats: Array<{ agent: string; aggressionBps: number; tightnessBps: number; bluffFreqBps: number; elo: number }> = [];
    let totalAggression = 0, totalTightness = 0, totalBluff = 0, count = 0;

    for (const agent of agents) {
      const strategies = await getAgentStrategies(agent.token_address, 1).catch(() => []);
      if (strategies.length === 0) continue;
      const s = strategies[0]; // latest
      const ts = s.created_at instanceof Date ? s.created_at.getTime() : new Date(s.created_at).getTime();
      if (periodStartMs > 0 && ts < periodStartMs) continue;

      const elo = eloMap.get(agent.token_address)?.rating ?? 1500;
      agentCurrentStats.push({
        agent: agent.token_address,
        aggressionBps: s.aggression_bps,
        tightnessBps: s.tightness_bps,
        bluffFreqBps: s.bluff_freq_bps,
        elo,
      });
      totalAggression += s.aggression_bps;
      totalTightness += s.tightness_bps;
      totalBluff += s.bluff_freq_bps;
      count++;
    }

    const avgAggression = count > 0 ? Math.round(totalAggression / count) : 5000;
    const avgTightness = count > 0 ? Math.round(totalTightness / count) : 5000;
    const avgBluff = count > 0 ? Math.round(totalBluff / count) : 3000;

    res.json({
      period,
      agentCount: count,
      averages: { aggressionBps: avgAggression, tightnessBps: avgTightness, bluffFreqBps: avgBluff },
      agents: agentCurrentStats,
    });
  } catch (error) {
    logger.error({ err: error }, "Error fetching meta-shifts:");
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

// ============ T-1201: Side Bet Routes ============

/**
 * GET /api/sidebets/:tableAddress/:handId
 * Returns pool info + seat totals for a specific hand.
 */
router.get("/sidebets/:tableAddress/:handId", globalRateLimit, async (req: Request, res: Response) => {
  const { tableAddress, handId } = req.params;
  if (!tableAddress || !handId) {
    res.status(400).json({ error: "Missing tableAddress or handId" });
    return;
  }
  try {
    const { query: dbQuery } = await import("../db/pool.js");
    const [betsResult, settlementResult] = await Promise.all([
      dbQuery<{ seat_index: number; total: string }>(
        `SELECT seat_index, SUM(amount)::TEXT as total FROM side_bets WHERE table_address = $1 AND hand_id = $2 GROUP BY seat_index`,
        [tableAddress.toLowerCase(), handId]
      ),
      dbQuery(
        `SELECT * FROM side_bet_settlements WHERE table_address = $1 AND hand_id = $2 LIMIT 1`,
        [tableAddress.toLowerCase(), handId]
      ),
    ]);
    const seatTotals: Record<number, string> = {};
    let totalPool = 0n;
    for (const row of betsResult.rows) {
      seatTotals[row.seat_index] = row.total;
      totalPool += BigInt(row.total);
    }
    const settlement = settlementResult.rows[0] ?? null;
    res.json({
      tableAddress: tableAddress.toLowerCase(),
      handId,
      totalPool: totalPool.toString(),
      seatTotals,
      settled: !!settlement,
      winnerSeat: settlement?.winner_seat ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to get side bet pool info");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sidebets/:tableAddress/:handId/user/:address
 * Returns bets placed by a specific user for a hand.
 */
router.get("/sidebets/:tableAddress/:handId/user/:address", globalRateLimit, async (req: Request, res: Response) => {
  const { tableAddress, handId, address } = req.params;
  try {
    const { query: dbQuery } = await import("../db/pool.js");
    const result = await dbQuery(
      `SELECT seat_index, amount, tx_hash, block_number, timestamp FROM side_bets WHERE table_address = $1 AND hand_id = $2 AND bettor = $3 ORDER BY id`,
      [tableAddress.toLowerCase(), handId, address.toLowerCase()]
    );
    res.json({ tableAddress: tableAddress.toLowerCase(), handId, user: address.toLowerCase(), bets: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to get user side bets");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * GET /api/sidebets/leaderboard
 * Returns top side betters by total winnings.
 */
router.get("/sidebets/leaderboard", globalRateLimit, async (_req: Request, res: Response) => {
  try {
    const { query: dbQuery } = await import("../db/pool.js");
    const result = await dbQuery(
      `SELECT sb.bettor,
              SUM(sb.amount)::TEXT as total_bet,
              COUNT(DISTINCT sb.pool_key)::INTEGER as total_bets
       FROM side_bets sb
       INNER JOIN side_bet_settlements sbs ON sb.pool_key = sbs.pool_key AND sb.seat_index = sbs.winner_seat
       GROUP BY sb.bettor
       ORDER BY total_bet DESC
       LIMIT 50`,
      []
    );
    res.json({ leaderboard: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to get side bet leaderboard");
    res.status(500).json({ error: "Internal server error" });
  }
});

// ============ T-1206: AI Decision Audit Routes ============

/**
 * GET /api/audit/:tableAddress/:handId
 * Returns the on-chain reasoning hash audit trail for a hand.
 */
router.get("/audit/:tableAddress/:handId", globalRateLimit, async (req: Request, res: Response) => {
  const { tableAddress, handId } = req.params;
  try {
    const { query: dbQuery } = await import("../db/pool.js");
    const result = await dbQuery(
      `SELECT seat_index, reasoning_hash, commit_tx_hash, block_number, verified FROM decision_audit WHERE table_address = $1 AND hand_id = $2 ORDER BY seat_index`,
      [tableAddress.toLowerCase(), handId]
    );
    res.json({ tableAddress: tableAddress.toLowerCase(), handId, decisions: result.rows });
  } catch (err) {
    logger.error({ err }, "Failed to get audit trail");
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * POST /api/audit/verify
 * Verify reasoning data matches on-chain keccak256 hash.
 * Body: { handId, seatIndex, tableAddress, reasoning, factors, breakdown }
 */
router.post("/audit/verify", globalRateLimit, async (req: Request, res: Response) => {
  const { handId, seatIndex, tableAddress, reasoning, factors, breakdown, opponentRead } = req.body as Record<string, unknown>;
  if (!handId || seatIndex === undefined || !tableAddress || !reasoning) {
    res.status(400).json({ error: "Missing required fields: handId, seatIndex, tableAddress, reasoning" });
    return;
  }
  try {
    const { query: dbQuery } = await import("../db/pool.js");
    const payload = JSON.stringify({ reasoning, factors, breakdown, opponentRead });
    const { keccak256, toBytes } = await import("viem");
    const computedHash = keccak256(toBytes(payload));

    const result = await dbQuery(
      `SELECT reasoning_hash FROM decision_audit WHERE table_address = $1 AND hand_id = $2 AND seat_index = $3 LIMIT 1`,
      [String(tableAddress).toLowerCase(), String(handId), Number(seatIndex)]
    );
    if (result.rows.length === 0) {
      res.json({ verified: false, reason: "No on-chain hash found for this decision" });
      return;
    }
    const onChainHash = result.rows[0].reasoning_hash as string;
    const verified = onChainHash.toLowerCase() === computedHash.toLowerCase();
    res.json({ verified, computedHash, onChainHash });
  } catch (err) {
    logger.error({ err }, "Failed to verify audit hash");
    res.status(500).json({ error: "Internal server error" });
  }
});
