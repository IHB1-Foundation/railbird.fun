import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HoleCardStore, HoleCardError } from "./holeCardStore.js";
import type { HoleCardRecord } from "./types.js";

// A minimal valid encrypted payload for test fixtures
const MOCK_ENCRYPTED = {
  ephemeralPubKey: "0x" + "02".padEnd(66, "a"),
  iv: "0x" + "ab".repeat(12),
  ciphertext: "0x0a19",
  mac: "0x" + "ff".repeat(16),
};

function makeRecord(overrides: Partial<HoleCardRecord> = {}): HoleCardRecord {
  return {
    tableId: "1",
    handId: "1",
    seatIndex: 0,
    encryptedCards: MOCK_ENCRYPTED,
    salt: "0x" + "aa".repeat(32),
    commitment: "0x" + "bb".repeat(32),
    createdAt: Date.now(),
    vrfRandomness: "12345678",
    dealerSeed: "0x" + "cc".repeat(32),
    ...overrides,
  };
}

describe("HoleCardStore", () => {
  let store: HoleCardStore;

  beforeEach(() => {
    store = new HoleCardStore();
  });

  describe("set()", () => {
    it("should store hole cards successfully", () => {
      store.set(makeRecord());
      assert.equal(store.size(), 1);
    });

    it("should reject duplicate records", () => {
      const r = makeRecord();
      store.set(r);
      assert.throws(
        () => store.set(r),
        (err: Error) => {
          assert(err instanceof HoleCardError);
          assert.equal(err.code, "ALREADY_EXISTS");
          return true;
        }
      );
    });

    it("should reject record with missing encryptedCards fields", () => {
      const r = makeRecord({ encryptedCards: { ephemeralPubKey: "", iv: "", ciphertext: "", mac: "" } });
      assert.throws(
        () => store.set(r),
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
      const r = makeRecord();
      store.set(r);
      const result = store.get("1", "1", 0);
      assert.deepEqual(result, r);
    });

    it("should return null for non-existent record", () => {
      assert.equal(store.get("1", "1", 0), null);
    });
  });

  describe("has()", () => {
    it("should return true for existing record", () => {
      store.set(makeRecord());
      assert.equal(store.has("1", "1", 0), true);
    });

    it("should return false for non-existent record", () => {
      assert.equal(store.has("1", "1", 0), false);
    });
  });

  describe("delete()", () => {
    it("should delete existing record", () => {
      store.set(makeRecord());
      assert.equal(store.delete("1", "1", 0), true);
      assert.equal(store.has("1", "1", 0), false);
    });

    it("should return false for non-existent record", () => {
      assert.equal(store.delete("1", "1", 0), false);
    });
  });

  describe("deleteHand()", () => {
    it("should delete all records for a hand", () => {
      store.set(makeRecord({ seatIndex: 0 }));
      store.set(makeRecord({ seatIndex: 1 }));
      assert.equal(store.deleteHand("1", "1"), 2);
      assert.equal(store.size(), 0);
    });
  });

  describe("getHand()", () => {
    it("should return all records for a hand sorted by seatIndex", () => {
      store.set(makeRecord({ seatIndex: 1 }));
      store.set(makeRecord({ seatIndex: 0 }));
      const records = store.getHand("1", "1");
      assert.equal(records.length, 2);
      assert.equal(records[0].seatIndex, 0);
      assert.equal(records[1].seatIndex, 1);
    });

    it("should return empty array for non-existent hand", () => {
      assert.deepEqual(store.getHand("1", "1"), []);
    });
  });

  describe("clear()", () => {
    it("should clear all records", () => {
      store.set(makeRecord());
      store.clear();
      assert.equal(store.size(), 0);
    });
  });

  describe("deleteOlderThan()", () => {
    it("should delete expired records", () => {
      store.set(makeRecord({ handId: "1", createdAt: Date.now() - 60000 }));
      store.set(makeRecord({ handId: "2", createdAt: Date.now() }));
      const deleted = store.deleteOlderThan(30000);
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
    store.set(makeRecord());
    assert.ok(existsSync(join(testDir, "1_1.json")));
  });

  it("should survive re-creation (restart durability)", () => {
    for (let seat = 0; seat < 4; seat++) {
      store.set(makeRecord({ seatIndex: seat, handId: "5" }));
    }

    const store2 = new HoleCardStore(testDir);
    const hand = store2.getHand("1", "5");
    assert.equal(hand.length, 4);
    for (let seat = 0; seat < 4; seat++) {
      const r = store2.get("1", "5", seat);
      assert.ok(r, `seat ${seat} should be readable after restart`);
      assert.ok(r.encryptedCards, "encryptedCards must be present after restart");
    }
  });

  it("should handle deleteHand with file cleanup", () => {
    for (let seat = 0; seat < 4; seat++) {
      store.set(makeRecord({ seatIndex: seat }));
    }
    assert.ok(existsSync(join(testDir, "1_1.json")));
    const deleted = store.deleteHand("1", "1");
    assert.equal(deleted, 4);
    assert.ok(!existsSync(join(testDir, "1_1.json")));
  });

  it("should reject duplicates in file-backed mode", () => {
    store.set(makeRecord());
    assert.throws(
      () => store.set(makeRecord()),
      (err: Error) => {
        assert(err instanceof HoleCardError);
        assert.equal(err.code, "ALREADY_EXISTS");
        return true;
      }
    );
  });

  it("should handle deleteOlderThan in file-backed mode", () => {
    store.set(makeRecord({ handId: "1", createdAt: Date.now() - 60000 }));
    store.set(makeRecord({ handId: "2", createdAt: Date.now() }));
    const deleted = store.deleteOlderThan(30000);
    assert.equal(deleted, 1);
    assert.equal(store.size(), 1);
    assert.equal(store.has("1", "2", 0), true);
  });
});
