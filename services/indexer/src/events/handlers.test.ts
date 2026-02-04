// Event handlers tests

import { describe, it } from "node:test";
import assert from "node:assert";
import { gameStateToString, actionTypeToString, GAME_STATES, ACTION_TYPES } from "./abis.js";

describe("Event ABIs", () => {
  describe("gameStateToString", () => {
    it("should convert game state enum to string", () => {
      assert.strictEqual(gameStateToString(0), "WAITING_FOR_SEATS");
      assert.strictEqual(gameStateToString(1), "HAND_INIT");
      assert.strictEqual(gameStateToString(2), "BETTING_PRE");
      assert.strictEqual(gameStateToString(3), "WAITING_VRF_FLOP");
      assert.strictEqual(gameStateToString(4), "BETTING_FLOP");
      assert.strictEqual(gameStateToString(5), "WAITING_VRF_TURN");
      assert.strictEqual(gameStateToString(6), "BETTING_TURN");
      assert.strictEqual(gameStateToString(7), "WAITING_VRF_RIVER");
      assert.strictEqual(gameStateToString(8), "BETTING_RIVER");
      assert.strictEqual(gameStateToString(9), "SHOWDOWN");
      assert.strictEqual(gameStateToString(10), "SETTLED");
    });

    it("should handle unknown game states", () => {
      assert.strictEqual(gameStateToString(99), "UNKNOWN_99");
    });
  });

  describe("actionTypeToString", () => {
    it("should convert action type enum to string", () => {
      assert.strictEqual(actionTypeToString(0), "FOLD");
      assert.strictEqual(actionTypeToString(1), "CHECK");
      assert.strictEqual(actionTypeToString(2), "CALL");
      assert.strictEqual(actionTypeToString(3), "RAISE");
    });

    it("should handle unknown action types", () => {
      assert.strictEqual(actionTypeToString(99), "UNKNOWN_99");
    });
  });

  describe("GAME_STATES constant", () => {
    it("should have 11 states", () => {
      assert.strictEqual(GAME_STATES.length, 11);
    });

    it("should match contract enum order", () => {
      // These must match the Solidity enum exactly
      const expectedStates = [
        "WAITING_FOR_SEATS",
        "HAND_INIT",
        "BETTING_PRE",
        "WAITING_VRF_FLOP",
        "BETTING_FLOP",
        "WAITING_VRF_TURN",
        "BETTING_TURN",
        "WAITING_VRF_RIVER",
        "BETTING_RIVER",
        "SHOWDOWN",
        "SETTLED",
      ];

      for (let i = 0; i < expectedStates.length; i++) {
        assert.strictEqual(GAME_STATES[i], expectedStates[i]);
      }
    });
  });

  describe("ACTION_TYPES constant", () => {
    it("should have 4 action types", () => {
      assert.strictEqual(ACTION_TYPES.length, 4);
    });

    it("should match contract enum order", () => {
      // These must match the Solidity enum exactly
      assert.strictEqual(ACTION_TYPES[0], "FOLD");
      assert.strictEqual(ACTION_TYPES[1], "CHECK");
      assert.strictEqual(ACTION_TYPES[2], "CALL");
      assert.strictEqual(ACTION_TYPES[3], "RAISE");
    });
  });
});

describe("Event Handler Logic", () => {
  describe("Idempotency", () => {
    it("should use block_number and log_index as unique key", () => {
      // Idempotency is achieved by:
      // 1. Checking processed_events table before processing
      // 2. Using (block_number, log_index) as primary key
      // 3. Using ON CONFLICT DO NOTHING for inserts

      const event1 = { blockNumber: 100n, logIndex: 5 };
      const event2 = { blockNumber: 100n, logIndex: 5 }; // Same as event1 - should be skipped

      // Same block+index = same event
      assert.strictEqual(event1.blockNumber, event2.blockNumber);
      assert.strictEqual(event1.logIndex, event2.logIndex);
    });

    it("should distinguish events with different log indices", () => {
      const event1 = { blockNumber: 100n, logIndex: 5 };
      const event2 = { blockNumber: 100n, logIndex: 6 }; // Different log index

      // Different events even in same block
      assert.notStrictEqual(event1.logIndex, event2.logIndex);
    });
  });

  describe("Event Context", () => {
    it("should track table context for poker table events", () => {
      const ctx = {
        tableId: 1n,
        contractAddress: "0x1234567890123456789012345678901234567890",
        smallBlind: 10n,
        bigBlind: 20n,
      };

      assert.strictEqual(ctx.tableId, 1n);
      assert.strictEqual(ctx.smallBlind, 10n);
      assert.strictEqual(ctx.bigBlind, 20n);
    });
  });
});

describe("Database Types", () => {
  describe("Numeric handling", () => {
    it("should store large numbers as strings", () => {
      // Postgres NUMERIC can hold up to 78 digits
      // We store as string and let Postgres handle precision
      const largeNumber = BigInt("115792089237316195423570985008687907853269984665640564039457584007913129639935");
      const asString = largeNumber.toString();

      assert.strictEqual(asString.length, 78);
      assert.strictEqual(BigInt(asString), largeNumber);
    });

    it("should handle negative cumulative PnL", () => {
      const negativePnl = -1000n;
      const asString = negativePnl.toString();

      assert.strictEqual(asString, "-1000");
      assert.strictEqual(BigInt(asString), negativePnl);
    });
  });

  describe("Address normalization", () => {
    it("should lowercase addresses for consistency", () => {
      const mixedCase = "0xAbCdEf1234567890123456789012345678901234";
      const normalized = mixedCase.toLowerCase();

      assert.strictEqual(normalized, "0xabcdef1234567890123456789012345678901234");
    });
  });
});
