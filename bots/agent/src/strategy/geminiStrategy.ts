import { Decision } from "./types.js";
import type {
  ActionDecision,
  DecisionContext,
  DecisionBreakdown,
  HoleCards,
  ReasoningFactors,
  Strategy,
} from "./types.js";
import type { PersonaConfig } from "./persona.js";
import { SimpleStrategy } from "./simpleStrategy.js";
import type { VectorStore } from "../rag/vectorStore.js";
import { buildQueryVector } from "../rag/embedder.js";
import { createLogger } from "@playerco/shared";
import type { TableState } from "../chain/client.js";

const logger = createLogger({ service: "agent-bot:gemini" });

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
}

interface GeminiRawDecision {
  action?: unknown;
  raiseAmount?: unknown;
  raiseTarget?: unknown;
  reasoning?: unknown;
  factors?: unknown;
  breakdown?: unknown;
}

export interface GeminiStrategyConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  endpointBaseUrl?: string;
  fallbackStrategy?: Strategy;
  persona?: PersonaConfig;
  vectorStore?: VectorStore;
}

interface RaiseBounds {
  minRaiseTarget: bigint;
  maxRaiseTarget: bigint;
  canRaise: boolean;
}

// ─── Opponent Model ────────────────────────────────────────────────────────────

interface SeatStats {
  foldCount: number;
  callCount: number;
  raiseCount: number;
  checkCount: number;
}

/**
 * Per-seat action frequency tracker.
 * Infers opponent tendencies by comparing successive table state snapshots.
 * Frequencies are lifetime-cumulative (reset on new GeminiStrategy instance only).
 */
class OpponentModel {
  private stats = new Map<number, SeatStats>();

  private getOrCreate(seatIndex: number): SeatStats {
    let s = this.stats.get(seatIndex);
    if (!s) {
      s = { foldCount: 0, callCount: 0, raiseCount: 0, checkCount: 0 };
      this.stats.set(seatIndex, s);
    }
    return s;
  }

  recordFold(seatIndex: number) { this.getOrCreate(seatIndex).foldCount++; }
  recordCall(seatIndex: number) { this.getOrCreate(seatIndex).callCount++; }
  recordRaise(seatIndex: number) { this.getOrCreate(seatIndex).raiseCount++; }
  recordCheck(seatIndex: number) { this.getOrCreate(seatIndex).checkCount++; }

  /**
   * Returns a human-readable tendency label for a seat.
   * "tight" = mostly folds, "aggressive" = mostly raises, "passive" = calls, "balanced" = mix.
   */
  getTendency(seatIndex: number): string {
    const s = this.stats.get(seatIndex);
    if (!s) return "unknown";
    const total = s.foldCount + s.callCount + s.raiseCount + s.checkCount;
    if (total < 3) return "unknown";
    const foldRate = s.foldCount / total;
    const raiseRate = s.raiseCount / total;
    const callRate = s.callCount / total;
    if (foldRate > 0.6) return "tight";
    if (raiseRate > 0.4) return "aggressive";
    if (callRate > 0.5 && raiseRate < 0.15) return "calling-station";
    return "balanced";
  }

  getSummary(seatIndex: number): string {
    const s = this.stats.get(seatIndex);
    if (!s) return "no data";
    const total = s.foldCount + s.callCount + s.raiseCount + s.checkCount;
    if (total === 0) return "no data";
    return `${total} actions: fold=${s.foldCount} call=${s.callCount} raise=${s.raiseCount} check=${s.checkCount} (${this.getTendency(seatIndex)})`;
  }
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_ENDPOINT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_TEMPERATURE = 0.2;

// ─── Strategy ──────────────────────────────────────────────────────────────────

export class GeminiStrategy implements Strategy {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly timeoutMs: number;
  private readonly endpointBaseUrl: string;
  private readonly fallbackStrategy: Strategy;
  private readonly persona: PersonaConfig | undefined;
  private readonly vectorStore: VectorStore | undefined;
  private readonly opponentModel = new OpponentModel();

