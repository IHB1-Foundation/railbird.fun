import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
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
});
