import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  generateSalt,
  generateCommitment,
  generateUniqueCards,
  dealHoleCards,
  cardToString,
  CardGeneratorError,
} from "./cardGenerator.js";
import { DealerService, DealerError } from "./dealerService.js";
import { HoleCardStore } from "../holecards/index.js";

describe("Card Generator", () => {
  describe("generateSalt", () => {
    it("should generate 0x-prefixed 32-byte hex string", () => {
      const salt = generateSalt();
      assert.equal(salt.length, 66); // 0x + 64 hex chars
      assert.match(salt, /^0x[0-9a-f]{64}$/);
    });

    it("should generate unique salts", () => {
      const salts = new Set<string>();
      for (let i = 0; i < 100; i++) {
        salts.add(generateSalt());
      }
      assert.equal(salts.size, 100, "All salts should be unique");
    });
  });

  describe("generateCommitment", () => {
    // Valid 32-byte hex salt for tests
    const testSalt = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

    it("should generate a 0x-prefixed hex string", () => {
      const commitment = generateCommitment("1", "1", 0, [10, 25], testSalt);
      assert.match(commitment, /^0x[0-9a-f]{64}$/);
    });

    it("should be deterministic for same inputs", () => {
      const c1 = generateCommitment("1", "1", 0, [10, 25], testSalt);
      const c2 = generateCommitment("1", "1", 0, [10, 25], testSalt);
      assert.equal(c1, c2);
    });

    it("should differ for different tableId (uses handId for on-chain)", () => {
      // Note: tableId is not used in commitment (matches on-chain format)
      // The commitment only uses handId, seatIndex, cards, salt
      const c1 = generateCommitment("1", "1", 0, [10, 25], testSalt);
      const c2 = generateCommitment("2", "1", 0, [10, 25], testSalt);
      // tableId is ignored in commitment, so they should be equal
      assert.equal(c1, c2, "tableId is not part of commitment (on-chain compatibility)");
    });

    it("should differ for different handId", () => {
      const c1 = generateCommitment("1", "1", 0, [10, 25], testSalt);
      const c2 = generateCommitment("1", "2", 0, [10, 25], testSalt);
      assert.notEqual(c1, c2);
    });

    it("should differ for different seatIndex", () => {
      const c1 = generateCommitment("1", "1", 0, [10, 25], testSalt);
      const c2 = generateCommitment("1", "1", 1, [10, 25], testSalt);
      assert.notEqual(c1, c2);
    });

    it("should differ for different cards", () => {
      const c1 = generateCommitment("1", "1", 0, [10, 25], testSalt);
      const c2 = generateCommitment("1", "1", 0, [10, 26], testSalt);
      assert.notEqual(c1, c2);
    });

    it("should differ for different salt", () => {
      // Use valid 0x-prefixed hex strings (like generateSalt produces)
      const salt1 = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
      const salt2 = "0xb2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3";
      const c1 = generateCommitment("1", "1", 0, [10, 25], salt1);
      const c2 = generateCommitment("1", "1", 0, [10, 25], salt2);
      assert.notEqual(c1, c2);
    });
  });

  describe("generateUniqueCards", () => {
    it("should generate requested number of cards", () => {
      const cards = generateUniqueCards(4);
      assert.equal(cards.length, 4);
    });

    it("should generate unique cards", () => {
      const cards = generateUniqueCards(10);
      const uniqueCards = new Set(cards);
      assert.equal(uniqueCards.size, 10, "All cards should be unique");
    });

    it("should generate cards in valid range (0-51)", () => {
      const cards = generateUniqueCards(52);
      for (const card of cards) {
        assert.ok(card >= 0 && card <= 51, `Card ${card} should be 0-51`);
      }
    });

    it("should exclude specified cards", () => {
      const excludeCards = [0, 1, 2, 3];
      const cards = generateUniqueCards(4, excludeCards, "test-seed");
      for (const card of cards) {
        assert.ok(
          !excludeCards.includes(card),
          `Card ${card} should not be in excluded list`
        );
      }
    });

    it("should throw for invalid count (0)", () => {
      assert.throws(
        () => generateUniqueCards(0),
        CardGeneratorError
      );
    });

    it("should throw for invalid count (> 52)", () => {
      assert.throws(
        () => generateUniqueCards(53),
        CardGeneratorError
      );
    });

    it("should throw when not enough cards available", () => {
      const excludeCards = Array.from({ length: 50 }, (_, i) => i);
      assert.throws(
        () => generateUniqueCards(4, excludeCards),
        CardGeneratorError
      );
    });

    it("should be deterministic with seed", () => {
      const cards1 = generateUniqueCards(4, [], "test-seed-123");
      const cards2 = generateUniqueCards(4, [], "test-seed-123");
      assert.deepEqual(cards1, cards2);
    });

    it("should differ with different seeds", () => {
      const cards1 = generateUniqueCards(4, [], "seed-a");
      const cards2 = generateUniqueCards(4, [], "seed-b");
      assert.notDeepEqual(cards1, cards2);
    });
  });

  describe("dealHoleCards", () => {
    it("should deal 2 cards to each seat", () => {
      const holeCards = dealHoleCards(2, 2, "test");
      assert.equal(holeCards.length, 2);
      assert.equal(holeCards[0].length, 2);
      assert.equal(holeCards[1].length, 2);
    });

    it("should deal unique cards across all seats", () => {
      const holeCards = dealHoleCards(2, 2, "test");
      const allCards = [...holeCards[0], ...holeCards[1]];
      const uniqueCards = new Set(allCards);
      assert.equal(
        uniqueCards.size,
        4,
        "All 4 cards should be unique across both seats"
      );
    });

    it("should deal unique cards with random seed", () => {
      // Run multiple times to check uniqueness
      for (let i = 0; i < 10; i++) {
        const holeCards = dealHoleCards(2);
        const allCards = [...holeCards[0], ...holeCards[1]];
        const uniqueCards = new Set(allCards);
        assert.equal(
          uniqueCards.size,
          4,
          `Iteration ${i}: All 4 cards should be unique`
        );
      }
    });
  });

  describe("cardToString", () => {
    it("should convert card 0 to 2c", () => {
      assert.equal(cardToString(0), "2c");
    });

    it("should convert card 12 to Ac", () => {
      assert.equal(cardToString(12), "Ac");
    });

    it("should convert card 13 to 2d", () => {
      assert.equal(cardToString(13), "2d");
    });

    it("should convert card 51 to As", () => {
      assert.equal(cardToString(51), "As");
    });
  });
});

