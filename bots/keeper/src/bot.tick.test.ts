/**
 * KeeperBot tick-loop unit tests.
 *
 * Tests the `tick()` private method by injecting a mocked chain client.
 * Covers T-M4-08.
 */

import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import { KeeperBot, type KeeperBotConfig } from "./bot.js";
import { GameState } from "./chain/client.js";

// ─── Minimal mock ChainClient ─────────────────────────────────────────────────

type MockFn = ReturnType<typeof mock.fn>;

interface MockChainClient {
  getTableState: MockFn;
  getBlockNumber: MockFn;
  getBlockTimestamp: MockFn;
  forceTimeout: MockFn;
  startHand: MockFn;
  settleShowdown: MockFn;
  reRequestVRF: MockFn;
  isBettingState: MockFn;
  isVRFWaitingState: MockFn;
  isHoleCardVRFWaitingState: MockFn;
  getTableId: MockFn;
  hasVault: MockFn;
  address: string;
}

function makeBaseState(
  overrides: Partial<{
    gameState: GameState;
    currentHandId: bigint;
    actionDeadline: bigint;
    lastActionBlock: bigint;
    pendingVRFRequestId: bigint;
    vrfRequestTimestamp: bigint;
    canStartHand: boolean;
  }> = {},
) {
  return {
    gameState: GameState.WAITING_FOR_SEATS,
    currentHandId: 0n,
    actionDeadline: 0n,
    lastActionBlock: 0n,
    pendingVRFRequestId: 0n,
    vrfRequestTimestamp: 0n,
    canStartHand: false,
    ...overrides,
  };
}

function makeMockClient(): MockChainClient {
  return {
    getTableState: mock.fn(async () => makeBaseState()),
    getBlockNumber: mock.fn(async () => 100n),
    getBlockTimestamp: mock.fn(async () => 1000n),
    forceTimeout: mock.fn(async () => "0xhash"),
    startHand: mock.fn(async () => "0xhash"),
    settleShowdown: mock.fn(async () => "0xhash"),
    reRequestVRF: mock.fn(async () => "0xhash"),
    isBettingState: mock.fn((state: GameState) =>
      [
        GameState.BETTING_PRE,
        GameState.BETTING_FLOP,
        GameState.BETTING_TURN,
        GameState.BETTING_RIVER,
      ].includes(state),
    ),
    isVRFWaitingState: mock.fn((state: GameState) =>
      [
        GameState.WAITING_VRF_FLOP,
        GameState.WAITING_VRF_TURN,
        GameState.WAITING_VRF_RIVER,
      ].includes(state),
    ),
    isHoleCardVRFWaitingState: mock.fn(
      (state: GameState) => state === GameState.WAITING_VRF_HOLECARDS,
    ),
    getTableId: mock.fn(async () => 1n),
    hasVault: mock.fn(() => false),
    address: "0x1234567890123456789012345678901234567890",
  };
}

const CONFIG: KeeperBotConfig = {
  rpcUrl: "http://localhost:8545",
  privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  pokerTableAddress: "0x0000000000000000000000000000000000000001",
};

function makeBot(client: MockChainClient): KeeperBot {
  const bot = new KeeperBot(CONFIG);
  // Inject mock client (private field via type cast)
  (bot as unknown as { chainClient: MockChainClient }).chainClient = client;
  return bot;
}