  /** Previous table state snapshot for action inference between our turns. */
  private prevState: TableState | null = null;
  private prevHandId: bigint = 0n;

  constructor(config: GeminiStrategyConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODEL;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.endpointBaseUrl = config.endpointBaseUrl || DEFAULT_ENDPOINT_BASE_URL;
    this.persona = config.persona;
    this.vectorStore = config.vectorStore;
    this.fallbackStrategy = config.fallbackStrategy || new SimpleStrategy(
      config.persona?.aggression ?? 0.3
    );
  }

  async decide(context: DecisionContext): Promise<ActionDecision> {
    // Update opponent model from state diff before deciding
    this._updateOpponentModel(context.tableState, context.mySeatIndex);

    try {
      const prompt = this.buildPrompt(context);
      const modelDecision = await this.requestDecision(prompt);
      const parsed = parseGeminiDecision(modelDecision);
      if (!parsed) {
        throw new Error("Gemini returned an unparsable decision");
      }
      return this.sanitizeDecision(parsed, context);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      logger.warn({ reason }, "GeminiStrategy falling back to simple strategy");
      const fallbackDecision = await this.fallbackStrategy.decide(context);
      return {
        ...fallbackDecision,
        reasoning: fallbackDecision.reasoning ?? `Fallback: ${reason}. Playing safe with ${fallbackDecision.action}.`,
      };
    } finally {
      // Save state snapshot for next call's diff
      this.prevState = context.tableState;
      this.prevHandId = context.tableState.currentHandId;
    }
  }

  /**
   * Infer opponent actions by comparing current state with the previous snapshot.
   * Called at the start of each decide() before building the prompt.
   */
  private _updateOpponentModel(state: TableState, mySeatIndex: number): void {
    const prev = this.prevState;
    if (!prev) return;
    // Reset tracking if a new hand started
    if (state.currentHandId !== this.prevHandId) return;

    const numSeats = state.seats.length;
    for (let i = 0; i < numSeats; i++) {
      if (i === mySeatIndex) continue;
      const cur = state.seats[i];
      const old = prev.seats[i];
      if (!old || !cur) continue;

      // Opponent folded
      if (old.isActive && !cur.isActive) {
        this.opponentModel.recordFold(i);
        logger.debug({ seatIndex: i }, "OpponentModel: inferred fold");
        continue;
      }

      // Opponent's bet increased → called or raised
      if (cur.currentBet > old.currentBet) {
        const delta = cur.currentBet - old.currentBet;
        if (delta > (state.bigBlind * 2n) && cur.currentBet > prev.hand.currentBet) {
          this.opponentModel.recordRaise(i);
          logger.debug({ seatIndex: i, delta: String(delta) }, "OpponentModel: inferred raise");
        } else {
          this.opponentModel.recordCall(i);
          logger.debug({ seatIndex: i, delta: String(delta) }, "OpponentModel: inferred call");
        }
        continue;
      }

      // Bet unchanged and seat still active — likely checked (or no action yet this tick)
      if (cur.isActive && old.isActive && cur.currentBet === old.currentBet &&
          state.hand.actorSeat !== i) {
        // Only record check if we think they had a chance to act
        // (actionsInRound increased but their bet didn't change)
        if ((state.hand as any).actionsInRound > (prev.hand as any).actionsInRound) {
          this.opponentModel.recordCheck(i);
          logger.debug({ seatIndex: i }, "OpponentModel: inferred check");
        }
      }
    }
  }

