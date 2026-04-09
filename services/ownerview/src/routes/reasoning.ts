// Reasoning storage and retrieval API
// POST /reasoning — agent bot submits action reasoning
// GET  /reasoning  — public retrieval of reasoning data

import { Router, type Request, type Response } from "express";
import { createLogger } from "@playerco/shared";

const logger = createLogger({ service: "ownerview:reasoning" });

export interface ReasoningFactors {
  handStrength: string;
  potOdds: string;
  position: string;
  opponentRead: string;
  sizing?: string;
  riskAssessment?: string;
}

export interface GTODeviationData {
  gtoAction: "raise" | "call" | "fold";
  gtoFrequency: number;
  aiAction: "raise" | "call" | "fold";
  isDeviation: boolean;
  deviationType: "aligned" | "tighter" | "looser" | "passive" | "aggressive";
  severity: number;
}

export interface ReasoningEntry {
  tableAddress: string;
  handId: string;
  seatIndex: number;
  txHash?: string;
  action: string;
  raiseAmount?: string;
  reasoning: string;
  factors?: ReasoningFactors;
  /** T-1104: GTO baseline deviation data (preflop decisions only) */
  gtoDeviation?: GTODeviationData;
  timestamp: number;
}

// In-memory store: key = `${tableAddress}:${handId}:${seatIndex}:${txHash}`
// Also indexed by `${tableAddress}:${handId}` for list queries.
const reasoningStore = new Map<string, ReasoningEntry>();

function storeKey(e: Pick<ReasoningEntry, "tableAddress" | "handId" | "seatIndex" | "txHash">): string {
  return `${e.tableAddress.toLowerCase()}:${e.handId}:${e.seatIndex}:${e.txHash ?? ""}`;
}

function listKey(tableAddress: string, handId: string): string {
  return `${tableAddress.toLowerCase()}:${handId}`;
}

// Index: listKey → Set<storeKey>
const listIndex = new Map<string, Set<string>>();

function addToStore(entry: ReasoningEntry): void {
  const sk = storeKey(entry);
  reasoningStore.set(sk, entry);
  const lk = listKey(entry.tableAddress, entry.handId);
  if (!listIndex.has(lk)) {
    listIndex.set(lk, new Set());
  }
  listIndex.get(lk)!.add(sk);
}

export function createReasoningRoutes(): Router {
  const router = Router();

  /**
   * POST /reasoning
   * Body: { tableAddress, handId, seatIndex, txHash?, action, raiseAmount?, reasoning, factors? }
   * No auth required for MVP (operator signature validation is a P1 upgrade).
   * In production, add operator signature verification here.
   */
  router.post("/", (req: Request, res: Response) => {
    const { tableAddress, handId, seatIndex, txHash, action, raiseAmount, reasoning, factors } = req.body as Record<string, unknown>;

    if (
      typeof tableAddress !== "string" ||
      typeof handId !== "string" ||
      typeof seatIndex !== "number" ||
      typeof action !== "string" ||
      typeof reasoning !== "string"
    ) {
      res.status(400).json({ error: "Missing required fields: tableAddress, handId, seatIndex, action, reasoning" });
      return;
    }

    const { gtoDeviation } = req.body as Record<string, unknown>;

    const entry: ReasoningEntry = {
      tableAddress: tableAddress.toLowerCase(),
      handId,
      seatIndex,
      txHash: typeof txHash === "string" ? txHash : undefined,
      action,
      raiseAmount: typeof raiseAmount === "string" ? raiseAmount : undefined,
      reasoning,
      factors: factors && typeof factors === "object" ? (factors as ReasoningFactors) : undefined,
      gtoDeviation: gtoDeviation && typeof gtoDeviation === "object" ? (gtoDeviation as GTODeviationData) : undefined,
      timestamp: Date.now(),
    };

    addToStore(entry);

    logger.info(
      { tableAddress: entry.tableAddress, handId, seatIndex, action },
      "Reasoning stored"
    );

    res.status(201).json({ ok: true });
  });

  /**
   * GET /reasoning?tableAddress=&handId=[&seatIndex=]
   * Public endpoint — returns reasoning for a hand (all seats or specific seat).
   */
  router.get("/", (req: Request, res: Response) => {
    const { tableAddress, handId, seatIndex } = req.query as Record<string, string | undefined>;

    if (!tableAddress || !handId) {
      res.status(400).json({ error: "Missing required query params: tableAddress, handId" });
      return;
    }

    const lk = listKey(tableAddress, handId);
    const keys = listIndex.get(lk);

    if (!keys || keys.size === 0) {
      res.json({ tableAddress, handId, entries: [] });
      return;
    }

    let entries = [...keys]
      .map((k) => reasoningStore.get(k))
      .filter((e): e is ReasoningEntry => e !== undefined);

    if (seatIndex !== undefined) {
      const si = parseInt(seatIndex, 10);
      if (!Number.isNaN(si)) {
        entries = entries.filter((e) => e.seatIndex === si);
      }
    }

    // Sort by timestamp ascending
    entries.sort((a, b) => a.timestamp - b.timestamp);

    res.json({ tableAddress, handId, entries });
  });

  return router;
}

