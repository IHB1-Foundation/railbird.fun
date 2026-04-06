import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { HoleCardStore } from "../holecards/index.js";
import type { Address } from "@playerco/shared";
import type { SeatInfo } from "../chain/index.js";
import type { EncryptedPayloadSerialized } from "../holecards/types.js";

// Mock encrypted payload (does not need to be cryptographically valid for ACL tests)
const MOCK_ENCRYPTED: EncryptedPayloadSerialized = {
  ephemeralPubKey: "0x" + "02".padEnd(66, "a"),
  iv: "0x" + "ab".repeat(12),
  ciphertext: "0x0a19",
  mac: "0x" + "ff".repeat(16),
};

function mockEncrypted(seatIndex: number): EncryptedPayloadSerialized {
  return {
    ephemeralPubKey: "0x02" + String(seatIndex).padStart(64, "0"),
    iv: "0x" + String(seatIndex).padStart(24, "0"),
    ciphertext: "0x" + String(seatIndex).padStart(4, "0"),
    mac: "0x" + String(seatIndex).padStart(32, "0"),
  };
}

// Since Express router internals are hard to test directly,
// we'll test the core logic: HoleCardStore and ownership verification

// Mock ChainService (supports 4 seats)
class MockChainService {
  private seats: Map<number, SeatInfo> = new Map();

  setSeat(seatIndex: number, seat: SeatInfo): void {
    this.seats.set(seatIndex, seat);
  }

  async getSeat(seatIndex: number): Promise<SeatInfo> {
    const seat = this.seats.get(seatIndex);
    if (!seat) {
      throw new Error(`Seat ${seatIndex} not found`);
    }
    return seat;
  }

  async findSeatByOwner(ownerAddress: Address): Promise<number | null> {
    const normalizedOwner = ownerAddress.toLowerCase();
    for (const [index, seat] of this.seats) {
      if (seat.owner.toLowerCase() === normalizedOwner) {
        return index;
      }
    }
    return null;
  }

  async isSeatOwner(seatIndex: number, address: Address): Promise<boolean> {
    const seat = await this.getSeat(seatIndex);
    return seat.owner.toLowerCase() === address.toLowerCase();
  }
}

// Simulate the route handler logic for testing
async function getHoleCardsLogic(
  chainService: MockChainService,
  holeCardStore: HoleCardStore,
  params: {
    wallet: Address;
    tableId: string;
    handId: string;
  }
): Promise<{
  status: number;
  body: Record<string, unknown>;
}> {
  const { wallet, tableId, handId } = params;

  // Find seat by owner
  const seatIndex = await chainService.findSeatByOwner(wallet);

  if (seatIndex === null) {
    return {
      status: 403,
      body: {
        error: "Wallet does not own any seat at this table",
        code: "NOT_SEAT_OWNER",
      },
    };
  }

  // Get hole cards for this seat only
  const record = await holeCardStore.get(tableId, handId, seatIndex);

  if (!record) {
    return {
      status: 404,
      body: {
        error: "Hole cards not found for this hand",
        code: "HOLECARDS_NOT_FOUND",
      },
    };
  }

  // Return encrypted cards — client decrypts locally
  return {
    status: 200,
    body: {
      tableId,
      handId,
      seatIndex,
      encryptedCards: record.encryptedCards,
    },
  };
}