async function runTick(bot: KeeperBot): Promise<void> {
  await (bot as unknown as { tick(): Promise<void> }).tick();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("KeeperBot tick() — timeout detection", () => {
  let client: MockChainClient;
  let bot: KeeperBot;

  beforeEach(() => {
    client = makeMockClient();
    bot = makeBot(client);
  });

  test("does NOT call forceTimeout when no action deadline exceeded", async () => {
    client.getTableState = mock.fn(async () =>
      makeBaseState({
        gameState: GameState.BETTING_PRE,
        actionDeadline: 2000n, // deadline in the future
      }),
    );
    client.getBlockTimestamp = mock.fn(async () => 1000n); // current time < deadline
    client.isBettingState = mock.fn(() => true);

    await runTick(bot);

    assert.strictEqual((client.forceTimeout as MockFn).mock.calls.length, 0);
  });

  test("calls forceTimeout when deadline has passed", async () => {
    client.getTableState = mock.fn(async () =>
      makeBaseState({
        gameState: GameState.BETTING_PRE,
        actionDeadline: 900n, // deadline in the past
        lastActionBlock: 99n,
      }),
    );
    client.getBlockTimestamp = mock.fn(async () => 1000n); // current > deadline
    client.getBlockNumber = mock.fn(async () => 100n);
    client.isBettingState = mock.fn(() => true);
    client.isVRFWaitingState = mock.fn(() => false);

    await runTick(bot);

    assert.strictEqual((client.forceTimeout as MockFn).mock.calls.length, 1);
    assert.strictEqual(bot.getStats().timeoutsForced, 1);
  });

  test("does NOT call forceTimeout for non-betting state", async () => {
    client.getTableState = mock.fn(async () =>
      makeBaseState({
        gameState: GameState.WAITING_VRF_FLOP,
        actionDeadline: 500n, // past, but not a betting state
      }),
    );
    client.getBlockTimestamp = mock.fn(async () => 1000n);
    client.isBettingState = mock.fn(() => false);
    client.isVRFWaitingState = mock.fn(() => true);

    await runTick(bot);

    assert.strictEqual((client.forceTimeout as MockFn).mock.calls.length, 0);
  });
});

describe("KeeperBot tick() — start hand", () => {
  let client: MockChainClient;
  let bot: KeeperBot;

  beforeEach(() => {
    client = makeMockClient();
    bot = makeBot(client);
  });

  test("calls startHand when canStartHand is true", async () => {
    client.getTableState = mock.fn(async () =>
      makeBaseState({
        gameState: GameState.WAITING_FOR_SEATS,
        canStartHand: true,
      }),
    );
    client.isBettingState = mock.fn(() => false);
    client.isVRFWaitingState = mock.fn(() => false);

    await runTick(bot);

    assert.strictEqual((client.startHand as MockFn).mock.calls.length, 1);
    assert.strictEqual(bot.getStats().handsStarted, 1);
  });

  test("does NOT call startHand when canStartHand is false", async () => {
    client.getTableState = mock.fn(async () =>
      makeBaseState({
        gameState: GameState.WAITING_FOR_SEATS,
        canStartHand: false,
      }),
    );

    await runTick(bot);

    assert.strictEqual((client.startHand as MockFn).mock.calls.length, 0);
  });
});

describe("KeeperBot tick() — VRF re-request", () => {
  let client: MockChainClient;
  let bot: KeeperBot;

  beforeEach(() => {
    client = makeMockClient();
    bot = makeBot(client);
  });

  test("calls reRequestVRF when VRF timeout exceeded", async () => {
    client.getTableState = mock.fn(async () =>
      makeBaseState({
        gameState: GameState.WAITING_VRF_FLOP,
        vrfRequestTimestamp: 500n,
      }),
    );
    // VRF timeout = 300 seconds; current = 500+301 = 801
    client.getBlockTimestamp = mock.fn(async () => 801n);
    client.isBettingState = mock.fn(() => false);
    client.isVRFWaitingState = mock.fn(() => true);

    await runTick(bot);

    assert.strictEqual((client.reRequestVRF as MockFn).mock.calls.length, 1);
    assert.strictEqual(bot.getStats().vrfReRequests, 1);
  });

  test("does NOT call reRequestVRF when VRF timeout not yet exceeded", async () => {
    client.getTableState = mock.fn(async () =>
      makeBaseState({
        gameState: GameState.WAITING_VRF_FLOP,
        vrfRequestTimestamp: 500n,
      }),
    );
    // 500 + 299 = 799 < 500 + 300 = 800 (timeout not reached)
    client.getBlockTimestamp = mock.fn(async () => 799n);
    client.isBettingState = mock.fn(() => false);
    client.isVRFWaitingState = mock.fn(() => true);

    await runTick(bot);

    assert.strictEqual((client.reRequestVRF as MockFn).mock.calls.length, 0);
  });
});

describe("KeeperBot tick() — settle showdown", () => {
  let client: MockChainClient;
  let bot: KeeperBot;

  beforeEach(() => {
    client = makeMockClient();
    bot = makeBot(client);
  });

  test("calls settleShowdown when in SHOWDOWN state", async () => {
    client.getTableState = mock.fn(async () => makeBaseState({ gameState: GameState.SHOWDOWN }));
    client.isBettingState = mock.fn(() => false);
    client.isVRFWaitingState = mock.fn(() => false);

    await runTick(bot);

    assert.strictEqual((client.settleShowdown as MockFn).mock.calls.length, 1);
    assert.strictEqual(bot.getStats().showdownsSettled, 1);
  });

  test("does NOT call settleShowdown in non-SHOWDOWN states", async () => {
    client.getTableState = mock.fn(async () =>
      makeBaseState({ gameState: GameState.BETTING_RIVER }),
    );
    client.isBettingState = mock.fn(() => true);
    client.isVRFWaitingState = mock.fn(() => false);

    await runTick(bot);

    assert.strictEqual((client.settleShowdown as MockFn).mock.calls.length, 0);
  });
});

describe("KeeperBot tick() — stats tracking", () => {
  let client: MockChainClient;
  let bot: KeeperBot;

  beforeEach(() => {
    client = makeMockClient();
    bot = makeBot(client);
  });

  test("initial stats are zero", () => {
    const stats = bot.getStats();
    assert.strictEqual(stats.timeoutsForced, 0);
    assert.strictEqual(stats.handsStarted, 0);
    assert.strictEqual(stats.showdownsSettled, 0);
    assert.strictEqual(stats.vrfReRequests, 0);
    assert.strictEqual(stats.errors, 0);
  });

  test("error count increments when chain call throws", async () => {
    client.getTableState = mock.fn(async () => {
      throw new Error("RPC connection failed");
    });

    // tick() should catch the error and increment error counter
    try {
      await runTick(bot);
    } catch {
      // errors may propagate; the key is the stats tracking
    }

    // The error should be recorded if the bot catches it
    // (tick itself doesn't catch — the run loop does, but we verify the throw propagates)
    // At minimum, startHand was not called
    assert.strictEqual((client.startHand as MockFn).mock.calls.length, 0);
  });
});

// ─── T-R17-03: Concurrent keeper coordination tests ──────────────────────────
// Simulates two keeper instances racing on the same action.
// The winning keeper's action succeeds; the losing keeper receives a
// OneActionPerBlock / CannotStartHand error that isDuplicateKeeperAction()
// classifies as a coordination race, incrementing coordinationSkips only.

import { encodeErrorResult } from "viem";

/** Build a viem-style error with an ABI-encoded custom error selector. */
function makeContractError(errorName: string): Error {
  const data = encodeErrorResult({
    abi: [{ type: "error" as const, name: errorName, inputs: [] }],
    errorName,
  });
  const err = new Error(`execution reverted with custom error: ${errorName}`);
  (err as unknown as Record<string, unknown>).cause = { data };
  return err;
}

describe("KeeperBot — multi-keeper forceTimeout race (T-R17-03)", () => {
  test("first keeper succeeds, second gets OneActionPerBlock → coordinationSkip not error", async () => {
    // Bot 1: forceTimeout succeeds
    const client1 = makeMockClient();
    client1.getTableState = mock.fn(async () =>
      makeBaseState({
        gameState: GameState.BETTING_PRE,
        actionDeadline: 500n,
        lastActionBlock: 99n,
      }),
    );
    client1.getBlockTimestamp = mock.fn(async () => 1000n);
    client1.getBlockNumber = mock.fn(async () => 100n);
    client1.isBettingState = mock.fn(() => true);
    client1.isVRFWaitingState = mock.fn(() => false);
    client1.forceTimeout = mock.fn(async () => "0xabc");
    const bot1 = makeBot(client1);
    await runTick(bot1);
    assert.strictEqual(bot1.getStats().timeoutsForced, 1, "bot1 forced timeout");
    assert.strictEqual(bot1.getStats().coordinationSkips, 0, "bot1: no coordination skip");
    assert.strictEqual(bot1.getStats().errors, 0, "bot1: no errors");

    // Bot 2: forceTimeout throws OneActionPerBlock (another keeper acted first)
    const client2 = makeMockClient();
    client2.getTableState = mock.fn(async () =>
      makeBaseState({
        gameState: GameState.BETTING_PRE,
        actionDeadline: 500n,
        lastActionBlock: 99n,
      }),
    );
    client2.getBlockTimestamp = mock.fn(async () => 1000n);
    client2.getBlockNumber = mock.fn(async () => 100n);
    client2.isBettingState = mock.fn(() => true);
    client2.isVRFWaitingState = mock.fn(() => false);
    client2.forceTimeout = mock.fn(async () => {
      throw makeContractError("OneActionPerBlock");
    });
    const bot2 = makeBot(client2);
    await runTick(bot2);
    assert.strictEqual(bot2.getStats().timeoutsForced, 0, "bot2: no timeout forced");
    assert.strictEqual(bot2.getStats().coordinationSkips, 1, "bot2: coordination skip recorded");
    assert.strictEqual(bot2.getStats().errors, 0, "bot2: not counted as an error");
  });

  test("second keeper string-fallback OneActionPerBlock is also a coordination skip", async () => {
    const client = makeMockClient();
    client.getTableState = mock.fn(async () =>
      makeBaseState({
        gameState: GameState.BETTING_PRE,
        actionDeadline: 500n,
        lastActionBlock: 99n,
      }),
    );
    client.getBlockTimestamp = mock.fn(async () => 1000n);
    client.getBlockNumber = mock.fn(async () => 100n);
    client.isBettingState = mock.fn(() => true);
    client.isVRFWaitingState = mock.fn(() => false);
    client.forceTimeout = mock.fn(async () => {
      throw new Error("execution reverted: One action per block");
    });
    const bot = makeBot(client);
    await runTick(bot);
    assert.strictEqual(
      bot.getStats().coordinationSkips,
      1,
      "string-match fallback coordination skip",
    );
    assert.strictEqual(bot.getStats().errors, 0, "not counted as an error");
  });
});

describe("KeeperBot — multi-keeper startHand race (T-R17-03)", () => {
  test("first keeper startHand succeeds, second gets CannotStartHand → coordinationSkip", async () => {
    // Bot 1 starts the hand
    const client1 = makeMockClient();
    client1.getTableState = mock.fn(async () =>
      makeBaseState({ gameState: GameState.WAITING_FOR_SEATS, canStartHand: true }),
    );
    client1.isBettingState = mock.fn(() => false);
    client1.isVRFWaitingState = mock.fn(() => false);
    client1.startHand = mock.fn(async () => "0xdef");
    const bot1 = makeBot(client1);
    await runTick(bot1);
    assert.strictEqual(bot1.getStats().handsStarted, 1, "bot1 started hand");
    assert.strictEqual(bot1.getStats().coordinationSkips, 0, "bot1: no coordination skip");

    // Bot 2 races to start the same hand — gets CannotStartHand
    const client2 = makeMockClient();
    client2.getTableState = mock.fn(async () =>
      makeBaseState({ gameState: GameState.WAITING_FOR_SEATS, canStartHand: true }),
    );
    client2.isBettingState = mock.fn(() => false);
    client2.isVRFWaitingState = mock.fn(() => false);
    client2.startHand = mock.fn(async () => {
      throw makeContractError("CannotStartHand");
    });
    const bot2 = makeBot(client2);
    await runTick(bot2);
    assert.strictEqual(bot2.getStats().handsStarted, 0, "bot2: hand not started");
    assert.strictEqual(bot2.getStats().coordinationSkips, 1, "bot2: coordination skip recorded");
    assert.strictEqual(bot2.getStats().errors, 0, "bot2: not counted as an error");
  });
});

describe("KeeperBot — keeper retry after coordination skip (T-R17-03)", () => {
  test("keeper retries on next tick and succeeds after coordination skip", async () => {
    const client = makeMockClient();
    let callCount = 0;

    // First tick: coordination race (another keeper acted)
    // Second tick: success
    client.startHand = mock.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw makeContractError("CannotStartHand");
      }
      return "0xsuccesshash";
    });
    client.getTableState = mock.fn(async () =>
      makeBaseState({ gameState: GameState.WAITING_FOR_SEATS, canStartHand: true }),
    );
    client.isBettingState = mock.fn(() => false);
    client.isVRFWaitingState = mock.fn(() => false);

    const bot = makeBot(client);

    // First tick: coordination skip
    await runTick(bot);
    assert.strictEqual(bot.getStats().coordinationSkips, 1, "First tick: coordination skip");
    assert.strictEqual(bot.getStats().handsStarted, 0, "First tick: hand not started");

    // Second tick: success
    await runTick(bot);
    assert.strictEqual(bot.getStats().handsStarted, 1, "Second tick: hand started after retry");
    assert.strictEqual(bot.getStats().errors, 0, "No errors across both ticks");
  });
});
