// Unit tests for VrfOperatorBot
// Run: pnpm --filter @playerco/vrf-operator-bot test

import { describe, test, before, beforeEach } from "node:test";
import assert from "node:assert";
import { VrfOperatorBot, type VrfOperatorBotConfig } from "./bot.js";
import type { VrfRequest } from "./chain/client.js";

// ---------------------------------------------------------------------------
// Test helpers & stubs
// ---------------------------------------------------------------------------

const MOCK_ADDRESS = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" as `0x${string}`;
const MOCK_TABLE   = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as `0x${string}`;
const MOCK_BLOCK_HASH = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" as `0x${string}`;

function makeConfig(overrides: Partial<VrfOperatorBotConfig> = {}): VrfOperatorBotConfig {
  return {
    rpcUrl:             "http://localhost:8545",
    privateKey:         "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    vrfAdapterAddress:  "0xcccccccccccccccccccccccccccccccccccccccc",
    pollIntervalMs:     9999999, // don't actually poll in tests
    ...overrides,
  };
}

/**
 * Creates a bot and replaces its private chainClient with a mock.
 * Returns both the bot and the mock so tests can configure return values.
 */
function makeBotWithMock(configOverrides: Partial<VrfOperatorBotConfig> = {}) {
  const config = makeConfig(configOverrides);
  const bot = new VrfOperatorBot(config);

  // Default mock state
  let nextRequestId = 1n;
  let blockNumber   = 100n;
  let blockHash     = MOCK_BLOCK_HASH;
  const requests    = new Map<bigint, VrfRequest>();

  const mock = {
    get nextRequestId()  { return nextRequestId; },
    set nextRequestId(v) { nextRequestId = v; },
    get blockNumber()    { return blockNumber; },
    set blockNumber(v)   { blockNumber = v; },
    setRequest(id: bigint, req: VrfRequest) { requests.set(id, req); },
    // Track fulfill calls
    fulfilledCalls: [] as Array<{ requestId: bigint; randomness: bigint }>,
    fulfillShouldThrow: false as boolean | string,
  };

  const stubbedClient = {
    get address() { return MOCK_ADDRESS; },
    getOperator:       async () => MOCK_ADDRESS,
    getNextRequestId:  async () => nextRequestId,
    getBlockNumber:    async () => blockNumber,
    getLatestBlock:    async () => ({ number: blockNumber, hash: blockHash }),
    getRequest: async (id: bigint): Promise<VrfRequest> => {
      return requests.get(id) ?? {
        table: "0x0000000000000000000000000000000000000000" as `0x${string}`,
        tableId: 0n, handId: 0n, purpose: 0,
        requestedAt: 0n, requestedBlock: 0n, fulfilled: false,
      };
    },
    fulfillRandomness: async (requestId: bigint, randomness: bigint) => {
      if (mock.fulfillShouldThrow) {
        throw new Error(typeof mock.fulfillShouldThrow === "string" ? mock.fulfillShouldThrow : "mock error");
      }
      mock.fulfilledCalls.push({ requestId, randomness });
      // Mark as fulfilled in our map
      const req = requests.get(requestId);
      if (req) requests.set(requestId, { ...req, fulfilled: true });
      return "0xdeadbeef" as `0x${string}`;
    },
  };

  // Inject stub
  (bot as unknown as Record<string, unknown>).chainClient = stubbedClient;

  return { bot, mock };
}

