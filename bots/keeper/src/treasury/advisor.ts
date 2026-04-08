// TreasuryAdvisor — AI-driven rebalancing recommendation using Gemini API.
// Falls back to rule-based logic if the API fails.

import { createLogger } from "@playerco/shared";
import type { RebalanceContext, RebalanceRecommendation } from "./types.js";

const logger = createLogger({ service: "keeper-bot:treasury" });

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.0-flash";
const DEFAULT_TIMEOUT_MS = 8000;

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
}

interface RawRecommendation {
  action?: unknown;
  amountBps?: unknown;
  reasoning?: unknown;
  confidence?: unknown;
  factors?: unknown;
}

export interface TreasuryAdvisorConfig {
  apiKey: string;
  model?: string;
  timeoutMs?: number;
  endpointBaseUrl?: string;
}

export class TreasuryAdvisor {
  private apiKey: string;
  private model: string;
  private timeoutMs: number;
  private endpointBaseUrl: string;

  constructor(config: TreasuryAdvisorConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_MODEL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.endpointBaseUrl = config.endpointBaseUrl ?? GEMINI_BASE_URL;
  }

  /**
   * Recommend a rebalancing action for the current treasury state.
   * Always satisfies accretive-only constraints:
   *   - buy only when tokenMarketPrice < navPerShare
   *   - sell only when tokenMarketPrice > navPerShare
   */
  async recommend(ctx: RebalanceContext): Promise<RebalanceRecommendation> {
    try {
      const raw = await this.callGemini(ctx);
      const rec = this.sanitize(raw, ctx);
      // Enforce accretive-only constraint before returning
      return this.enforceAccretiveConstraint(rec, ctx);
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err) }, "TreasuryAdvisor Gemini call failed — using rule-based fallback");
      return this.ruleBased(ctx);
    }
  }

  // ─── Private ────────────────────────────────────────────────────────────────

  private async callGemini(ctx: RebalanceContext): Promise<RawRecommendation> {
    const prompt = this.buildPrompt(ctx);
    const url = `${this.endpointBaseUrl}/models/${encodeURIComponent(this.model)}:generateContent`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

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
            temperature: 0.1,
            responseMimeType: "application/json",
            maxOutputTokens: 300,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Gemini API ${response.status}: ${text}`);
      }

      const payload = (await response.json()) as GeminiGenerateContentResponse;
      const text = payload.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini response missing text");

      // Extract first JSON object
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON object in Gemini response");
      return JSON.parse(match[0]) as RawRecommendation;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildPrompt(ctx: RebalanceContext): string {
    const navStr = formatBigInt(ctx.navPerShare);
    const priceStr = formatBigInt(ctx.tokenMarketPrice);
    const assetsStr = formatBigInt(ctx.externalAssets);
    const pnlStr = ctx.recentPnl >= 0n ? `+${ctx.recentPnl}` : String(ctx.recentPnl);
    const discount = ctx.navPerShare > 0n
      ? Number((ctx.navPerShare - ctx.tokenMarketPrice) * 100n / ctx.navPerShare)
      : 0;

    return [
      "You are a DeFi treasury management AI for a poker agent company.",
      "Analyze the current treasury state and recommend a rebalancing action.",
      "",
      "CRITICAL CONSTRAINT (accretive-only):",
      "  - buy: ONLY if tokenMarketPrice < navPerShare (buying at discount is accretive)",
      "  - sell: ONLY if tokenMarketPrice > navPerShare (selling at premium is accretive)",
      "  - If neither condition holds, recommend skip.",
      "",
      `Treasury state: ${JSON.stringify({
        navPerShare: navStr,
        tokenMarketPrice: priceStr,
        discountPercent: discount,
        externalAssets: assetsStr,
        recentPnl: pnlStr,
        tokenStage: ctx.tokenStage,
        rebalanceMaxMonBps: ctx.rebalanceMaxMonBps,
        rebalanceMaxTokenBps: ctx.rebalanceMaxTokenBps,
      })}`,
      "",
      "Consider: NAV vs market price gap, recent PnL trend, token liquidity stage.",
      "For bonding-curve stage, be conservative (lower amountBps). For graduated DEX, be more aggressive.",
      "",
      'Return exactly: {"action":"buy|sell|skip","amountBps":<0-500>,"reasoning":"<1-2 sentences>","confidence":<0.0-1.0>,"factors":{"navVsMarket":"...","pnlTrend":"...","sizeJustification":"..."}}',
    ].join("\n");
  }

  private sanitize(raw: RawRecommendation, ctx: RebalanceContext): RebalanceRecommendation {
    const action = typeof raw.action === "string" && ["buy", "sell", "skip"].includes(raw.action)
      ? (raw.action as "buy" | "sell" | "skip")
      : "skip";

    const rawBps = typeof raw.amountBps === "number" ? raw.amountBps : 0;
    const maxBps = action === "buy" ? ctx.rebalanceMaxMonBps : ctx.rebalanceMaxTokenBps;
    const amountBps = Math.max(0, Math.min(maxBps, rawBps));

    const reasoning = typeof raw.reasoning === "string" && raw.reasoning.trim()
      ? raw.reasoning.trim()
      : `${action} recommended by AI analysis.`;

    const confidence = typeof raw.confidence === "number"
      ? Math.max(0, Math.min(1, raw.confidence))
      : 0.5;

    const rawFactors = raw.factors && typeof raw.factors === "object" ? raw.factors as Record<string, unknown> : {};

    return {
      action,
      amountBps,
      reasoning,
      confidence,
      factors: {
        navVsMarket: typeof rawFactors.navVsMarket === "string" ? rawFactors.navVsMarket : describeNavVsMarket(ctx),
        pnlTrend: typeof rawFactors.pnlTrend === "string" ? rawFactors.pnlTrend : describePnlTrend(ctx),
        sizeJustification: typeof rawFactors.sizeJustification === "string" ? rawFactors.sizeJustification : `${amountBps}bps — within limits`,
      },
    };
  }

  /**
   * Enforce accretive-only constraint: if the AI recommends violating it, override to skip.
   */
  private enforceAccretiveConstraint(
    rec: RebalanceRecommendation,
    ctx: RebalanceContext
  ): RebalanceRecommendation {
    if (rec.action === "buy" && ctx.tokenMarketPrice >= ctx.navPerShare) {
      logger.warn({ action: "buy", nav: String(ctx.navPerShare), price: String(ctx.tokenMarketPrice) }, "TreasuryAdvisor: buy overridden to skip — price >= NAV (accretive constraint)");
      return {
        action: "skip",
        amountBps: 0,
        reasoning: "Buy skipped: market price is not below NAV — accretive constraint requires buy price < NAV.",
        confidence: 1.0,
        factors: rec.factors,
      };
    }
    if (rec.action === "sell" && ctx.tokenMarketPrice <= ctx.navPerShare) {
      logger.warn({ action: "sell", nav: String(ctx.navPerShare), price: String(ctx.tokenMarketPrice) }, "TreasuryAdvisor: sell overridden to skip — price <= NAV (accretive constraint)");
      return {
        action: "skip",
        amountBps: 0,
        reasoning: "Sell skipped: market price is not above NAV — accretive constraint requires sell price > NAV.",
        confidence: 1.0,
        factors: rec.factors,
      };
    }
    return rec;
  }

  /**
   * Rule-based fallback when Gemini is unavailable.
   *   - buy 100bps if tokenMarketPrice < navPerShare * 95 / 100 (5% discount)
   *   - sell 100bps if tokenMarketPrice > navPerShare * 105 / 100 (5% premium)
   *   - else skip
   */
  private ruleBased(ctx: RebalanceContext): RebalanceRecommendation {
    const buyThreshold = ctx.navPerShare * 95n / 100n;
    const sellThreshold = ctx.navPerShare * 105n / 100n;

    if (ctx.tokenMarketPrice < buyThreshold && ctx.externalAssets > 0n && ctx.rebalanceMaxMonBps > 0) {
      const amountBps = Math.min(100, ctx.rebalanceMaxMonBps);
      return {
        action: "buy",
        amountBps,
        reasoning: `Rule-based: market price ${formatBigInt(ctx.tokenMarketPrice)} is >5% below NAV ${formatBigInt(ctx.navPerShare)}. Buying ${amountBps}bps of external assets.`,
        confidence: 0.7,
        factors: {
          navVsMarket: describeNavVsMarket(ctx),
          pnlTrend: describePnlTrend(ctx),
          sizeJustification: `${amountBps}bps — rule-based conservative`,
        },
      };
    }

    if (ctx.tokenMarketPrice > sellThreshold && ctx.treasuryShares > 0n && ctx.rebalanceMaxTokenBps > 0) {
      const amountBps = Math.min(100, ctx.rebalanceMaxTokenBps);
      return {
        action: "sell",
        amountBps,
        reasoning: `Rule-based: market price ${formatBigInt(ctx.tokenMarketPrice)} is >5% above NAV ${formatBigInt(ctx.navPerShare)}. Selling ${amountBps}bps of treasury shares.`,
        confidence: 0.7,
        factors: {
          navVsMarket: describeNavVsMarket(ctx),
          pnlTrend: describePnlTrend(ctx),
          sizeJustification: `${amountBps}bps — rule-based conservative`,
        },
      };
    }

    return {
      action: "skip",
      amountBps: 0,
      reasoning: "Rule-based: no significant price divergence from NAV (within 5% band). Skipping rebalancing.",
      confidence: 0.8,
      factors: {
        navVsMarket: describeNavVsMarket(ctx),
        pnlTrend: describePnlTrend(ctx),
        sizeJustification: "0bps — within NAV band, no action needed",
      },
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBigInt(value: bigint): string {
  // Show as decimal with 4 implied decimal places (assuming 18-decimal token scaled to wei)
  // For display in reasoning text, just show the raw value.
  return value.toString();
}

function describeNavVsMarket(ctx: RebalanceContext): string {
  if (ctx.navPerShare === 0n) return "NAV unavailable";
  const diff = ctx.navPerShare - ctx.tokenMarketPrice;
  const pct = Number(diff * 100n / ctx.navPerShare);
  if (pct > 0) return `NAV ${ctx.navPerShare} vs market ${ctx.tokenMarketPrice} — ${pct}% discount`;
  if (pct < 0) return `NAV ${ctx.navPerShare} vs market ${ctx.tokenMarketPrice} — ${Math.abs(pct)}% premium`;
  return `NAV ${ctx.navPerShare} equals market price`;
}

function describePnlTrend(ctx: RebalanceContext): string {
  const pnlSign = ctx.recentPnl >= 0n ? "positive" : "negative";
  return `${pnlSign} hand PnL ${ctx.recentPnl >= 0n ? "+" : ""}${ctx.recentPnl}; cumulative ${ctx.cumulativePnl >= 0n ? "+" : ""}${ctx.cumulativePnl}`;
}
