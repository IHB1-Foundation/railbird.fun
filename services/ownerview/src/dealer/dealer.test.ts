import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import {
  generateSalt,
  generateCommitment,
  generateUniqueCards,
  dealHoleCards,
  cardToString,
  CardGeneratorError,
} from "./cardGenerator.js";
import { DealerService, DealerError } from "./dealerService.js";
import { decryptHoleCards } from "./eciesEncrypt.js";
import { HoleCardStore } from "../holecards/index.js";

// ============ Test Helpers ============

function generateKeyPair(): { privKey: Uint8Array; pubKey: Uint8Array } {
  const privKey = secp256k1.utils.randomSecretKey();
  const pubKey = secp256k1.getPublicKey(privKey, true);
  return { privKey, pubKey };
}

const TEST_VRF = 0xdeadbeefdeadbeefn;
const TEST_DEALER_SEED =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

/** Build a 4-seat encryptionKeys map with fresh keypairs */
function buildEncryptionKeys(count = 4): { keys: Map<number, Uint8Array>; privKeys: Map<number, Uint8Array> } {
  const keys = new Map<number, Uint8Array>();
  const privKeys = new Map<number, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const { privKey, pubKey } = generateKeyPair();
    keys.set(i, pubKey);
    privKeys.set(i, privKey);
  }
  return { keys, privKeys };
}

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
      const salt1 = "0xa1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
      const salt2 = "0xb2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3";
      const c1 = generateCommitment("1", "1", 0, [10, 25], salt1);
      const c2 = generateCommitment("1", "1", 0, [10, 25], salt2);
      assert.notEqual(c1, c2);
    });
  });

  describe("generateUniqueCards", () => {
    it("should generate requested number of cards", () => {
      assert.equal(generateUniqueCards(4).length, 4);
    });

    it("should generate unique cards", () => {
      assert.equal(new Set(generateUniqueCards(10)).size, 10);
    });

    it("should generate cards in valid range (0-51)", () => {
      for (const card of generateUniqueCards(52)) {
        assert.ok(card >= 0 && card <= 51);
      }
    });

    it("should exclude specified cards", () => {
      const exclude = [0, 1, 2, 3];
      for (const card of generateUniqueCards(4, exclude, "test-seed")) {
        assert.ok(!exclude.includes(card));
      }
    });

    it("should throw for invalid count (0)", () => {
      assert.throws(() => generateUniqueCards(0), CardGeneratorError);
    });

    it("should throw for invalid count (> 52)", () => {
      assert.throws(() => generateUniqueCards(53), CardGeneratorError);
    });

    it("should throw when not enough cards available", () => {
      const exclude = Array.from({ length: 50 }, (_, i) => i);
      assert.throws(() => generateUniqueCards(4, exclude), CardGeneratorError);
    });

    it("should be deterministic with seed", () => {
      assert.deepEqual(generateUniqueCards(4, [], "seed"), generateUniqueCards(4, [], "seed"));
    });
  });

  describe("dealHoleCards", () => {
    it("should deal 2 cards to each seat", () => {
      const holeCards = dealHoleCards(2, 2, "test");
      assert.equal(holeCards.length, 2);
      assert.equal(holeCards[0].length, 2);
    });

    it("should deal unique cards across all seats", () => {
      const all = dealHoleCards(2, 2, "test").flat();
      assert.equal(new Set(all).size, 4);
    });
  });

  describe("cardToString", () => {
    it("card 0 → 2c", () => assert.equal(cardToString(0), "2c"));
    it("card 12 → Ac", () => assert.equal(cardToString(12), "Ac"));
    it("card 13 → 2d", () => assert.equal(cardToString(13), "2d"));
    it("card 51 → As", () => assert.equal(cardToString(51), "As"));
  });
});