  private async requestDecision(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url =
      `${this.endpointBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: this.temperature,
            responseMimeType: "application/json",
            maxOutputTokens: this.vectorStore ? 400 : 300,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const responseText = await response.text();
        throw new Error(`Gemini API ${response.status}: ${responseText}`);
      }

      const payload = (await response.json()) as GeminiGenerateContentResponse;
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) {
        throw new Error("Gemini response missing text content");
      }

      return text;
    } finally {
      clearTimeout(timeout);
    }
  }

  private sanitizeDecision(
    rawDecision: GeminiRawDecision,
    context: DecisionContext
  ): ActionDecision {
    const fallback = this.defaultSafeDecision(context);
    const normalizedAction = normalizeAction(rawDecision.action);

    // Extract reasoning (graceful — never blocks action decision)
    const reasoning = typeof rawDecision.reasoning === "string" && rawDecision.reasoning.trim()
      ? rawDecision.reasoning.trim()
      : undefined;

    // Extract factors (graceful — never blocks action decision)
    const factors = extractReasoningFactors(rawDecision.factors);

    // T-1205: Extract decision breakdown
    const breakdown = extractDecisionBreakdown(rawDecision.breakdown);

    if (!normalizedAction) {
      return { ...fallback, reasoning, factors, breakdown };
    }

    if (normalizedAction === Decision.CHECK) {
      return context.canCheck
        ? { action: Decision.CHECK, reasoning, factors, breakdown }
        : { ...fallback, reasoning, factors, breakdown };
    }

    if (normalizedAction === Decision.CALL) {
      if (context.canCheck) {
        return { action: Decision.CHECK, reasoning, factors, breakdown };
      }
      return context.amountToCall > 0n
        ? { action: Decision.CALL, reasoning, factors, breakdown }
        : { action: Decision.CHECK, reasoning, factors, breakdown };
    }

    if (normalizedAction === Decision.FOLD) {
      return context.canCheck
        ? { action: Decision.CHECK, reasoning, factors, breakdown }
        : { action: Decision.FOLD, reasoning, factors, breakdown };
    }

    const bounds = getRaiseBounds(context);
    if (!bounds.canRaise) {
      return { ...fallback, reasoning, factors, breakdown };
    }

    const requestedRaise = parseBigIntValue(rawDecision.raiseTarget ?? rawDecision.raiseAmount);
    if (requestedRaise === null) {
      return { ...fallback, reasoning, factors, breakdown };
    }

    const clampedRaise = clampBigInt(
      requestedRaise,
      bounds.minRaiseTarget,
      bounds.maxRaiseTarget
    );
    return {
      action: Decision.RAISE,
      raiseAmount: clampedRaise,
      reasoning,
      factors,
      breakdown,
    };
  }

  private defaultSafeDecision(context: DecisionContext): ActionDecision {
    if (context.canCheck) {
      return { action: Decision.CHECK };
    }
    if (context.amountToCall > 0n) {
      return { action: Decision.CALL };
    }
    return { action: Decision.CHECK };
  }

  private buildRagContext(context: DecisionContext, position: string): string | null {
    if (!this.vectorStore || this.vectorStore.size === 0) return null;

    // Build a query vector from the current situation
    const holeCardsFormatted = formatHoleCards(context.holeCards).join(" ") || "unknown";
    const state = context.tableState;
    const communityCount = state.communityCards.filter(c => c !== 255).length;
    const boardTexture = communityCount === 0 ? "preflop" : communityCount <= 3 ? "flop" : "turn or river";

    const queryVec = buildQueryVector({
      position,
      holeCards: holeCardsFormatted,
      boardTexture,
    });

    const similar = this.vectorStore.search(queryVec, 3);
    if (similar.length === 0) return null;

    const lines = similar.map((v, i) => {
      const s = v.summary;
      const pnlStr = s.pnl >= 0n ? `+${s.pnl}` : String(s.pnl);
      return `  - Hand #${v.handId} (${s.position}, ${s.holeCards}): ${s.actions.join("→")} → ${s.result} ${pnlStr} chips.${s.reasoning ? ` Reasoning: "${s.reasoning.slice(0, 80)}..."` : ""}`;
    });