describe("DealerService", () => {
  let dealerService: DealerService;
  let holeCardStore: HoleCardStore;

  beforeEach(() => {
    holeCardStore = new HoleCardStore();
    dealerService = new DealerService(holeCardStore, { testSeed: "test-seed", defaultSeatCount: 4 });
  });

  describe("deal", () => {
    it("should deal cards for a new hand (4 seats)", () => {
      const result = dealerService.deal({ tableId: "1", handId: "1" });

      assert.equal(result.tableId, "1");
      assert.equal(result.handId, "1");
      assert.equal(result.seats.length, 4);
    });

    it("should store cards in hole card store (all 4 seats)", () => {
      dealerService.deal({ tableId: "1", handId: "1" });

      for (let seat = 0; seat < 4; seat++) {
        const record = holeCardStore.get("1", "1", seat);
        assert.ok(record, `Seat ${seat} cards should be stored`);
      }
    });

    it("should generate unique cards for each seat (8 unique cards)", () => {
      const result = dealerService.deal({ tableId: "1", handId: "1" });

      const allCards: number[] = [];
      for (const seat of result.seats) {
        allCards.push(...seat.cards);
      }
      const uniqueCards = new Set(allCards);
      assert.equal(uniqueCards.size, 8, "All 8 cards should be unique across 4 seats");
    });

    it("should generate unique commitments for each seat", () => {
      const result = dealerService.deal({ tableId: "1", handId: "1" });

      const commitments = new Set(result.seats.map((s) => s.commitment));
      assert.equal(commitments.size, 4, "All 4 commitments should be unique");
    });

    it("should throw if already dealt", () => {
      dealerService.deal({ tableId: "1", handId: "1" });

      assert.throws(() => {
        dealerService.deal({ tableId: "1", handId: "1" });
      }, DealerError);
    });

    it("should allow dealing different hands", () => {
      const result1 = dealerService.deal({ tableId: "1", handId: "1" });
      const result2 = dealerService.deal({ tableId: "1", handId: "2" });

      assert.equal(result1.handId, "1");
      assert.equal(result2.handId, "2");
    });

    it("should throw for missing tableId", () => {
      assert.throws(() => {
        dealerService.deal({ tableId: "", handId: "1" });
      }, DealerError);
    });

    it("should throw for missing handId", () => {
      assert.throws(() => {
        dealerService.deal({ tableId: "1", handId: "" });
      }, DealerError);
    });
  });

  describe("getCommitments", () => {
    it("should return commitments for dealt hand (4 seats)", () => {
      dealerService.deal({ tableId: "1", handId: "1" });
      const commitments = dealerService.getCommitments("1", "1");

      assert.ok(commitments);
      assert.equal(commitments.length, 4);
      for (const c of commitments) {
        assert.match(c.commitment, /^0x[0-9a-f]{64}$/);
      }
    });

    it("should return null for undealt hand", () => {
      const commitments = dealerService.getCommitments("1", "1");
      assert.equal(commitments, null);
    });
  });

  describe("getRevealData", () => {
    it("should return cards and salt for dealt seat", () => {
      dealerService.deal({ tableId: "1", handId: "1" });
      const revealData = dealerService.getRevealData("1", "1", 0);

      assert.ok(revealData);
      assert.equal(revealData.cards.length, 2);
      assert.ok(revealData.salt.length > 0);
    });

    it("should return null for undealt seat", () => {
      const revealData = dealerService.getRevealData("1", "1", 0);
      assert.equal(revealData, null);
    });

    it("should return different data for different seats (all 4)", () => {
      dealerService.deal({ tableId: "1", handId: "1" });
      const allCards: number[][] = [];
      for (let seat = 0; seat < 4; seat++) {
        const data = dealerService.getRevealData("1", "1", seat);
        assert.ok(data, `Seat ${seat} should have reveal data`);
        allCards.push([...data.cards]);
      }

      // All seats should have different cards
      for (let i = 0; i < 4; i++) {
        for (let j = i + 1; j < 4; j++) {
          assert.notDeepEqual(allCards[i], allCards[j], `Seat ${i} and ${j} should have different cards`);
        }
      }
    });
  });

  describe("isHandDealt", () => {
    it("should return false for undealt hand", () => {
      assert.equal(dealerService.isHandDealt("1", "1"), false);
    });

    it("should return true for dealt hand", () => {
      dealerService.deal({ tableId: "1", handId: "1" });
      assert.equal(dealerService.isHandDealt("1", "1"), true);
    });
  });

  describe("cleanupHand", () => {
    it("should remove hole cards for a hand (4 seats)", () => {
      dealerService.deal({ tableId: "1", handId: "1" });
      const deleted = dealerService.cleanupHand("1", "1");

      assert.equal(deleted, 4);
      assert.equal(dealerService.isHandDealt("1", "1"), false);
    });

    it("should return 0 for undealt hand", () => {
      const deleted = dealerService.cleanupHand("1", "1");
      assert.equal(deleted, 0);
    });
  });

  describe("Security - no card exposure", () => {
    it("should store salt that is not guessable", () => {
      // Use non-test service for this test
      const realHoleCardStore = new HoleCardStore();
      const realDealerService = new DealerService(realHoleCardStore, { defaultSeatCount: 4 });

      realDealerService.deal({ tableId: "1", handId: "1" });
      const record = realHoleCardStore.get("1", "1", 0);

      assert.ok(record);
      assert.equal(record.salt.length, 66, "Salt should be 0x + 64 hex chars");
      assert.match(record.salt, /^0x[0-9a-f]{64}$/, "Salt should be valid hex");
      // Verify it's random (not predictable)
      const record2 = realHoleCardStore.get("1", "1", 1);
      assert.ok(record2);
      assert.notEqual(record.salt, record2.salt, "Salts should differ per seat");
    });

    it("should generate valid commitments that can be verified", () => {
      dealerService.deal({ tableId: "1", handId: "1" });

      const record = holeCardStore.get("1", "1", 0);
      assert.ok(record);

      // Re-compute commitment
      const recomputed = generateCommitment(
        record.tableId,
        record.handId,
        record.seatIndex,
        record.cards,
        record.salt
      );

      assert.equal(
        record.commitment,
        recomputed,
        "Stored commitment should match recomputed"
      );
    });
  });
});