/**
 * Log a warning that in-memory data is lost on restart (MVP notice).
 */
export function logMemoryWarning(): void {
  logger.warn(
    {},
    "Reasoning store is in-memory — data will be lost on restart (MVP). Consider persisting to DB for production."
  );
}

// ─── Treasury Reasoning Store ─────────────────────────────────────────────────

export interface TreasuryReasoningFactors {
  navVsMarket: string;
  pnlTrend: string;
  sizeJustification: string;
}

export interface TreasuryReasoningEntry {
  vaultAddress: string;
  handId: string;
  action: "buy" | "sell" | "skip";
  amountBps: number;
  reasoning: string;
  confidence: number;
  factors: TreasuryReasoningFactors;
  txHash?: string;
  timestamp: number;
}

// In-memory store: key = `${vaultAddress}:${handId}`
const treasuryStore = new Map<string, TreasuryReasoningEntry>();

function treasuryKey(vaultAddress: string, handId: string): string {
  return `${vaultAddress.toLowerCase()}:${handId}`;
}

export function createTreasuryReasoningRouter(): Router {
  const router = Router();

  /**
   * POST /treasury-reasoning — KeeperBot submits treasury rebalancing reasoning.
   * Body: { vaultAddress, handId, action, amountBps, reasoning, confidence, factors, txHash? }
   */
  router.post("/", (req: Request, res: Response) => {
    const { vaultAddress, handId, action, amountBps, reasoning, confidence, factors, txHash } = req.body;

    if (!vaultAddress || !handId || !action || !reasoning) {
      res.status(400).json({ error: "Missing required fields: vaultAddress, handId, action, reasoning" });
      return;
    }
    if (!["buy", "sell", "skip"].includes(action)) {
      res.status(400).json({ error: "action must be buy, sell, or skip" });
      return;
    }

    const entry: TreasuryReasoningEntry = {
      vaultAddress: String(vaultAddress).toLowerCase(),
      handId: String(handId),
      action: action as "buy" | "sell" | "skip",
      amountBps: typeof amountBps === "number" ? amountBps : 0,
      reasoning: String(reasoning),
      confidence: typeof confidence === "number" ? confidence : 0.5,
      factors: factors && typeof factors === "object" ? factors as TreasuryReasoningFactors : { navVsMarket: "", pnlTrend: "", sizeJustification: "" },
      txHash: txHash ? String(txHash) : undefined,
      timestamp: Date.now(),
    };

    treasuryStore.set(treasuryKey(entry.vaultAddress, entry.handId), entry);
    logger.info({ vaultAddress: entry.vaultAddress, handId: entry.handId, action: entry.action, amountBps: entry.amountBps }, "Treasury reasoning stored");
    res.status(201).json({ ok: true });
  });

  /**
   * GET /treasury-reasoning?vaultAddress=&handId=
   * Returns the treasury reasoning entry for the given vault/hand.
   */
  router.get("/", (req: Request, res: Response) => {
    const { vaultAddress, handId } = req.query as Record<string, string | undefined>;
    if (!vaultAddress) {
      res.status(400).json({ error: "Missing required query param: vaultAddress" });
      return;
    }

    if (handId) {
      const entry = treasuryStore.get(treasuryKey(vaultAddress, handId));
      res.json({ vaultAddress, handId, entry: entry ?? null });
      return;
    }

    // Return all entries for this vault (latest 50)
    const entries = [...treasuryStore.values()]
      .filter((e) => e.vaultAddress === vaultAddress.toLowerCase())
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 50);
    res.json({ vaultAddress, entries });
  });

  return router;
}
