import { describe, test } from "node:test";
import assert from "node:assert";
import { GeminiStrategy, parseGeminiDecision } from "./geminiStrategy.js";
import { Decision, type ActionDecision, type DecisionContext, type Strategy } from "./types.js";
import { GameState, type TableState } from "../chain/client.js";

function createTableState(overrides: Partial<TableState> = {}): TableState {
  return {
    tableId: 1n,
    smallBlind: 5n,
    bigBlind: 10n,
    actionTimeout: 1800n,
    gameState: GameState.BETTING_PRE,
    currentHandId: 1n,
    buttonSeat: 0,
    actionDeadline: BigInt(Math.floor(Date.now() / 1000) + 1800),
    lastActionBlock: 0n,
    seats: [
      {
        owner: "0x1111111111111111111111111111111111111111",
        operator: "0x1111111111111111111111111111111111111111",
        stack: 1000n,
        isActive: true,
        currentBet: 5n,
        isAllIn: false,
        totalHandBet: 5n,
      },
      {
        owner: "0x2222222222222222222222222222222222222222",
        operator: "0x2222222222222222222222222222222222222222",
        stack: 1000n,
        isActive: true,
        currentBet: 10n,
        isAllIn: false,
        totalHandBet: 10n,
      },
    ],
    hand: {
      handId: 1n,
      pot: 15n,
      currentBet: 10n,
      actorSeat: 0,
      state: GameState.BETTING_PRE,
    },
    communityCards: [255, 255, 255, 255, 255],
    ...overrides,
  };
}

function createContext(overrides: Partial<DecisionContext> = {}): DecisionContext {
  return {
    tableState: createTableState(),
    mySeatIndex: 0,
    holeCards: { card1: 12, card2: 25 },
    canCheck: false,
    amountToCall: 5n,
    ...overrides,
  };
}

class StaticStrategy implements Strategy {
  private readonly decision: ActionDecision;

  constructor(decision: ActionDecision) {
    this.decision = decision;
  }

  decide(): ActionDecision {
    return this.decision;
  }
}

describe("parseGeminiDecision", () => {
  test("parses plain JSON", () => {
    const parsed = parseGeminiDecision('{"action":"call"}');
    assert.deepStrictEqual(parsed, { action: "call" });
  });

  test("parses JSON wrapped with markdown fence", () => {
    const parsed = parseGeminiDecision('```json\n{"action":"check"}\n```');
    assert.deepStrictEqual(parsed, { action: "check" });
  });

  test("parses JSON with reasoning and factors", () => {
    const raw = JSON.stringify({
      action: "raise",
      raiseTarget: "200",
      reasoning: "Strong hand — top pair with best kicker. Value bet for thin value.",
      factors: {
        handStrength: "top pair, ace kicker",
        potOdds: "25% — favorable",
        position: "BTN — positional advantage",
        opponentRead: "Seat 1 is tight (fold 70%), likely weak range",
        sizing: "65% pot — standard value bet",
        riskAssessment: "low risk — dry board",
      },
    });
    const parsed = parseGeminiDecision(raw);
    assert.ok(parsed !== null);
    assert.strictEqual(parsed!.action, "raise");
    assert.strictEqual(typeof parsed!.reasoning, "string");
    assert.ok(typeof parsed!.factors === "object" && parsed!.factors !== null);
  });
});

describe("GeminiStrategy", () => {
  test("falls back to provided strategy when fetch fails", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error("network down");
    }) as typeof fetch;

    try {
      const fallback = new StaticStrategy({ action: Decision.FOLD });
      const strategy = new GeminiStrategy({
        apiKey: "test-key",
        fallbackStrategy: fallback,
      });

      const decision = await strategy.decide(createContext());
      assert.strictEqual(decision.action, Decision.FOLD);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("clamps raise target to legal minimum", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"action":"raise","raiseTarget":"1"}' }],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )) as typeof fetch;

    try {
      const strategy = new GeminiStrategy({
        apiKey: "test-key",
      });

      const decision = await strategy.decide(createContext());
      assert.strictEqual(decision.action, Decision.RAISE);
      assert.strictEqual(decision.raiseAmount, 20n);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("downgrades illegal check to call when facing a bet", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: '{"action":"check"}' }],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        }
      )) as typeof fetch;

    try {
      const strategy = new GeminiStrategy({
        apiKey: "test-key",
      });
      const decision = await strategy.decide(createContext({ canCheck: false, amountToCall: 5n }));
      assert.strictEqual(decision.action, Decision.CALL);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("includes reasoning and factors from Gemini response", async () => {
    const previousFetch = globalThis.fetch;
    const responseText = JSON.stringify({
      action: "call",
      reasoning: "Pot odds are favorable at 25%, calling is correct.",
      factors: {
        handStrength: "top pair",
        potOdds: "25% — favorable",
        position: "BTN",
        opponentRead: "tight player",
        sizing: "small bet",
        riskAssessment: "low risk",
      },
    });
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: responseText }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    try {
      const strategy = new GeminiStrategy({ apiKey: "test-key" });
      const decision = await strategy.decide(createContext({ canCheck: false, amountToCall: 5n }));
      assert.strictEqual(decision.action, Decision.CALL);
      assert.strictEqual(decision.reasoning, "Pot odds are favorable at 25%, calling is correct.");
      assert.ok(decision.factors !== undefined, "factors should be defined");
      assert.strictEqual(decision.factors!.handStrength, "top pair");
      assert.strictEqual(decision.factors!.potOdds, "25% — favorable");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("action decision is normal even when reasoning/factors are missing", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"action":"fold"}' }] } }],
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )) as typeof fetch;

    try {
      const strategy = new GeminiStrategy({ apiKey: "test-key" });
      const decision = await strategy.decide(createContext({ canCheck: false, amountToCall: 5n }));
      // fold while not canCheck → fold
      assert.strictEqual(decision.action, Decision.FOLD);
      // reasoning/factors may be undefined — no crash
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  test("fallback reasoning is set when Gemini fails", async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("timeout"); }) as typeof fetch;

    try {
      const strategy = new GeminiStrategy({ apiKey: "test-key" });
      const decision = await strategy.decide(createContext());
      assert.ok(typeof decision.reasoning === "string", "fallback reasoning should be a string");
      assert.ok(decision.reasoning!.includes("Fallback:"), "fallback reasoning should start with Fallback:");
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
