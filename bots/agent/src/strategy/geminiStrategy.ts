import { Decision } from "./types.js";
import type {
  ActionDecision,
  DecisionContext,
  HoleCards,
  Strategy,
} from "./types.js";
import { SimpleStrategy } from "./simpleStrategy.js";

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
}

export interface GeminiStrategyConfig {
  apiKey: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  endpointBaseUrl?: string;
  fallbackStrategy?: Strategy;
}

interface RaiseBounds {
  minRaiseTarget: bigint;
  maxRaiseTarget: bigint;
  canRaise: boolean;
}

const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_ENDPOINT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_TEMPERATURE = 0.2;

export class GeminiStrategy implements Strategy {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly timeoutMs: number;
  private readonly endpointBaseUrl: string;
  private readonly fallbackStrategy: Strategy;

  constructor(config: GeminiStrategyConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model || DEFAULT_MODEL;
    this.temperature = config.temperature ?? DEFAULT_TEMPERATURE;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.endpointBaseUrl = config.endpointBaseUrl || DEFAULT_ENDPOINT_BASE_URL;
    this.fallbackStrategy = config.fallbackStrategy || new SimpleStrategy(0.3);
  }

  async decide(context: DecisionContext): Promise<ActionDecision> {
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
      console.warn(`[GeminiStrategy] Falling back to simple strategy: ${reason}`);
      return await this.fallbackStrategy.decide(context);
    }
  }

  private async requestDecision(prompt: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const url =
      `${this.endpointBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent` +
      `?key=${encodeURIComponent(this.apiKey)}`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: this.temperature,
            responseMimeType: "application/json",
            maxOutputTokens: 60,
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
    if (!normalizedAction) {
      return fallback;
    }

    if (normalizedAction === Decision.CHECK) {
      return context.canCheck ? { action: Decision.CHECK } : fallback;
    }

    if (normalizedAction === Decision.CALL) {
      if (context.canCheck) {
        return { action: Decision.CHECK };
      }
      return context.amountToCall > 0n ? { action: Decision.CALL } : { action: Decision.CHECK };
    }

    if (normalizedAction === Decision.FOLD) {
      return context.canCheck ? { action: Decision.CHECK } : { action: Decision.FOLD };
    }

    const bounds = getRaiseBounds(context);
    if (!bounds.canRaise) {
      return fallback;
    }

    const requestedRaise = parseBigIntValue(rawDecision.raiseTarget ?? rawDecision.raiseAmount);
    if (requestedRaise === null) {
      return fallback;
    }

    const clampedRaise = clampBigInt(
      requestedRaise,
      bounds.minRaiseTarget,
      bounds.maxRaiseTarget
    );
    return {
      action: Decision.RAISE,
      raiseAmount: clampedRaise,
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

  private buildPrompt(context: DecisionContext): string {
    const seat = context.tableState.seats[context.mySeatIndex];
    const raiseBounds = getRaiseBounds(context);
    const summary = {
      stage: gameStateToLabel(context.tableState.gameState),
      handId: context.tableState.currentHandId.toString(),
      mySeatIndex: context.mySeatIndex,
      canCheck: context.canCheck,
      amountToCall: context.amountToCall.toString(),
      stack: seat.stack.toString(),
      myCurrentBet: seat.currentBet.toString(),
      tableCurrentBet: context.tableState.hand.currentBet.toString(),
      pot: context.tableState.hand.pot.toString(),
      bigBlind: context.tableState.bigBlind.toString(),
      holeCards: formatHoleCards(context.holeCards),
      raise: {
        canRaise: raiseBounds.canRaise,
        minRaiseTarget: raiseBounds.minRaiseTarget.toString(),
        maxRaiseTarget: raiseBounds.maxRaiseTarget.toString(),
      },
    };

    return [
      "You are a no-limit Texas Hold'em agent.",
      "Return exactly one compact JSON object and no extra text.",
      'Format: {"action":"fold|check|call|raise","raiseTarget":"<integer in chip units>"}',
      "Rules: never output an illegal action; if unsure choose check or call.",
      `Game context: ${JSON.stringify(summary)}`,
    ].join("\n");
  }
}

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
  const minRaiseTarget = context.tableState.hand.currentBet + context.tableState.bigBlind;
  const maxRaiseTarget = seat.currentBet + seat.stack;
  return {
    minRaiseTarget,
    maxRaiseTarget,
    canRaise: maxRaiseTarget > minRaiseTarget,
  };
}

function formatHoleCards(cards: HoleCards | null): string[] {
  if (!cards) return [];
  return [cards.card1.toString(), cards.card2.toString()];
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
