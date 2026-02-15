import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HoleCardStore, HoleCardError } from "./holeCardStore.js";
import type { HoleCardRecord } from "./types.js";

describe("HoleCardStore", () => {
  let store: HoleCardStore;

  beforeEach(() => {
    store = new HoleCardStore();
  });

  describe("set()", () => {
    it("should store hole cards successfully", () => {
      const record: HoleCardRecord = {
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [10, 25],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now(),
      };

      store.set(record);
      assert.equal(store.size(), 1);
    });

    it("should reject duplicate records", () => {
      const record: HoleCardRecord = {
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [10, 25],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now(),
      };

      store.set(record);

      assert.throws(
        () => store.set(record),
        (err: Error) => {
          assert(err instanceof HoleCardError);
          assert.equal(err.code, "ALREADY_EXISTS");
          return true;
        }
      );
    });

    it("should reject invalid card values (negative)", () => {
      const record: HoleCardRecord = {
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [-1, 25],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now(),
      };

      assert.throws(
        () => store.set(record),
        (err: Error) => {
          assert(err instanceof HoleCardError);
          assert.equal(err.code, "INVALID_CARDS");
          return true;
        }
      );
    });

    it("should reject invalid card values (>51)", () => {
      const record: HoleCardRecord = {
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [10, 52],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now(),
      };

      assert.throws(
        () => store.set(record),
        (err: Error) => {
          assert(err instanceof HoleCardError);
          assert.equal(err.code, "INVALID_CARDS");
          return true;
        }
      );
    });
  });

  describe("get()", () => {
    it("should return stored record", () => {
      const record: HoleCardRecord = {
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [10, 25],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now(),
      };

      store.set(record);
      const result = store.get("1", "1", 0);

      assert.deepEqual(result, record);
    });

    it("should return null for non-existent record", () => {
      const result = store.get("1", "1", 0);
      assert.equal(result, null);
    });
  });

  describe("has()", () => {
    it("should return true for existing record", () => {
      const record: HoleCardRecord = {
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [10, 25],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now(),
      };

      store.set(record);
      assert.equal(store.has("1", "1", 0), true);
    });

    it("should return false for non-existent record", () => {
      assert.equal(store.has("1", "1", 0), false);
    });
  });

  describe("delete()", () => {
    it("should delete existing record", () => {
      const record: HoleCardRecord = {
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [10, 25],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now(),
      };

      store.set(record);
      const deleted = store.delete("1", "1", 0);

      assert.equal(deleted, true);
      assert.equal(store.has("1", "1", 0), false);
    });

    it("should return false for non-existent record", () => {
      const deleted = store.delete("1", "1", 0);
      assert.equal(deleted, false);
    });
  });

  describe("deleteHand()", () => {
    it("should delete all records for a hand", () => {
      store.set({
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [10, 25],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now(),
      });

      store.set({
        tableId: "1",
        handId: "1",
        seatIndex: 1,
        cards: [30, 45],
        salt: "def456",
        commitment: "0xdef",
        createdAt: Date.now(),
      });

      const deleted = store.deleteHand("1", "1");

      assert.equal(deleted, 2);
      assert.equal(store.size(), 0);
    });

    it("should delete all 4 seats for a hand", () => {
      for (let seat = 0; seat < 4; seat++) {
        store.set({
          tableId: "1",
          handId: "1",
          seatIndex: seat,
          cards: [seat * 10, seat * 10 + 1] as [number, number],
          salt: `salt-${seat}`,
          commitment: `0x${seat}`,
          createdAt: Date.now(),
        });
      }

      const deleted = store.deleteHand("1", "1");

      assert.equal(deleted, 4);
      assert.equal(store.size(), 0);
    });
  });

  describe("getHand()", () => {
    it("should return all records for a hand", () => {
      store.set({
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [10, 25],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now(),
      });

      store.set({
        tableId: "1",
        handId: "1",
        seatIndex: 1,
        cards: [30, 45],
        salt: "def456",
        commitment: "0xdef",
        createdAt: Date.now(),
      });

      const records = store.getHand("1", "1");

      assert.equal(records.length, 2);
      assert.equal(records[0].seatIndex, 0);
      assert.equal(records[1].seatIndex, 1);
    });

    it("should return all 4 seats for a hand", () => {
      for (let seat = 0; seat < 4; seat++) {
        store.set({
          tableId: "1",
          handId: "1",
          seatIndex: seat,
          cards: [seat * 10, seat * 10 + 1] as [number, number],
          salt: `salt-${seat}`,
          commitment: `0x${seat}`,
          createdAt: Date.now(),
        });
      }

      const records = store.getHand("1", "1");
      assert.equal(records.length, 4);
      for (let seat = 0; seat < 4; seat++) {
        assert.equal(records[seat].seatIndex, seat);
      }
    });

    it("should return empty array for non-existent hand", () => {
      const records = store.getHand("1", "1");
      assert.deepEqual(records, []);
    });
  });

  describe("clear()", () => {
    it("should clear all records", () => {
      store.set({
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [10, 25],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now(),
      });

      store.clear();

      assert.equal(store.size(), 0);
    });
  });

  describe("deleteOlderThan()", () => {
    it("should delete expired records", () => {
      store.set({
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        cards: [10, 25],
        salt: "abc123",
        commitment: "0xabc",
        createdAt: Date.now() - 60000, // 1 minute ago
      });

      store.set({
        tableId: "1",
        handId: "2",
        seatIndex: 0,
        cards: [30, 45],
        salt: "def456",
        commitment: "0xdef",
        createdAt: Date.now(), // now
      });

      const deleted = store.deleteOlderThan(30000); // 30 seconds
      assert.equal(deleted, 1);
      assert.equal(store.size(), 1);
      assert.equal(store.has("1", "2", 0), true);
    });
  });
});