describe("DealerService", () => {
  let dealerService: DealerService;
  let holeCardStore: HoleCardStore;

  beforeEach(() => {
    holeCardStore = new HoleCardStore();
    dealerService = new DealerService(holeCardStore, { testDealerSeed: TEST_DEALER_SEED });
  });

  describe("deal", () => {
    it("should deal cards for a new hand (4 seats)", async () => {
      const { keys } = buildEncryptionKeys(4);
      const result = await dealerService.deal({
        tableId: "1",
        handId: "1",
        vrfRandomness: TEST_VRF,
        dealerSeed: TEST_DEALER_SEED,
        encryptionKeys: keys,
      });

      assert.equal(result.tableId, "1");
      assert.equal(result.handId, "1");
      assert.equal(result.seats.length, 4);
      assert.match(result.dealerSeedCommit, /^0x[0-9a-f]{64}$/);
    });

    it("should store encrypted cards in hole card store (no plaintext)", async () => {
      const { keys } = buildEncryptionKeys(4);
      await dealerService.deal({
        tableId: "1",
        handId: "1",
        vrfRandomness: TEST_VRF,
        dealerSeed: TEST_DEALER_SEED,
        encryptionKeys: keys,
      });

      for (let seat = 0; seat < 4; seat++) {
        const record = holeCardStore.get("1", "1", seat);
        assert.ok(record, `Seat ${seat} should be stored`);
        assert.ok(record.encryptedCards, "must have encryptedCards");
        assert.ok(record.encryptedCards.ciphertext, "must have ciphertext");
        // No plaintext cards field
        assert.ok(!("cards" in record), "must NOT have plaintext cards");
      }
    });

    it("result seats should have no plaintext cards", async () => {
      const { keys } = buildEncryptionKeys(4);
      const result = await dealerService.deal({
        tableId: "1",
        handId: "1",
        vrfRandomness: TEST_VRF,
        dealerSeed: TEST_DEALER_SEED,
        encryptionKeys: keys,
      });

      for (const seat of result.seats) {
        assert.ok(!("cards" in seat), "result seat must NOT have plaintext cards");
        assert.ok(seat.encryptedCards, "result seat must have encryptedCards");
        assert.ok(seat.commitment, "result seat must have commitment");
      }
    });

    it("each seat gets different encrypted payload (different cards)", async () => {
      const { keys } = buildEncryptionKeys(4);
      const result = await dealerService.deal({
        tableId: "1",
        handId: "1",
        vrfRandomness: TEST_VRF,
        dealerSeed: TEST_DEALER_SEED,
        encryptionKeys: keys,
      });

      const ciphertexts = result.seats.map((s) => s.encryptedCards.ciphertext);
      assert.equal(new Set(ciphertexts).size, 4, "each seat ciphertext must differ");
    });

    it("should throw if already dealt", async () => {
      const { keys } = buildEncryptionKeys(4);
      const params = {
        tableId: "1", handId: "1",
        vrfRandomness: TEST_VRF, dealerSeed: TEST_DEALER_SEED, encryptionKeys: keys,
      };
      await dealerService.deal(params);
      await assert.rejects(() => dealerService.deal(params), DealerError);
    });

    it("should allow dealing different hands", async () => {
      const { keys } = buildEncryptionKeys(4);
      const r1 = await dealerService.deal({
        tableId: "1", handId: "1",
        vrfRandomness: TEST_VRF, dealerSeed: TEST_DEALER_SEED, encryptionKeys: keys,
      });
      const r2 = await dealerService.deal({
        tableId: "1", handId: "2",
        vrfRandomness: TEST_VRF + 1n, dealerSeed: TEST_DEALER_SEED, encryptionKeys: keys,
      });
      assert.equal(r1.handId, "1");
      assert.equal(r2.handId, "2");
    });

    it("should throw for missing tableId", async () => {
      const { keys } = buildEncryptionKeys(4);
      await assert.rejects(
        () => dealerService.deal({ tableId: "", handId: "1", vrfRandomness: TEST_VRF, dealerSeed: TEST_DEALER_SEED, encryptionKeys: keys }),
        DealerError
      );
    });

    it("should throw for empty encryptionKeys", async () => {
      await assert.rejects(
        () => dealerService.deal({
          tableId: "1", handId: "1",
          vrfRandomness: TEST_VRF, dealerSeed: TEST_DEALER_SEED,
          encryptionKeys: new Map(),
        }),
        DealerError
      );
    });
  });

  describe("getCommitments", () => {
    it("should return commitments for dealt hand", async () => {
      const { keys } = buildEncryptionKeys(4);
      await dealerService.deal({
        tableId: "1", handId: "1",
        vrfRandomness: TEST_VRF, dealerSeed: TEST_DEALER_SEED, encryptionKeys: keys,
      });
      const commitments = dealerService.getCommitments("1", "1");
      assert.ok(commitments);
      assert.equal(commitments.length, 4);
      for (const c of commitments) {
        assert.match(c.commitment, /^0x[0-9a-f]{64}$/);
      }
    });

    it("should return null for undealt hand", () => {
      assert.equal(dealerService.getCommitments("1", "1"), null);
    });
  });

  describe("getRevealData", () => {
    it("should reconstruct cards and return salt for dealt seat", async () => {
      const { keys } = buildEncryptionKeys(4);
      await dealerService.deal({
        tableId: "1", handId: "1",
        vrfRandomness: TEST_VRF, dealerSeed: TEST_DEALER_SEED, encryptionKeys: keys,
      });
      const revealData = dealerService.getRevealData("1", "1", 0);
      assert.ok(revealData);
      assert.equal(revealData.cards.length, 2);
      assert.ok(revealData.salt.length > 0);
      assert.ok(revealData.dealerSeed.startsWith("0x"));
    });

    it("should return null for undealt seat", () => {
      assert.equal(dealerService.getRevealData("1", "1", 0), null);
    });

    it("reconstructed cards for each seat are unique", async () => {
      const { keys } = buildEncryptionKeys(4);
      await dealerService.deal({
        tableId: "1", handId: "1",
        vrfRandomness: TEST_VRF, dealerSeed: TEST_DEALER_SEED, encryptionKeys: keys,
      });

      const allCards: number[] = [];
      for (let seat = 0; seat < 4; seat++) {
        const data = dealerService.getRevealData("1", "1", seat);
        assert.ok(data);
        allCards.push(...data.cards);
      }
      assert.equal(new Set(allCards).size, 8, "all 8 cards must be unique");
    });
  });

  describe("isHandDealt", () => {
    it("returns false for undealt hand", () => {
      assert.equal(dealerService.isHandDealt("1", "1"), false);
    });

    it("returns true for dealt hand", async () => {
      const { keys } = buildEncryptionKeys(4);
      await dealerService.deal({
        tableId: "1", handId: "1",
        vrfRandomness: TEST_VRF, dealerSeed: TEST_DEALER_SEED, encryptionKeys: keys,
      });
      assert.equal(dealerService.isHandDealt("1", "1"), true);
    });
  });

  describe("cleanupHand", () => {
    it("should remove hole cards for a hand", async () => {
      const { keys } = buildEncryptionKeys(4);
      await dealerService.deal({
        tableId: "1", handId: "1",
        vrfRandomness: TEST_VRF, dealerSeed: TEST_DEALER_SEED, encryptionKeys: keys,
      });
      const deleted = dealerService.cleanupHand("1", "1");
      assert.equal(deleted, 4);
      assert.equal(dealerService.isHandDealt("1", "1"), false);
    });
  });
});

