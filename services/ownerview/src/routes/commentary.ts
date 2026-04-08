// AI Game Commentary API
// POST /commentary  — generate and store commentary for a poker hand event
// GET  /commentary  — retrieve commentary list for a hand

import { Router, type Request, type Response } from "express";
import { createLogger } from "@playerco/shared";

const logger = createLogger({ service: "ownerview:commentary" });

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const COMMENTARY_TIMEOUT_MS = 8000;

export interface CommentaryEntry {
  tableAddress: string;
  handId: string;
  street: string;               // "preflop" | "flop" | "turn" | "river" | "settlement"
  triggerAction: string;        // e.g. "street_started", "hand_settled", "action_taken"
  commentary: string;           // 1–3 sentence AI-generated commentary
  personaContext?: string;      // Persona name(s) involved
  timestamp: number;
}

// ── In-memory store (same pattern as reasoning store) ────────────────────────

// key = `${tableAddress.toLowerCase()}:${handId}:${index}`
const commentaryStore = new Map<string, CommentaryEntry>();
// list index: `${tableAddress.toLowerCase()}:${handId}` → CommentaryEntry[]
const commentaryListIndex = new Map<string, string[]>();

function listKey(tableAddress: string, handId: string): string {
  return `${tableAddress.toLowerCase()}:${handId}`;
}

function addEntry(entry: CommentaryEntry): void {
  const lk = listKey(entry.tableAddress, entry.handId);
  const keys = commentaryListIndex.get(lk) ?? [];
  const sk = `${lk}:${keys.length}`;
  commentaryStore.set(sk, entry);
  keys.push(sk);
  commentaryListIndex.set(lk, keys);
}

// ── Gemini call ──────────────────────────────────────────────────────────────

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

async function generateCommentary(
  tableAddress: string,
  handId: string,
  street: string,
  triggerAction: string,
  context: Record<string, unknown>
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const communityCards = Array.isArray(context.communityCards) ? (context.communityCards as number[]).join(", ") : "unknown";
  const pot = context.pot ?? "unknown";
  const recentActions = Array.isArray(context.recentActions) ? (context.recentActions as string[]).join("; ") : "none";
  const personaNames = Array.isArray(context.personaNames) ? (context.personaNames as string[]).join(", ") : "the agents";

  const streetLabel = street.charAt(0).toUpperCase() + street.slice(1);

  const prompt = [
    "You are an engaging poker commentator for an AI vs AI poker match.",
    "Generate 1–3 sentences of exciting commentary for this moment in the game.",
    "Focus on drama, tension, and AI decision-making. Do NOT reveal hole cards.",
    "",
    `Event: ${triggerAction} at the ${streetLabel}`,
    `Hand ID: ${handId}`,
    `Community cards: ${communityCards}`,
    `Pot: ${pot}`,
    `Recent actions: ${recentActions}`,
    `Players: ${personaNames}`,
    "",
    "Keep it punchy and exciting. 1–3 sentences only. No bullet points.",
  ].join("\n");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMMENTARY_TIMEOUT_MS);

  try {
    const response = await fetch(
      `${GEMINI_BASE_URL}/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 150,
          },
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Gemini API ${response.status}: ${text}`);
    }

    const payload = (await response.json()) as GeminiResponse;
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) throw new Error("Gemini returned empty text");
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

// ── Router ───────────────────────────────────────────────────────────────────

export function createCommentaryRoutes(): Router {
  const router = Router();

  /**
   * POST /commentary
   * Body: { tableAddress, handId, street, triggerAction, context }
   * context: { communityCards?, pot?, recentActions?, personaNames? }
   * Calls Gemini, stores commentary, returns the entry.
   */
  router.post("/", async (req: Request, res: Response) => {
    const { tableAddress, handId, street, triggerAction, context } = req.body as Record<string, unknown>;

    if (
      typeof tableAddress !== "string" ||
      typeof handId !== "string" ||
      typeof street !== "string" ||
      typeof triggerAction !== "string"
    ) {
      res.status(400).json({ error: "Missing required fields: tableAddress, handId, street, triggerAction" });
      return;
    }

    const ctx = (context && typeof context === "object") ? (context as Record<string, unknown>) : {};
    const personaContext = Array.isArray(ctx.personaNames)
      ? (ctx.personaNames as string[]).join(", ")
      : undefined;

    let commentary: string;
    try {
      commentary = await generateCommentary(tableAddress, handId, street, triggerAction, ctx);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), tableAddress, handId, street }, "Gemini commentary generation failed — using fallback");
      // Graceful fallback: generic commentary
      const streetLabel = street.charAt(0).toUpperCase() + street.slice(1);
      commentary = triggerAction === "hand_settled"
        ? "The hand has concluded. The AI agents battle on."
        : `The ${streetLabel} brings new possibilities. The AI agents analyze their options carefully.`;
    }

    const entry: CommentaryEntry = {
      tableAddress: tableAddress.toLowerCase(),
      handId,
      street,
      triggerAction,
      commentary,
      personaContext,
      timestamp: Date.now(),
    };

    addEntry(entry);

    logger.info({ tableAddress: entry.tableAddress, handId, street, triggerAction }, "Commentary stored");
    res.status(201).json({ ok: true, entry });
  });

  /**
   * GET /commentary?tableAddress=&handId=
   * Returns all commentary for a hand in chronological order.
   */
  router.get("/", (req: Request, res: Response) => {
    const { tableAddress, handId } = req.query as Record<string, string | undefined>;

    if (!tableAddress || !handId) {
      res.status(400).json({ error: "Missing required query params: tableAddress, handId" });
      return;
    }

    const lk = listKey(tableAddress, handId);
    const keys = commentaryListIndex.get(lk) ?? [];
    const entries = keys
      .map((k) => commentaryStore.get(k))
      .filter((e): e is CommentaryEntry => e !== undefined);

    res.json({ tableAddress, handId, entries });
  });

  return router;
}