describe("HoleCardStore (file-backed)", () => {
  let store: HoleCardStore;
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `holecard-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
    store = new HoleCardStore(testDir);
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should persist data to files", () => {
    store.set({
      tableId: "1",
      handId: "1",
      seatIndex: 0,
      cards: [10, 25],
      salt: "abc123",
      commitment: "0xabc",
      createdAt: Date.now(),
    });

    // Verify file exists
    assert.ok(existsSync(join(testDir, "1_1.json")));
  });

  it("should survive re-creation (restart durability)", () => {
    // Store data
    store.set({
      tableId: "1",
      handId: "5",
      seatIndex: 0,
      cards: [10, 25],
      salt: "abc123",
      commitment: "0xabc",
      createdAt: Date.now(),
    });

    store.set({
      tableId: "1",
      handId: "5",
      seatIndex: 1,
      cards: [30, 45],
      salt: "def456",
      commitment: "0xdef",
      createdAt: Date.now(),
    });

    store.set({
      tableId: "1",
      handId: "5",
      seatIndex: 2,
      cards: [5, 15],
      salt: "ghi789",
      commitment: "0xghi",
      createdAt: Date.now(),
    });

    store.set({
      tableId: "1",
      handId: "5",
      seatIndex: 3,
      cards: [40, 50],
      salt: "jkl012",
      commitment: "0xjkl",
      createdAt: Date.now(),
    });

    // Create a new store pointing to the same directory (simulating restart)
    const store2 = new HoleCardStore(testDir);

    // Data should still be readable
    const record0 = store2.get("1", "5", 0);
    assert.ok(record0);
    assert.deepEqual(record0.cards, [10, 25]);

    const record1 = store2.get("1", "5", 1);
    assert.ok(record1);
    assert.deepEqual(record1.cards, [30, 45]);

    const record2 = store2.get("1", "5", 2);
    assert.ok(record2);
    assert.deepEqual(record2.cards, [5, 15]);

    const record3 = store2.get("1", "5", 3);
    assert.ok(record3);
    assert.deepEqual(record3.cards, [40, 50]);

    // All 4 seats should be returned
    const hand = store2.getHand("1", "5");
    assert.equal(hand.length, 4);
  });

  it("should handle deleteHand with file cleanup", () => {
    for (let seat = 0; seat < 4; seat++) {
      store.set({
        tableId: "1",
        handId: "1",
        seatIndex: seat,
        cards: [seat * 10, seat * 10 + 1] as [number, number],
        salt: `salt-${seat}`,
        commitment: `0x${seat}`,
        createdAt: Date.now(),
      });
    }

    assert.ok(existsSync(join(testDir, "1_1.json")));

    const deleted = store.deleteHand("1", "1");
    assert.equal(deleted, 4);

    // File should be removed when all seats are deleted
    assert.ok(!existsSync(join(testDir, "1_1.json")));
  });

  it("should reject duplicates in file-backed mode", () => {
    store.set({
      tableId: "1",
      handId: "1",
      seatIndex: 0,
      cards: [10, 25],
      salt: "abc123",
      commitment: "0xabc",
      createdAt: Date.now(),
    });

    assert.throws(
      () =>
        store.set({
          tableId: "1",
          handId: "1",
          seatIndex: 0,
          cards: [30, 45],
          salt: "def456",
          commitment: "0xdef",
          createdAt: Date.now(),
        }),
      (err: Error) => {
        assert(err instanceof HoleCardError);
        assert.equal(err.code, "ALREADY_EXISTS");
        return true;
      }
    );
  });

  it("should handle deleteOlderThan in file-backed mode", () => {
    store.set({
      tableId: "1",
      handId: "1",
      seatIndex: 0,
      cards: [10, 25],
      salt: "abc123",
      commitment: "0xabc",
      createdAt: Date.now() - 60000, // 1 minute ago
    });

    store.set({
      tableId: "1",
      handId: "2",
      seatIndex: 0,
      cards: [30, 45],
      salt: "def456",
      commitment: "0xdef",
      createdAt: Date.now(), // now
    });

    const deleted = store.deleteOlderThan(30000); // 30 seconds
    assert.equal(deleted, 1);
    assert.equal(store.size(), 1);
    assert.equal(store.has("1", "2", 0), true);
  });
});