    return [
      "Similar past hands for reference:",
      ...lines,
      "Use these as reference but make your own judgment based on current conditions.",
    ].join("\n");
  }

  private buildPrompt(context: DecisionContext): string {
    const state = context.tableState;
    const seat = state.seats[context.mySeatIndex];
    const raiseBounds = getRaiseBounds(context);
    const isAllInCall = context.amountToCall > seat.stack && seat.stack > 0n;

    // Pot odds
    const potOddsStr = context.amountToCall > 0n && context.amountToCall <= seat.stack
      ? `${Number((context.amountToCall * 100n) / (state.hand.pot + context.amountToCall))}%`
      : "n/a";

    // Community cards description
    const communityDesc = state.communityCards.length > 0
      ? state.communityCards.filter(c => c !== 255).map(formatCard).join(" ") || "none"
      : "none";

    // Position
    const position = describePosition(context.mySeatIndex, state.buttonSeat, state.seats.length);

    // Opponent tendencies
    const opponentInfo: Record<number, string> = {};
    for (let i = 0; i < state.seats.length; i++) {
      if (i === context.mySeatIndex) continue;
      if (state.seats[i].owner !== "0x0000000000000000000000000000000000000000") {
        opponentInfo[i] = this.opponentModel.getSummary(i);
      }
    }

    const summary = {
      stage: gameStateToLabel(state.gameState),
      handId: state.currentHandId.toString(),
      position,
      mySeatIndex: context.mySeatIndex,
      canCheck: context.canCheck,
      amountToCall: context.amountToCall.toString(),
      potOdds: potOddsStr,
      stack: seat.stack.toString(),
      myCurrentBet: seat.currentBet.toString(),
      tableCurrentBet: state.hand.currentBet.toString(),
      pot: state.hand.pot.toString(),
      bigBlind: state.bigBlind.toString(),
      holeCards: formatHoleCards(context.holeCards),
      communityCards: communityDesc,
      allInSituation: {
        isAllInCall,
        effectiveCallAmount: isAllInCall ? seat.stack.toString() : context.amountToCall.toString(),
      },
      raise: {
        canRaise: raiseBounds.canRaise,
        minRaiseTarget: raiseBounds.minRaiseTarget.toString(),
        maxRaiseTarget: raiseBounds.maxRaiseTarget.toString(),
      },
      opponents: opponentInfo,
      ...(this.persona ? {
        personality: {
          aggression: this.persona.aggression,
          tightness: this.persona.tightness,
          bluffFrequency: this.persona.bluffFrequency,
          style: `${this.persona.name} — ${this.persona.description}`,
        },
      } : {}),
    };

    // Build RAG context from similar past hands
    const ragSection = this.buildRagContext(context, position);

    const systemLine = this.persona?.systemPromptOverride
      ?? "You are a no-limit Texas Hold'em agent.";

    return [
      systemLine,
      ...(ragSection ? [ragSection] : []),
      ...(context.opponentRead ? [context.opponentRead] : []),
      "Return exactly one compact JSON object and no extra text.",
      'Format: {"action":"fold|check|call|raise","raiseTarget":"<integer in chip units>","reasoning":"<1-2 sentence explanation in English>","factors":{"handStrength":"...","potOdds":"...","position":"...","opponentRead":"...","sizing":"...","riskAssessment":"..."},"breakdown":{"handStrength":"<description + percentile>","potOdds":"<calculation>","evEstimate":"<+EV or -EV reasoning>","opponentRead":"<what you think about opponent range>","keyFactor":"<single most important factor>","confidence":<0-100>}}',
      "Always include reasoning explaining WHY you chose this action, referencing specific game factors.",
      "Always include a breakdown field with handStrength, potOdds, evEstimate, opponentRead, keyFactor, and confidence (0-100).",
      "Stay in character as described above.",
      "Rules: never output an illegal action; if unsure choose check or call.",
      "All-in rules: if amountToCall > stack, calling commits only your remaining stack.",
      "All-in rules: if raising, raiseTarget is capped at your stack (maxRaiseTarget).",
      "Pot odds: if potOdds is high (>40%), calling/raising is expensive; fold marginal hands.",
      "Opponent tendencies: use opponents field to exploit — raise tight players, be cautious vs aggressive.",
      `Game context: ${JSON.stringify(summary)}`,
    ].join("\n");
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function normalizeAction(value: unknown): Decision | null {
  if (typeof value !== "string") {
    return null;
  }

  const lowered = value.trim().toLowerCase();
  if (lowered === Decision.FOLD) return Decision.FOLD;
  if (lowered === Decision.CHECK) return Decision.CHECK;
  if (lowered === Decision.CALL) return Decision.CALL;
  if (lowered === Decision.RAISE) return Decision.RAISE;
  return null;
}

function clampBigInt(value: bigint, min: bigint, max: bigint): bigint {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function parseBigIntValue(value: unknown): bigint | null {
  if (typeof value === "bigint") {
    return value;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
      return null;
    }
    return BigInt(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }
    return BigInt(trimmed);
  }

  return null;
}

function extractFirstJsonObject(raw: string): string | null {
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return null;
  }
  return raw.slice(firstBrace, lastBrace + 1);
}