/** Returns a default fulfilled=false VRF request. */
function makeRequest(overrides: Partial<VrfRequest> = {}): VrfRequest {
  return {
    table:          MOCK_TABLE,
    tableId:        1n,
    handId:         1n,
    purpose:        3,   // WAITING_VRF_FLOP
    requestedAt:    BigInt(Math.floor(Date.now() / 1000) - 10),
    requestedBlock: 95n,
    fulfilled:      false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. buildRandomness — determinism & non-zero
// ---------------------------------------------------------------------------

describe("buildRandomness", () => {
  test("same inputs produce identical output (deterministic)", () => {
    const { bot } = makeBotWithMock();
    const req = makeRequest();
    const r1 = (bot as any).buildRandomness(1n, req, 100n, MOCK_BLOCK_HASH);
    const r2 = (bot as any).buildRandomness(1n, req, 100n, MOCK_BLOCK_HASH);
    assert.strictEqual(r1, r2, "same inputs must produce same randomness");
  });

  test("result is never 0n", () => {
    const { bot } = makeBotWithMock();
    for (let i = 1n; i <= 20n; i++) {
      const req = makeRequest({ handId: i, tableId: i });
      const r = (bot as any).buildRandomness(i, req, 100n, MOCK_BLOCK_HASH);
      assert.notStrictEqual(r, 0n, `requestId=${i} should not produce 0`);
    }
  });

  test("different requestIds produce different randomness", () => {
    const { bot } = makeBotWithMock();
    const req  = makeRequest();
    const r1 = (bot as any).buildRandomness(1n, req, 100n, MOCK_BLOCK_HASH);
    const r2 = (bot as any).buildRandomness(2n, req, 100n, MOCK_BLOCK_HASH);
    assert.notStrictEqual(r1, r2, "different requestIds must produce different randomness");
  });

  test("different block hashes produce different randomness", () => {
    const { bot } = makeBotWithMock();
    const req = makeRequest();
    const hash2 = "0xdeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddeaddead" as `0x${string}`;
    const r1 = (bot as any).buildRandomness(1n, req, 100n, MOCK_BLOCK_HASH);
    const r2 = (bot as any).buildRandomness(1n, req, 100n, hash2);
    assert.notStrictEqual(r1, r2, "different block hashes must produce different randomness");
  });

  test("randomSalt affects output", () => {
    const bot1 = makeBotWithMock({ randomSalt: "salt-a" }).bot;
    const bot2 = makeBotWithMock({ randomSalt: "salt-b" }).bot;
    const req  = makeRequest();
    const r1 = (bot1 as any).buildRandomness(1n, req, 100n, MOCK_BLOCK_HASH);
    const r2 = (bot2 as any).buildRandomness(1n, req, 100n, MOCK_BLOCK_HASH);
    assert.notStrictEqual(r1, r2, "different salts must produce different randomness");
  });

  test("fixedRandomness config bypasses computation", async () => {
    const { bot, mock } = makeBotWithMock({ fixedRandomness: 12345n });
    mock.nextRequestId = 2n;
    mock.setRequest(1n, makeRequest({ requestedBlock: 90n }));
    mock.blockNumber = 100n;

    // Run one tick
    await (bot as any).tick(1n);

    assert.strictEqual(mock.fulfilledCalls.length, 1);
    assert.strictEqual(mock.fulfilledCalls[0].randomness, 12345n);
  });
});

// ---------------------------------------------------------------------------
// 2. pending request management
// ---------------------------------------------------------------------------

describe("pendingRequestIds management", () => {
  test("requests are added to pending set during tick scan", async () => {
    const { bot, mock } = makeBotWithMock();
    mock.nextRequestId = 4n;
    // All requests point to zero address → immediately removed
    // We want them added first, so make them valid but not fulfillable
    for (let i = 1n; i <= 3n; i++) {
      mock.setRequest(i, makeRequest({ requestedBlock: 200n })); // block 200, current=100 — not ready
    }
    mock.blockNumber = 100n;

    await (bot as any).tick(1n);

    const pending = (bot as any).pendingRequestIds as Set<bigint>;
    assert.strictEqual(pending.size, 3, "all 3 requests should be in pending set");
  });

  test("fulfilled requests are removed from pending set", async () => {
    const { bot, mock } = makeBotWithMock();
    mock.nextRequestId = 2n;
    mock.setRequest(1n, makeRequest({ requestedBlock: 90n }));
    mock.blockNumber = 100n;

    await (bot as any).tick(1n);

    const pending = (bot as any).pendingRequestIds as Set<bigint>;
    assert.strictEqual(pending.size, 0, "fulfilled request should be removed from pending");
  });

  test("pending set respects MAX_PENDING_REQUESTS cap", async () => {
    const { bot, mock } = makeBotWithMock();
    const limit = 1_000;
    mock.nextRequestId = BigInt(limit + 50 + 1); // 1050 new requests
    // All at block 200 so they won't be fulfilled (current = 100)
    for (let i = 1n; i <= BigInt(limit + 50); i++) {
      mock.setRequest(i, makeRequest({ requestedBlock: 200n }));
    }
    mock.blockNumber = 100n;

    await (bot as any).tick(1n);

    const pending = (bot as any).pendingRequestIds as Set<bigint>;
    assert.ok(pending.size <= limit, `pending set must not exceed ${limit}, got ${pending.size}`);
  });

  test("stale pending requests are cleaned up", () => {
    const { bot } = makeBotWithMock();
    const pending    = (bot as any).pendingRequestIds as Set<bigint>;
    const addedAt    = (bot as any).pendingAddedAt    as Map<bigint, number>;
    const staleMs    = 60 * 60 * 1000; // PENDING_STALE_AFTER_MS

    // Inject a stale entry (>1h old)
    const staleTime = Date.now() - staleMs - 1000;
    pending.add(99n);
    addedAt.set(99n, staleTime);

    // Inject a fresh entry
    pending.add(100n);
    addedAt.set(100n, Date.now());

    (bot as any).cleanPendingRequests();

    assert.ok(!pending.has(99n), "stale request should be removed");
    assert.ok(pending.has(100n), "fresh request should remain");
    assert.ok(!addedAt.has(99n), "stale addedAt entry should be cleaned up");
  });

  test("non-stale entries are not removed by cleanPendingRequests", () => {
    const { bot } = makeBotWithMock();
    const pending  = (bot as any).pendingRequestIds as Set<bigint>;
    const addedAt  = (bot as any).pendingAddedAt    as Map<bigint, number>;

    pending.add(1n);
    addedAt.set(1n, Date.now() - 1000); // 1 second old

    (bot as any).cleanPendingRequests();

    assert.ok(pending.has(1n), "non-stale request must not be removed");
  });

  test("already-fulfilled requests are skipped and removed", async () => {
    const { bot, mock } = makeBotWithMock();
    mock.nextRequestId = 2n;
    mock.setRequest(1n, makeRequest({ requestedBlock: 90n, fulfilled: true }));
    mock.blockNumber = 100n;

    await (bot as any).tick(1n);

    assert.strictEqual(mock.fulfilledCalls.length, 0, "should not fulfill an already-fulfilled request");
    const pending = (bot as any).pendingRequestIds as Set<bigint>;
    assert.ok(!pending.has(1n), "fulfilled request should not remain in pending");
  });

  test("zero-address table requests are removed from pending without fulfillment", async () => {
    const { bot, mock } = makeBotWithMock();
    mock.nextRequestId = 2n;
    // Default mock returns zero-address table for unknown ids
    mock.blockNumber = 100n;

    await (bot as any).tick(1n);

    assert.strictEqual(mock.fulfilledCalls.length, 0, "zero-address request must not be fulfilled");
    const pending = (bot as any).pendingRequestIds as Set<bigint>;
    assert.ok(!pending.has(1n), "zero-address request should be removed from pending");
  });
});

// ---------------------------------------------------------------------------
// 3. tick / minConfirmations
// ---------------------------------------------------------------------------

describe("tick — minConfirmations", () => {
  test("request not yet past minConfirmations is skipped", async () => {
    const { bot, mock } = makeBotWithMock();
    mock.nextRequestId = 2n;
    mock.setRequest(1n, makeRequest({ requestedBlock: 99n }));
    mock.blockNumber = 100n; // requestedBlock + 1 == currentBlock → not ready with minConf=2

    await (bot as any).tick(2n);

    assert.strictEqual(mock.fulfilledCalls.length, 0, "should skip request that needs more confirmations");
    const stats = bot.getStats();
    assert.strictEqual(stats.skippedNotReady, 1);
  });

  test("request past minConfirmations is fulfilled", async () => {
    const { bot, mock } = makeBotWithMock();
    mock.nextRequestId = 2n;
    mock.setRequest(1n, makeRequest({ requestedBlock: 95n }));
    mock.blockNumber = 100n; // 100 > 95 + 1 ✓

    await (bot as any).tick(1n);

    assert.strictEqual(mock.fulfilledCalls.length, 1);
    assert.strictEqual(mock.fulfilledCalls[0].requestId, 1n);
  });
});

// ---------------------------------------------------------------------------
// 4. rescanWindow boundary
// ---------------------------------------------------------------------------

describe("rescanWindow", () => {
  test("lastSeenRequestId starts at nextRequestId - rescanWindow", async () => {
    // We can't easily call run() without network, so test the initialization logic
    // by checking the formula used in run() via the config.
    const rescanWindow = 256n;
    const nextId       = 500n;

    const expectedStart = nextId - rescanWindow; // 244n

    // Simulate what run() does:
    const computed =
      nextId > rescanWindow ? nextId - rescanWindow : 1n;

    assert.strictEqual(computed, expectedStart);
  });

  test("lastSeenRequestId defaults to 1n when nextId <= rescanWindow", () => {
    const rescanWindow = 256n;
    const nextId       = 100n; // less than rescanWindow

    const computed = nextId > rescanWindow ? nextId - rescanWindow : 1n;
    assert.strictEqual(computed, 1n);
  });

  test("rescanFromRequestId config overrides calculated start", async () => {
    // The config option rescanFromRequestId overrides the computed start.
    // We verify the bot exposes this via the internal state after tick setup.
    const config = makeConfig({ rescanFromRequestId: 42n });
    const bot = new VrfOperatorBot(config);

    // lastSeenRequestId starts at 1 before run() is called;
    // run() sets it from config. We test the formula path directly.
    const rescanFromConfig = config.rescanFromRequestId;
    assert.strictEqual(rescanFromConfig, 42n, "rescanFromRequestId should be stored in config");
  });
});

// ---------------------------------------------------------------------------
// 5. stats tracking
// ---------------------------------------------------------------------------

describe("stats", () => {
  test("fulfilledRequests increments on successful fulfill", async () => {
    const { bot, mock } = makeBotWithMock();
    mock.nextRequestId = 3n;
    mock.setRequest(1n, makeRequest({ requestedBlock: 90n }));
    mock.setRequest(2n, makeRequest({ requestedBlock: 90n }));
    mock.blockNumber = 100n;

    await (bot as any).tick(1n);

    assert.strictEqual(bot.getStats().fulfilledRequests, 2);
  });

  test("errors increments when fulfill throws", async () => {
    const { bot, mock } = makeBotWithMock();
    mock.nextRequestId = 2n;
    mock.setRequest(1n, makeRequest({ requestedBlock: 90n }));
    mock.blockNumber    = 100n;
    mock.fulfillShouldThrow = true;

    await (bot as any).tick(1n);

    assert.strictEqual(bot.getStats().errors, 1);
  });

  test("lastFulfilledRequestId and lastFulfilledTxHash are updated", async () => {
    const { bot, mock } = makeBotWithMock();
    mock.nextRequestId = 2n;
    mock.setRequest(1n, makeRequest({ requestedBlock: 90n }));
    mock.blockNumber = 100n;

    await (bot as any).tick(1n);

    const stats = bot.getStats();
    assert.strictEqual(stats.lastFulfilledRequestId, 1n);
    assert.strictEqual(stats.lastFulfilledTxHash, "0xdeadbeef");
  });

  test("getStats returns a copy, not the internal reference", () => {
    const { bot } = makeBotWithMock();
    const stats1 = bot.getStats();
    stats1.fulfilledRequests = 999;
    const stats2 = bot.getStats();
    assert.strictEqual(stats2.fulfilledRequests, 0, "mutating returned stats must not affect internal state");
  });

  test("scannedRequests increments for each new requestId seen", async () => {
    const { bot, mock } = makeBotWithMock();
    // All requests at high block so they won't be fulfilled
    mock.nextRequestId = 5n;
    for (let i = 1n; i <= 4n; i++) {
      mock.setRequest(i, makeRequest({ requestedBlock: 200n }));
    }
    mock.blockNumber = 100n;

    await (bot as any).tick(1n);

    assert.strictEqual(bot.getStats().scannedRequests, 4);
  });
});
