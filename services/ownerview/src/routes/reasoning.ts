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

export interface ReasoningEntry {
  tableAddress: string;
  handId: string;
  seatIndex: number;
  txHash?: string;
  action: string;
  raiseAmount?: string;
  reasoning: string;
  factors?: ReasoningFactors;
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

    const entry: ReasoningEntry = {
      tableAddress: tableAddress.toLowerCase(),
      handId,
      seatIndex,
      txHash: typeof txHash === "string" ? txHash : undefined,
      action,
      raiseAmount: typeof raiseAmount === "string" ? raiseAmount : undefined,
      reasoning,
      factors: factors && typeof factors === "object" ? (factors as ReasoningFactors) : undefined,
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
