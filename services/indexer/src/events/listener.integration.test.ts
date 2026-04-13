/**
 * Integration tests for the indexer event listener handlers.
 *
 * Tests that contract events are correctly decoded, persisted to the DB,
 * and broadcast to WebSocket clients. The DB and WS layers are mocked so
 * tests run without a live database.
 *
 * Covers T-M4-05.
 */

import { test, describe, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import type { Log } from "viem";
import type { EventContext } from "./handlers.js";

// ─── Controlled implementations (swappable per-test) ──────────────────────────

let isEventProcessedImpl: () => Promise<boolean> = async () => false;
let getHandImpl: () => Promise<unknown> = async () => null;

// ─── Mock DB module ───────────────────────────────────────────────────────────

const db = {
  isEventProcessed: mock.fn(async (..._args: unknown[]) => isEventProcessedImpl()),
  markEventProcessed: mock.fn(async () => {}),
  upsertTable: mock.fn(async () => {}),
  updateTableState: mock.fn(async () => {}),
  upsertSeat: mock.fn(async () => {}),
  insertHand: mock.fn(async () => {}),
  updateHand: mock.fn(async () => {}),
  insertAction: mock.fn(async () => {}),
  insertSettlement: mock.fn(async () => {}),
  upsertAgent: mock.fn(async () => {}),
  updateAgentOperator: mock.fn(async () => {}),
  updateAgentOwner: mock.fn(async () => {}),
  updateAgentVault: mock.fn(async () => {}),
  updateAgentTable: mock.fn(async () => {}),
  updateAgentMetaUri: mock.fn(async () => {}),
  insertVaultSnapshot: mock.fn(async () => {}),
  insertRebalanceEvent: mock.fn(async () => {}),
  insertRevealedHolecard: mock.fn(async () => {}),
  insertDecisionVerification: mock.fn(async () => {}),
  upsertDecisionAudit: mock.fn(async () => {}),
  insertStrategyRecord: mock.fn(async () => {}),
  getSeats: mock.fn(async () => []),
  getEloRatings: mock.fn(async () => new Map()),
  upsertEloRating: mock.fn(async () => {}),
  insertEloHistory: mock.fn(async () => {}),
  getHand: mock.fn(async (..._args: unknown[]) => getHandImpl()),
  getAllAgents: mock.fn(async () => []),
  getIndexerState: mock.fn(async () => null),
  updateIndexerState: mock.fn(async () => {}),
};

// ─── Mock WS module ──────────────────────────────────────────────────────────

const ws = {
  broadcastAction: mock.fn(() => {}),
  broadcastHandStarted: mock.fn(() => {}),
  broadcastBettingRoundComplete: mock.fn(() => {}),
  broadcastVRFRequested: mock.fn(() => {}),
  broadcastCommunityCards: mock.fn(() => {}),
  broadcastHandSettled: mock.fn(() => {}),
  broadcastSeatUpdated: mock.fn(() => {}),
  broadcastPotUpdated: mock.fn(() => {}),
  broadcastForceTimeout: mock.fn(() => {}),
};

// Register module mocks BEFORE importing the module under test.
await mock.module("../db/index.js", { namedExports: db });
await mock.module("../ws/index.js", { namedExports: ws });

// Import handlers AFTER mocks are set up.
const handlers = await import("./handlers.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeLog(overrides: Partial<Log> = {}): Log {
  return {
    blockNumber: 100n,
    logIndex: 0,
    transactionHash: "0xdeadbeef00000000000000000000000000000000000000000000000000000000",
    address: "0x0000000000000000000000000000000000000001",
    topics: [],
    data: "0x",
    blockHash: "0xblockhash",
    transactionIndex: 0,
    removed: false,
    ...overrides,
  } as Log;
}

const CTX: EventContext = {
  tableId: 1n,
  contractAddress: "0x0000000000000000000000000000000000000001",
  smallBlind: 10n,
  bigBlind: 20n,
};

function resetAllMocks() {
  isEventProcessedImpl = async () => false;
  getHandImpl = async () => null;
  for (const fn of Object.values(db) as ReturnType<typeof mock.fn>[]) {
    if (typeof fn?.mock?.resetCalls === "function") fn.mock.resetCalls();
  }
  for (const fn of Object.values(ws) as ReturnType<typeof mock.fn>[]) {
    if (typeof fn?.mock?.resetCalls === "function") fn.mock.resetCalls();
  }
}

// ─── handleSeatUpdated ────────────────────────────────────────────────────────

describe("handleSeatUpdated", () => {
  beforeEach(resetAllMocks);

  test("upserts table and seat, marks event processed, broadcasts", async () => {
    const log = makeLog({ blockNumber: 200n, logIndex: 3 });
    const args = {
      seatIndex: 0,
      owner: "0xowner",
      operator: "0xoperator",
      stack: 1000n,
    };

    await handlers.handleSeatUpdated(log, args, CTX);

    // DB: check idempotency lookup
    assert.strictEqual(db.isEventProcessed.mock.calls.length, 1);
    assert.deepStrictEqual(db.isEventProcessed.mock.calls[0].arguments, [200n, 3]);

    // DB: upsert table
    assert.strictEqual(db.upsertTable.mock.calls.length, 1);

    // DB: upsert seat with correct stack
    assert.strictEqual(db.upsertSeat.mock.calls.length, 1);
    const [tId, seatIdx, owner, , stack] = db.upsertSeat.mock.calls[0].arguments as unknown as [
      bigint,
      number,
      string,
      string,
      bigint,
    ];
    assert.strictEqual(tId, 1n);
    assert.strictEqual(seatIdx, 0);
    assert.strictEqual(owner, "0xowner");
    assert.strictEqual(stack, 1000n);

    // DB: mark processed
    assert.strictEqual(db.markEventProcessed.mock.calls.length, 1);

    // WS: broadcast
    assert.strictEqual(ws.broadcastSeatUpdated.mock.calls.length, 1);
  });

  test("skips processing if event already processed (idempotency)", async () => {
    isEventProcessedImpl = async () => true; // simulate already-processed

    const log = makeLog({ blockNumber: 100n, logIndex: 0 });
    await handlers.handleSeatUpdated(
      log,
      { seatIndex: 0, owner: "0xa", operator: "0xb", stack: 500n },
      CTX,
    );

    assert.strictEqual(db.upsertTable.mock.calls.length, 0);
    assert.strictEqual(db.upsertSeat.mock.calls.length, 0);
    assert.strictEqual(ws.broadcastSeatUpdated.mock.calls.length, 0);
  });

  test("skips if log has null blockNumber", async () => {
    const log = makeLog({ blockNumber: null as unknown as bigint });
    await handlers.handleSeatUpdated(
      log,
      { seatIndex: 0, owner: "0xa", operator: "0xb", stack: 0n },
      CTX,
    );

    assert.strictEqual(db.upsertSeat.mock.calls.length, 0);
  });
});

// ─── handleHandStarted ────────────────────────────────────────────────────────

describe("handleHandStarted", () => {
  beforeEach(resetAllMocks);

  test("inserts hand with correct pot = SB + BB", async () => {
    const log = makeLog({ blockNumber: 300n, logIndex: 1 });
    const args = {
      handId: 1n,
      smallBlind: 10n,
      bigBlind: 20n,
      buttonSeat: 0,
    };

    await handlers.handleHandStarted(log, args, CTX);

    assert.strictEqual(db.insertHand.mock.calls.length, 1);
    const [tableId, handId, pot, buttonSeat, , , state] = db.insertHand.mock.calls[0]
      .arguments as unknown as [bigint, bigint, bigint, number, bigint, bigint, string];
    assert.strictEqual(tableId, 1n);
    assert.strictEqual(handId, 1n);
    assert.strictEqual(pot, 30n); // 10 + 20
    assert.strictEqual(buttonSeat, 0);
    assert.strictEqual(state, "BETTING_PRE");

    assert.strictEqual(db.updateTableState.mock.calls.length, 1);
    assert.strictEqual(ws.broadcastHandStarted.mock.calls.length, 1);
  });

  test("skips if event already processed", async () => {
    isEventProcessedImpl = async () => true;

    await handlers.handleHandStarted(
      makeLog(),
      { handId: 2n, smallBlind: 5n, bigBlind: 10n, buttonSeat: 1 },
      CTX,
    );

    assert.strictEqual(db.insertHand.mock.calls.length, 0);
    assert.strictEqual(ws.broadcastHandStarted.mock.calls.length, 0);
  });
});

// ─── handleActionTaken ────────────────────────────────────────────────────────

describe("handleActionTaken", () => {
  beforeEach(resetAllMocks);

  test("inserts RAISE action with correct type string", async () => {
    const log = makeLog({ blockNumber: 400n, logIndex: 2 });
    const args = {
      handId: 1n,
      seatIndex: 0,
      action: 3, // RAISE
      amount: 60n,
      potAfter: 90n,
    };

    await handlers.handleActionTaken(log, args, CTX);

    assert.strictEqual(db.insertAction.mock.calls.length, 1);
    const [, , , actionType, amount] = db.insertAction.mock.calls[0].arguments as unknown as [
      bigint,
      bigint,
      number,
      string,
      bigint,
    ];
    assert.strictEqual(actionType, "RAISE");
    assert.strictEqual(amount, 60n);

    assert.strictEqual(ws.broadcastAction.mock.calls.length, 1);
  });

  test("inserts FOLD action correctly", async () => {
    const log = makeLog({ blockNumber: 401n, logIndex: 0 });
    await handlers.handleActionTaken(
      log,
      { handId: 1n, seatIndex: 1, action: 0, amount: 0n, potAfter: 100n },
      CTX,
    );

    const [, , , actionType] = db.insertAction.mock.calls[0].arguments as unknown as [
      bigint,
      bigint,
      number,
      string,
    ];
    assert.strictEqual(actionType, "FOLD");
  });

  test("inserts CHECK action correctly", async () => {
    const log = makeLog({ blockNumber: 402n, logIndex: 0 });
    await handlers.handleActionTaken(
      log,
      { handId: 1n, seatIndex: 0, action: 1, amount: 0n, potAfter: 30n },
      CTX,
    );

    const [, , , actionType] = db.insertAction.mock.calls[0].arguments as unknown as [
      bigint,
      bigint,
      number,
      string,
    ];
    assert.strictEqual(actionType, "CHECK");
  });

  test("skips if log has null transactionHash", async () => {
    const log = makeLog({ transactionHash: null as unknown as `0x${string}` });
    await handlers.handleActionTaken(
      log,
      { handId: 1n, seatIndex: 0, action: 1, amount: 0n, potAfter: 20n },
      CTX,
    );

    assert.strictEqual(db.insertAction.mock.calls.length, 0);
  });

  test("is idempotent for duplicate events", async () => {
    isEventProcessedImpl = async () => true;

    await handlers.handleActionTaken(
      makeLog(),
      { handId: 1n, seatIndex: 0, action: 2, amount: 20n, potAfter: 40n },
      CTX,
    );

    assert.strictEqual(db.insertAction.mock.calls.length, 0);
  });
});

// ─── handleHandSettled ───────────────────────────────────────────────────────

describe("handleHandSettled", () => {
  beforeEach(resetAllMocks);

  test("inserts settlement and updates table state to SETTLED", async () => {
    const log = makeLog({ blockNumber: 500n, logIndex: 0 });
    const args = {
      handId: 1n,
      winnerSeat: 0,
      potAmount: 200n,
    };

    await handlers.handleHandSettled(log, args, CTX);

    assert.strictEqual(db.insertSettlement.mock.calls.length, 1);
    const [tableId, handId, winnerSeat, potAmount] = db.insertSettlement.mock.calls[0]
      .arguments as unknown as [bigint, bigint, number, bigint];
    assert.strictEqual(tableId, 1n);
    assert.strictEqual(handId, 1n);
    assert.strictEqual(winnerSeat, 0);
    assert.strictEqual(potAmount, 200n);

    assert.strictEqual(db.updateTableState.mock.calls.length, 1);
    const [, newState] = db.updateTableState.mock.calls[0].arguments as unknown as [bigint, string];
    assert.strictEqual(newState, "SETTLED");

    assert.strictEqual(ws.broadcastHandSettled.mock.calls.length, 1);
  });

  test("is idempotent for duplicate settlement events", async () => {
    isEventProcessedImpl = async () => true;

    await handlers.handleHandSettled(
      makeLog(),
      { handId: 1n, winnerSeat: 0, potAmount: 100n },
      CTX,
    );

    assert.strictEqual(db.insertSettlement.mock.calls.length, 0);
    assert.strictEqual(ws.broadcastHandSettled.mock.calls.length, 0);
  });
});

// ─── handleCommunityCardsDealt ────────────────────────────────────────────────

describe("handleCommunityCardsDealt", () => {
  beforeEach(resetAllMocks);

  test("broadcasts community cards after merging with existing", async () => {
    const log = makeLog({ blockNumber: 600n, logIndex: 0 });
    // Handler arg uses 'street', not 'newState'
    const args = {
      handId: 1n,
      street: 4, // BETTING_FLOP index
      cards: [5, 10, 25] as number[],
    };

    await handlers.handleCommunityCardsDealt(log, args, CTX);

    // WS broadcast should carry tableId, handId, street, and new cards
    assert.strictEqual(ws.broadcastCommunityCards.mock.calls.length, 1);
    const broadcastArgs = ws.broadcastCommunityCards.mock.calls[0].arguments as unknown as [
      bigint,
      bigint,
      number,
      readonly number[],
    ];
    assert.strictEqual(broadcastArgs[0], 1n); // tableId
    assert.strictEqual(broadcastArgs[1], 1n); // handId
    assert.strictEqual(broadcastArgs[2], 4); // street
    assert.deepStrictEqual(broadcastArgs[3], [5, 10, 25]); // cards

    // markEventProcessed must be called
    assert.strictEqual(db.markEventProcessed.mock.calls.length, 1);
  });

  test("is idempotent for duplicate card events", async () => {
    isEventProcessedImpl = async () => true;

    await handlers.handleCommunityCardsDealt(
      makeLog(),
      { handId: 1n, street: 4, cards: [1, 2, 3] as number[] },
      CTX,
    );

    // Nothing should happen if already processed
    assert.strictEqual(ws.broadcastCommunityCards.mock.calls.length, 0);
    assert.strictEqual(db.markEventProcessed.mock.calls.length, 0);
  });
});

// ─── handleAgentRegistered ────────────────────────────────────────────────────

describe("handleAgentRegistered", () => {
  beforeEach(resetAllMocks);

  test("upserts agent with correct field order (token, owner, operator, vault, table, meta)", async () => {
    const log = makeLog({ blockNumber: 700n, logIndex: 0 });
    // Handler expects: { token, owner, vault, table, operator, metaURI }
    const args = {
      token: "0xtoken",
      vault: "0xvault",
      table: "0xtable",
      owner: "0xowner",
      operator: "0xoperator",
      metaURI: "ipfs://Qm...",
    };

    await handlers.handleAgentRegistered(log, args);

    assert.strictEqual(db.upsertAgent.mock.calls.length, 1);
    // upsertAgent(tokenAddress, ownerAddress, operatorAddress, vaultAddress, tableAddress, metaUri)
    const [_token, owner, operator, vault, table, meta] = db.upsertAgent.mock.calls[0]
      .arguments as string[];
    assert.strictEqual(owner, "0xowner");
    assert.strictEqual(operator, "0xoperator");
    assert.strictEqual(vault, "0xvault");
    assert.strictEqual(table, "0xtable");
    assert.strictEqual(meta, "ipfs://Qm...");

    assert.strictEqual(db.markEventProcessed.mock.calls.length, 1);
  });

  test("is idempotent for duplicate registration events", async () => {
    isEventProcessedImpl = async () => true;

    await handlers.handleAgentRegistered(makeLog(), {
      token: "0xtoken",
      vault: "0xvault",
      table: "0xtable",
      owner: "0xowner",
      operator: "0xoperator",
      metaURI: "",
    });

    assert.strictEqual(db.upsertAgent.mock.calls.length, 0);
    assert.strictEqual(db.markEventProcessed.mock.calls.length, 0);
  });
});
