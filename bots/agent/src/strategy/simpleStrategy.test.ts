// Tests for simple strategy

import { test, describe } from "node:test";
import assert from "node:assert";
import { SimpleStrategy, scoreHoleCards, cardName, getRank, getSuit } from "./simpleStrategy.js";
import { Decision, type DecisionContext, type HoleCards } from "./types.js";
import { GameState, type TableState } from "../chain/client.js";

// Helper to create a minimal table state for testing
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
      },
      {
        owner: "0x2222222222222222222222222222222222222222",
        operator: "0x2222222222222222222222222222222222222222",
        stack: 1000n,
        isActive: true,
        currentBet: 10n,
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

function createContext(
  overrides: Partial<DecisionContext> = {}
): DecisionContext {
  return {
    tableState: createTableState(),
    mySeatIndex: 0,
    holeCards: null,
    canCheck: false,
    amountToCall: 5n,
    ...overrides,
  };
}

describe("Card encoding", () => {
  test("getRank extracts rank correctly", () => {
    // Card 0 = 2 of spades, rank 0
    assert.strictEqual(getRank(0), 0);
    // Card 12 = A of spades, rank 12
    assert.strictEqual(getRank(12), 12);
    // Card 13 = 2 of hearts, rank 0
    assert.strictEqual(getRank(13), 0);
    // Card 51 = A of clubs, rank 12
    assert.strictEqual(getRank(51), 12);
  });

  test("getSuit extracts suit correctly", () => {
    // Cards 0-12 = spades (suit 0)
    assert.strictEqual(getSuit(0), 0);
    assert.strictEqual(getSuit(12), 0);
    // Cards 13-25 = hearts (suit 1)
    assert.strictEqual(getSuit(13), 1);
    assert.strictEqual(getSuit(25), 1);
    // Cards 26-38 = diamonds (suit 2)
    assert.strictEqual(getSuit(26), 2);
    // Cards 39-51 = clubs (suit 3)
    assert.strictEqual(getSuit(51), 3);
  });

  test("cardName formats correctly", () => {
    assert.strictEqual(cardName(0), "2s"); // 2 of spades
    assert.strictEqual(cardName(12), "As"); // Ace of spades
    assert.strictEqual(cardName(13), "2h"); // 2 of hearts
    assert.strictEqual(cardName(25), "Ah"); // Ace of hearts
    assert.strictEqual(cardName(51), "Ac"); // Ace of clubs
  });
});

describe("scoreHoleCards", () => {
  test("AA scores highest (100)", () => {
    // Two aces (different suits)
    const score = scoreHoleCards({ card1: 12, card2: 25 }); // As, Ah
    assert.strictEqual(score, 100);
  });

  test("KK scores very high (90+)", () => {
    const score = scoreHoleCards({ card1: 11, card2: 24 }); // Ks, Kh
    assert.ok(score >= 90, `KK score ${score} should be >= 90`);
  });

  test("22 scores as small pair (50+)", () => {
    const score = scoreHoleCards({ card1: 0, card2: 13 }); // 2s, 2h
    assert.ok(score >= 50, `22 score ${score} should be >= 50`);
    assert.ok(score < 60, `22 score ${score} should be < 60`);
  });

  test("AKs scores well (suited broadway)", () => {
    const score = scoreHoleCards({ card1: 12, card2: 11 }); // As, Ks (suited)
    assert.ok(score >= 50, `AKs score ${score} should be >= 50`);
  });

  test("72o scores poorly", () => {
    const score = scoreHoleCards({ card1: 5, card2: 13 }); // 7s, 2h (offsuit)
    assert.ok(score < 30, `72o score ${score} should be < 30`);
  });

  test("suited cards score higher than offsuit", () => {
    const suited = scoreHoleCards({ card1: 8, card2: 7 }); // Ts, 9s
    const offsuit = scoreHoleCards({ card1: 8, card2: 20 }); // Ts, 9h
    assert.ok(suited > offsuit, `Suited ${suited} should be > offsuit ${offsuit}`);
  });
});

describe("SimpleStrategy", () => {
  const strategy = new SimpleStrategy(0.0); // No aggression for predictable tests

  test("checks when can check and no hole cards", () => {
    const ctx = createContext({ canCheck: true, amountToCall: 0n });
    const decision = strategy.decide(ctx);
    assert.strictEqual(decision.action, Decision.CHECK);
  });

  test("calls small bet without hole cards", () => {
    const ctx = createContext({ canCheck: false, amountToCall: 10n });
    const decision = strategy.decide(ctx);
    assert.strictEqual(decision.action, Decision.CALL);
  });

  test("folds to large bet without hole cards", () => {
    const ctx = createContext({ canCheck: false, amountToCall: 100n });
    const decision = strategy.decide(ctx);
    assert.strictEqual(decision.action, Decision.FOLD);
  });

  test("checks with weak hand when free", () => {
    const ctx = createContext({
      canCheck: true,
      amountToCall: 0n,
      holeCards: { card1: 5, card2: 13 }, // 72o
    });
    const decision = strategy.decide(ctx);
    assert.strictEqual(decision.action, Decision.CHECK);
  });

  test("calls with strong hand", () => {
    const ctx = createContext({
      canCheck: false,
      amountToCall: 10n,
      holeCards: { card1: 12, card2: 25 }, // AA
    });
    const decision = strategy.decide(ctx);
    // AA should call or raise, not fold
    assert.notStrictEqual(decision.action, Decision.FOLD);
  });

  test("folds weak hand to big bet", () => {
    const ctx = createContext({
      canCheck: false,
      amountToCall: 100n,
      holeCards: { card1: 0, card2: 14 }, // 2s, 3h (very weak)
    });
    const decision = strategy.decide(ctx);
    assert.strictEqual(decision.action, Decision.FOLD);
  });

  test("calls medium hand with good pot odds", () => {
    const tableState = createTableState({
      hand: {
        handId: 1n,
        pot: 100n, // Large pot
        currentBet: 20n,
        actorSeat: 0,
        state: GameState.BETTING_PRE,
      },
    });
    const ctx = createContext({
      tableState,
      canCheck: false,
      amountToCall: 15n,
      holeCards: { card1: 9, card2: 22 }, // Js, Jh - medium pair
    });
    const decision = strategy.decide(ctx);
    assert.strictEqual(decision.action, Decision.CALL);
  });
});

describe("SimpleStrategy with aggression", () => {
  // Use high aggression and mock random to always be aggressive
  const originalRandom = Math.random;

  test("raises with strong hand when aggressive", () => {
    // Mock Math.random to always return 0 (trigger aggression)
    Math.random = () => 0;

    const strategy = new SimpleStrategy(1.0); // Full aggression
    const tableState = createTableState({
      seats: [
        {
          owner: "0x1111111111111111111111111111111111111111",
          operator: "0x1111111111111111111111111111111111111111",
          stack: 1000n,
          isActive: true,
          currentBet: 0n,
        },
        {
          owner: "0x2222222222222222222222222222222222222222",
          operator: "0x2222222222222222222222222222222222222222",
          stack: 1000n,
          isActive: true,
          currentBet: 0n,
        },
      ],
      hand: {
        handId: 1n,
        pot: 15n,
        currentBet: 0n,
        actorSeat: 0,
        state: GameState.BETTING_FLOP,
      },
    });

    const ctx = createContext({
      tableState,
      canCheck: true,
      amountToCall: 0n,
      holeCards: { card1: 12, card2: 25 }, // AA
    });

    const decision = strategy.decide(ctx);
    // With AA and full aggression + random=0, should raise
    assert.strictEqual(decision.action, Decision.RAISE);
    assert.ok(decision.raiseAmount !== undefined, "Should have raise amount");
    assert.ok(decision.raiseAmount! > 0n, "Raise amount should be positive");

    // Restore Math.random
    Math.random = originalRandom;
  });
});