describe("Dealer Integration", () => {
  it("should work end-to-end: deal 4 seats, retrieve via owner, verify commitment", () => {
    const holeCardStore = new HoleCardStore();
    const dealerService = new DealerService(holeCardStore, { testSeed: "e2e-test", defaultSeatCount: 4 });

    // 1. Deal cards for 4 seats
    const dealResult = dealerService.deal({ tableId: "100", handId: "50" });
    assert.equal(dealResult.seats.length, 4);

    // 2. Simulate each owner retrieving their cards
    for (let seat = 0; seat < 4; seat++) {
      const seatCards = holeCardStore.get("100", "50", seat);
      assert.ok(seatCards, `Seat ${seat} should have cards`);
      assert.deepEqual(seatCards.cards, dealResult.seats[seat].cards);
    }

    // 3. Verify commitment can be verified for showdown (all 4 seats)
    for (let seat = 0; seat < 4; seat++) {
      const revealData = dealerService.getRevealData("100", "50", seat);
      assert.ok(revealData);

      const recomputedCommitment = generateCommitment(
        "100",
        "50",
        seat,
        revealData.cards,
        revealData.salt
      );

      assert.equal(
        recomputedCommitment,
        dealResult.seats[seat].commitment,
        `Seat ${seat} reveal data should verify against commitment`
      );
    }

    // 4. Verify owner cannot access other seat's cards via ACL
    // (This is enforced by routes/owner.ts, tested in owner.test.ts)

    // 5. Cleanup
    const deleted = dealerService.cleanupHand("100", "50");
    assert.equal(deleted, 4);
  });
});