describe("Dealer Integration", () => {
  it("deal → fetch encrypted → decrypt → verify commitment", async () => {
    const holeCardStore = new HoleCardStore();
    const dealerService = new DealerService(holeCardStore, { testDealerSeed: TEST_DEALER_SEED });

    const { keys, privKeys } = buildEncryptionKeys(4);

    // 1. Deal with verifiable shuffle + ECIES
    const dealResult = await dealerService.deal({
      tableId: "100",
      handId: "50",
      vrfRandomness: TEST_VRF,
      dealerSeed: TEST_DEALER_SEED,
      encryptionKeys: keys,
    });

    assert.equal(dealResult.seats.length, 4);

    // 2. Each owner fetches and decrypts their encrypted cards
    for (let seat = 0; seat < 4; seat++) {
      const record = holeCardStore.get("100", "50", seat);
      assert.ok(record, `Seat ${seat} must have a record`);

      // Deserialize hex → Uint8Array
      const hex2ua = (hex: string) => {
        const h = hex.replace(/^0x/, "");
        return Uint8Array.from(Buffer.from(h, "hex"));
      };
      const payload = {
        ephemeralPubKey: hex2ua(record.encryptedCards.ephemeralPubKey),
        iv: hex2ua(record.encryptedCards.iv),
        ciphertext: hex2ua(record.encryptedCards.ciphertext),
        mac: hex2ua(record.encryptedCards.mac),
      };

      const privKey = privKeys.get(seat)!;
      const decrypted = await decryptHoleCards(privKey, payload);

      // 3. Verify decrypted cards match the commitment
      const revealData = dealerService.getRevealData("100", "50", seat);
      assert.ok(revealData, `Seat ${seat} must have reveal data`);
      assert.deepEqual(decrypted, revealData.cards, `Seat ${seat} decrypted cards must match`);

      const recomputed = generateCommitment("100", "50", seat, decrypted, revealData.salt);
      assert.equal(
        recomputed,
        dealResult.seats[seat].commitment,
        `Seat ${seat} commitment must verify`
      );
    }

    // 4. Cleanup
    assert.equal(dealerService.cleanupHand("100", "50"), 4);
  });
});