export function parseGeminiDecision(rawText: string): GeminiRawDecision | null {
  const trimmed = rawText.trim();
  const jsonCandidate = extractFirstJsonObject(trimmed);
  if (!jsonCandidate) {
    return null;
  }

  try {
    return JSON.parse(jsonCandidate) as GeminiRawDecision;
  } catch {
    return null;
  }
}

function getRaiseBounds(context: DecisionContext): RaiseBounds {
  const seat = context.tableState.seats[context.mySeatIndex];
  const minRaiseTarget =
    context.tableState.hand.currentBet === 0n
      ? context.tableState.bigBlind * 2n
      : context.tableState.hand.currentBet * 2n;
  const maxRaiseTarget = seat.currentBet + seat.stack;
  return {
    minRaiseTarget,
    maxRaiseTarget,
    canRaise: maxRaiseTarget > minRaiseTarget,
  };
}

function formatHoleCards(cards: HoleCards | null): string[] {
  if (!cards) return [];
  return [formatCard(cards.card1), formatCard(cards.card2)];
}

/** Convert a 0–51 card index into a human-readable string like "Ah", "Ts", "2d". */
function formatCard(cardIndex: number): string {
  if (cardIndex === 255) return "?";
  const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
  const suits = ["c", "d", "h", "s"];
  return `${ranks[cardIndex % 13]}${suits[Math.floor(cardIndex / 13)]}`;
}

/** Describe our position at the table relative to the button. */
function describePosition(seatIndex: number, buttonSeat: number, numSeats: number): string {
  const relative = (seatIndex - buttonSeat + numSeats) % numSeats;
  if (relative === 0) return "BTN";
  if (relative === 1) return "SB";
  if (relative === 2) return "BB";
  if (relative === numSeats - 1) return "CO";
  return `UTG+${relative - 3}`;
}

function extractDecisionBreakdown(raw: unknown): DecisionBreakdown | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const getString = (key: string): string | undefined =>
    typeof obj[key] === "string" ? (obj[key] as string) : undefined;
  const handStrength = getString("handStrength");
  const potOdds = getString("potOdds");
  const evEstimate = getString("evEstimate");
  const opponentRead = getString("opponentRead");
  const keyFactor = getString("keyFactor");
  const confidenceRaw = obj["confidence"];
  const confidence = typeof confidenceRaw === "number"
    ? Math.max(0, Math.min(100, Math.round(confidenceRaw)))
    : 50;
  if (!handStrength || !potOdds || !evEstimate || !opponentRead || !keyFactor) return undefined;
  return { handStrength, potOdds, evEstimate, opponentRead, keyFactor, confidence };
}

function extractReasoningFactors(raw: unknown): ReasoningFactors | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const getString = (key: string): string | undefined =>
    typeof obj[key] === "string" ? (obj[key] as string) : undefined;
  const handStrength = getString("handStrength");
  const potOdds = getString("potOdds");
  const position = getString("position");
  const opponentRead = getString("opponentRead");
  // All four required fields must be present
  if (!handStrength || !potOdds || !position || !opponentRead) return undefined;
  return {
    handStrength,
    potOdds,
    position,
    opponentRead,
    sizing: getString("sizing"),
    riskAssessment: getString("riskAssessment"),
  };
}

function gameStateToLabel(state: number): string {
  switch (state) {
    case 2:
      return "preflop";
    case 4:
      return "flop";
    case 6:
      return "turn";
    case 8:
      return "river";
    default:
      return `state_${state}`;
  }
}