describe("Owner Routes - Hole Cards ACL Logic", () => {
  let chainService: MockChainService;
  let holeCardStore: HoleCardStore;

  const ownerAddress0 = "0x1111111111111111111111111111111111111111" as Address;
  const ownerAddress1 = "0x2222222222222222222222222222222222222222" as Address;
  const ownerAddress2 = "0x3333333333333333333333333333333333333333" as Address;
  const ownerAddress3 = "0x4444444444444444444444444444444444444444" as Address;

  beforeEach(() => {
    chainService = new MockChainService();
    holeCardStore = new HoleCardStore();

    // Setup mock seats (4 seats)
    chainService.setSeat(0, {
      owner: ownerAddress0,
      operator: ownerAddress0,
      stack: 1000n,
      isActive: true,
      currentBet: 0n,
    });

    chainService.setSeat(1, {
      owner: ownerAddress1,
      operator: ownerAddress1,
      stack: 1000n,
      isActive: true,
      currentBet: 0n,
    });

    chainService.setSeat(2, {
      owner: ownerAddress2,
      operator: ownerAddress2,
      stack: 1000n,
      isActive: true,
      currentBet: 0n,
    });

    chainService.setSeat(3, {
      owner: ownerAddress3,
      operator: ownerAddress3,
      stack: 1000n,
      isActive: true,
      currentBet: 0n,
    });
  });

  describe("ACL - seat ownership verification", () => {
    it("should return 403 if wallet does not own any seat", async () => {
      const nonOwnerAddress =
        "0x5555555555555555555555555555555555555555" as Address;

      const result = await getHoleCardsLogic(chainService, holeCardStore, {
        wallet: nonOwnerAddress,
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 403);
      assert.deepEqual(result.body, {
        error: "Wallet does not own any seat at this table",
        code: "NOT_SEAT_OWNER",
      });
    });

    it("should return 404 if hole cards not found", async () => {
      const result = await getHoleCardsLogic(chainService, holeCardStore, {
        wallet: ownerAddress0,
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 404);
      assert.deepEqual(result.body, {
        error: "Hole cards not found for this hand",
        code: "HOLECARDS_NOT_FOUND",
      });
    });

    it("should return encrypted hole cards for authenticated seat owner", async () => {
      // Store encrypted hole cards for seat 0
      await holeCardStore.set({
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        encryptedCards: MOCK_ENCRYPTED,
        salt: "0x" + "aa".repeat(32),
        commitment: "0xabc123",
        createdAt: Date.now(),
        vrfRandomness: "12345" + "cc".repeat(32),
      });

      const result = await getHoleCardsLogic(chainService, holeCardStore, {
        wallet: ownerAddress0,
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.seatIndex, 0);
      assert.ok(result.body.encryptedCards, "response must contain encryptedCards");
      assert.ok(!("cards" in result.body), "response must NOT contain plaintext cards");
    });

    it("should NOT return hole cards for a different seat (ACL check)", async () => {
      // Store encrypted hole cards for seat 1 (owned by ownerAddress1)
      await holeCardStore.set({
        tableId: "1",
        handId: "1",
        seatIndex: 1,
        encryptedCards: mockEncrypted(1),
        salt: "0x" + "aa".repeat(32),
        commitment: "0xdef456",
        createdAt: Date.now(),
        vrfRandomness: "12345" + "cc".repeat(32),
      });

      // Owner of seat 0 tries to get hole cards
      // Should find seat 0 (which has no cards) and return 404
      const result = await getHoleCardsLogic(chainService, holeCardStore, {
        wallet: ownerAddress0,
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 404);
      // Key security check: owner of seat 0 cannot see seat 1's cards
    });

    it("should return correct seat's encrypted cards based on ownership (4 seats)", async () => {
      // Store encrypted hole cards for all 4 seats
      for (let seat = 0; seat < 4; seat++) {
        await holeCardStore.set({
          tableId: "1",
          handId: "1",
          seatIndex: seat,
          encryptedCards: mockEncrypted(seat),
          salt: "0x" + "aa".repeat(32),
          commitment: `0x${seat.toString().padStart(64, "0")}`,
          createdAt: Date.now(),
          vrfRandomness: "12345" + "cc".repeat(32),
        });
      }

      const owners = [ownerAddress0, ownerAddress1, ownerAddress2, ownerAddress3];

      for (let seat = 0; seat < 4; seat++) {
        const result = await getHoleCardsLogic(chainService, holeCardStore, {
          wallet: owners[seat],
          tableId: "1",
          handId: "1",
        });

        assert.equal(result.status, 200);
        assert.equal(result.body.seatIndex, seat);
        assert.ok(result.body.encryptedCards, `seat ${seat} must have encryptedCards`);
        assert.ok(!("cards" in result.body), `seat ${seat} must NOT have plaintext cards`);
      }
    });

    it("should NOT return salt or commitment in response", async () => {
      await holeCardStore.set({
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        encryptedCards: MOCK_ENCRYPTED,
        salt: "0x" + "aa".repeat(32),
        commitment: "0xcommitment",
        createdAt: Date.now(),
        vrfRandomness: "12345" + "cc".repeat(32),
      });

      const result = await getHoleCardsLogic(chainService, holeCardStore, {
        wallet: ownerAddress0,
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 200);

      // Security check: salt, commitment, and createdAt should NOT be in response
      assert.equal("salt" in result.body, false, "Response should not contain salt");
      assert.equal("commitment" in result.body, false, "Response should not contain commitment");
      assert.equal("createdAt" in result.body, false, "Response should not contain createdAt");
    });

    it("should handle case-insensitive address matching", async () => {
      await holeCardStore.set({
        tableId: "1",
        handId: "1",
        seatIndex: 0,
        encryptedCards: MOCK_ENCRYPTED,
        salt: "0x" + "aa".repeat(32),
        commitment: "0xabc",
        createdAt: Date.now(),
        vrfRandomness: "12345" + "cc".repeat(32),
      });

      // Use uppercase address
      const upperCaseOwner =
        "0x1111111111111111111111111111111111111111".toUpperCase() as Address;

      const result = await getHoleCardsLogic(chainService, holeCardStore, {
        wallet: upperCaseOwner,
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 200);
      assert.ok(result.body.encryptedCards, "response must contain encryptedCards");
    });
  });

  describe("Security - information leakage prevention", () => {
    it("owner cannot access other owner's hole cards even if they know handId", async () => {
      // All 4 players have hole cards
      for (let seat = 0; seat < 4; seat++) {
        await holeCardStore.set({
          tableId: "1",
          handId: "1",
          seatIndex: seat,
          encryptedCards: mockEncrypted(seat),
          salt: "0x" + "aa".repeat(32),
          commitment: `0x${seat.toString().padStart(64, "0")}`,
          createdAt: Date.now(),
          vrfRandomness: "12345" + "cc".repeat(32),
        });
      }

      // Owner of seat 0 should only see their own encrypted cards
      const result = await getHoleCardsLogic(chainService, holeCardStore, {
        wallet: ownerAddress0,
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.seatIndex, 0);
      // Response must have encryptedCards for seat 0, not any other seat
      assert.ok(result.body.encryptedCards, "must have encryptedCards");
      assert.ok(!("cards" in result.body), "must NOT have plaintext cards");
    });

    it("ownership is determined by on-chain lookup, not request params", async () => {
      // Store cards for seat 3
      await holeCardStore.set({
        tableId: "1",
        handId: "1",
        seatIndex: 3,
        encryptedCards: mockEncrypted(3),
        salt: "0x" + "aa".repeat(32),
        commitment: "0xabc",
        createdAt: Date.now(),
        vrfRandomness: "12345" + "cc".repeat(32),
      });

      // Owner of seat 0 cannot access seat 3's cards
      // The system looks up which seat the wallet owns, not which seat was requested
      const result = await getHoleCardsLogic(chainService, holeCardStore, {
        wallet: ownerAddress0,
        tableId: "1",
        handId: "1",
      });

      // Should return 404 (no cards for seat 0), NOT seat 3's cards
      assert.equal(result.status, 404);
    });
  });
});
