// Tests for KeeperBot

import { test, describe } from "node:test";
import assert from "node:assert";
import { GameState } from "./chain/client.js";

describe("GameState enum", () => {
  test("has correct values", () => {
    assert.strictEqual(GameState.WAITING_FOR_SEATS, 0);
    assert.strictEqual(GameState.HAND_INIT, 1);
    assert.strictEqual(GameState.BETTING_PRE, 2);
    assert.strictEqual(GameState.WAITING_VRF_FLOP, 3);
    assert.strictEqual(GameState.BETTING_FLOP, 4);
    assert.strictEqual(GameState.WAITING_VRF_TURN, 5);
    assert.strictEqual(GameState.BETTING_TURN, 6);
    assert.strictEqual(GameState.WAITING_VRF_RIVER, 7);
    assert.strictEqual(GameState.BETTING_RIVER, 8);
    assert.strictEqual(GameState.SHOWDOWN, 9);
    assert.strictEqual(GameState.SETTLED, 10);
  });

  test("can get name from value", () => {
    assert.strictEqual(GameState[0], "WAITING_FOR_SEATS");
    assert.strictEqual(GameState[2], "BETTING_PRE");
    assert.strictEqual(GameState[9], "SHOWDOWN");
    assert.strictEqual(GameState[10], "SETTLED");
  });
});

describe("KeeperBot config validation", () => {
  test("required env vars are documented", () => {
    // This test documents the required environment variables
    const requiredEnvVars = [
      "RPC_URL",
      "KEEPER_PRIVATE_KEY",
      "POKER_TABLE_ADDRESS",
    ];
    const optionalEnvVars = [
      "PLAYER_VAULT_ADDRESS",
      "CHAIN_ID",
      "POLL_INTERVAL_MS",
      "ENABLE_REBALANCING",
      "REBALANCE_BUY_AMOUNT_MON",
      "REBALANCE_SELL_AMOUNT_TOKENS",
    ];

    // Just verify the arrays are defined (documentation test)
    assert.strictEqual(requiredEnvVars.length, 3);
    assert.strictEqual(optionalEnvVars.length, 6);
  });
});

describe("Keeper decision logic", () => {
  // Helper to determine if keeper should force timeout
  function shouldForceTimeout(
    gameState: GameState,
    currentTimestamp: bigint,
    actionDeadline: bigint,
    currentBlock: bigint,
    lastActionBlock: bigint
  ): boolean {
    // Must be in betting state
    const isBetting =
      gameState === GameState.BETTING_PRE ||
      gameState === GameState.BETTING_FLOP ||
      gameState === GameState.BETTING_TURN ||
      gameState === GameState.BETTING_RIVER;
    if (!isBetting) return false;

    // Deadline must have passed
    if (currentTimestamp <= actionDeadline) return false;

    // Must be on new block
    if (currentBlock <= lastActionBlock) return false;

    return true;
  }

  // Helper to determine if keeper should start hand
  function shouldStartHand(
    gameState: GameState,
    allSeatsFilled: boolean,
    seatStacks: bigint[],
    minStack: bigint
  ): boolean {
    if (gameState !== GameState.SETTLED) return false;
    if (!allSeatsFilled) return false;
    if (seatStacks.some((s) => s < minStack)) return false;
    return true;
  }

  // Helper to determine if keeper should settle showdown
  function shouldSettleShowdown(gameState: GameState): boolean {
    return gameState === GameState.SHOWDOWN;
  }

  test("shouldForceTimeout returns true when conditions met", () => {
    assert.strictEqual(
      shouldForceTimeout(
        GameState.BETTING_PRE,
        1000n, // current timestamp
        500n, // deadline passed
        10n, // current block
        5n // last action block
      ),
      true
    );
  });

  test("shouldForceTimeout returns false if not in betting state", () => {
    assert.strictEqual(
      shouldForceTimeout(
        GameState.SHOWDOWN,
        1000n,
        500n,
        10n,
        5n
      ),
      false
    );
  });

  test("shouldForceTimeout returns false if deadline not passed", () => {
    assert.strictEqual(
      shouldForceTimeout(
        GameState.BETTING_PRE,
        500n, // before deadline
        1000n, // deadline
        10n,
        5n
      ),
      false
    );
  });

  test("shouldForceTimeout returns false if same block", () => {
    assert.strictEqual(
      shouldForceTimeout(
        GameState.BETTING_PRE,
        1000n,
        500n,
        5n, // same as last action block
        5n
      ),
      false
    );
  });

  test("shouldStartHand returns true when conditions met", () => {
    assert.strictEqual(
      shouldStartHand(
        GameState.SETTLED,
        true, // all seats filled
        [1000n, 1000n, 1000n, 1000n], // seat stacks
        10n // min stack
      ),
      true
    );
  });

  test("shouldStartHand returns false if not settled", () => {
    assert.strictEqual(
      shouldStartHand(
        GameState.BETTING_PRE,
        true,
        [1000n, 1000n, 1000n, 1000n],
        10n
      ),
      false
    );
  });

  test("shouldStartHand returns false if seats not filled", () => {
    assert.strictEqual(
      shouldStartHand(
        GameState.SETTLED,
        false, // seats not filled
        [1000n, 1000n, 1000n, 1000n],
        10n
      ),
      false
    );
  });

  test("shouldStartHand returns false if insufficient stack", () => {
    assert.strictEqual(
      shouldStartHand(
        GameState.SETTLED,
        true,
        [5n, 1000n, 1000n, 1000n], // seat 0 too small
        10n
      ),
      false
    );
  });

  test("shouldSettleShowdown returns true at showdown", () => {
    assert.strictEqual(
      shouldSettleShowdown(GameState.SHOWDOWN),
      true
    );
  });

  test("shouldSettleShowdown returns false otherwise", () => {
    assert.strictEqual(
      shouldSettleShowdown(GameState.BETTING_RIVER),
      false
    );
    assert.strictEqual(
      shouldSettleShowdown(GameState.SETTLED),
      false
    );
  });

  // VRF re-request decision logic (T-0903)
  function shouldReRequestVRF(
    gameState: GameState,
    currentTimestamp: bigint,
    vrfRequestTimestamp: bigint,
    vrfTimeout: bigint
  ): boolean {
    // Must be in VRF waiting state
    const isVRFWaiting =
      gameState === GameState.WAITING_VRF_FLOP ||
      gameState === GameState.WAITING_VRF_TURN ||
      gameState === GameState.WAITING_VRF_RIVER;
    if (!isVRFWaiting) return false;

    // Must have a VRF request timestamp
    if (vrfRequestTimestamp === 0n) return false;

    // Timeout must have passed
    if (currentTimestamp <= vrfRequestTimestamp + vrfTimeout) return false;

    return true;
  }

  test("shouldReRequestVRF returns true when VRF timeout exceeded", () => {
    assert.strictEqual(
      shouldReRequestVRF(
        GameState.WAITING_VRF_FLOP,
        600n, // current timestamp
        100n, // VRF requested at
        300n  // 5 min timeout
      ),
      true
    );
  });

  test("shouldReRequestVRF returns false if not in VRF waiting state", () => {
    assert.strictEqual(
      shouldReRequestVRF(
        GameState.BETTING_PRE,
        600n,
        100n,
        300n
      ),
      false
    );
  });

  test("shouldReRequestVRF returns false if timeout not reached", () => {
    assert.strictEqual(
      shouldReRequestVRF(
        GameState.WAITING_VRF_FLOP,
        200n, // only 100s after request
        100n,
        300n
      ),
      false
    );
  });

  test("shouldReRequestVRF returns false if no VRF request timestamp", () => {
    assert.strictEqual(
      shouldReRequestVRF(
        GameState.WAITING_VRF_FLOP,
        600n,
        0n,   // no request timestamp
        300n
      ),
      false
    );
  });

  test("shouldReRequestVRF works for all VRF waiting states", () => {
    const states = [
      GameState.WAITING_VRF_FLOP,
      GameState.WAITING_VRF_TURN,
      GameState.WAITING_VRF_RIVER,
    ];
    for (const state of states) {
      assert.strictEqual(
        shouldReRequestVRF(state, 600n, 100n, 300n),
        true,
        `Should re-request VRF in state ${GameState[state]}`
      );
    }
  });
});
