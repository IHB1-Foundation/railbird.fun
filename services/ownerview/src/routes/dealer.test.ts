import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { HoleCardStore } from "../holecards/index.js";
import { DealerService } from "../dealer/index.js";

// Simulate the route handler logic for testing
function simulateDealEndpoint(
  dealerService: DealerService,
  params: { tableId: string; handId: string }
): { status: number; body: Record<string, unknown> } {
  const { tableId, handId } = params;

  if (!tableId || typeof tableId !== "string") {
    return {
      status: 400,
      body: { error: "Missing or invalid tableId", code: "INVALID_TABLE_ID" },
    };
  }

  if (!handId || typeof handId !== "string") {
    return {
      status: 400,
      body: { error: "Missing or invalid handId", code: "INVALID_HAND_ID" },
    };
  }

  try {
    const result = dealerService.deal({ tableId, handId });
    return {
      status: 201,
      body: {
        tableId: result.tableId,
        handId: result.handId,
        commitments: result.seats.map((s) => ({
          seatIndex: s.seatIndex,
          commitment: s.commitment,
        })),
      },
    };
  } catch (err) {
    if (err instanceof Error && err.name === "DealerError") {
      const dealerError = err as unknown as { code: string; message: string };
      return {
        status: dealerError.code === "ALREADY_DEALT" ? 409 : 400,
        body: { error: dealerError.message, code: dealerError.code },
      };
    }
    throw err;
  }
}

function simulateCommitmentsEndpoint(
  dealerService: DealerService,
  params: { tableId: string; handId: string }
): { status: number; body: Record<string, unknown> } {
  const { tableId, handId } = params;

  if (!tableId || typeof tableId !== "string") {
    return {
      status: 400,
      body: { error: "Missing or invalid tableId", code: "INVALID_TABLE_ID" },
    };
  }

  if (!handId || typeof handId !== "string") {
    return {
      status: 400,
      body: { error: "Missing or invalid handId", code: "INVALID_HAND_ID" },
    };
  }

  const commitments = dealerService.getCommitments(tableId, handId);

  if (!commitments) {
    return {
      status: 404,
      body: { error: "Hand not dealt", code: "NOT_FOUND" },
    };
  }

  return {
    status: 200,
    body: { tableId, handId, commitments },
  };
}

// Simulate dealer auth middleware
function simulateDealerAuth(
  apiKey: string | undefined,
  authHeader: string | undefined
): { status: number; body: Record<string, unknown> } | null {
  if (!apiKey) return null; // No auth required
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { status: 401, body: { error: "Missing or invalid Authorization header", code: "UNAUTHORIZED" } };
  }
  const token = authHeader.slice(7);
  if (token !== apiKey) {
    return { status: 403, body: { error: "Invalid dealer API key", code: "FORBIDDEN" } };
  }
  return null; // Auth passed
}

describe("Dealer Routes", () => {
  let holeCardStore: HoleCardStore;
  let dealerService: DealerService;

  beforeEach(() => {
    holeCardStore = new HoleCardStore();
    dealerService = new DealerService(holeCardStore, { testSeed: "test-seed", defaultSeatCount: 4 });
  });

  describe("POST /dealer/deal", () => {
    it("should return 201 and commitments for all 4 seats on successful deal", () => {
      const result = simulateDealEndpoint(dealerService, {
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 201);
      assert.equal(result.body.tableId, "1");
      assert.equal(result.body.handId, "1");

      const commitments = result.body.commitments as Array<{
        seatIndex: number;
        commitment: string;
      }>;
      assert.equal(commitments.length, 4);
      assert.equal(commitments[0].seatIndex, 0);
      assert.equal(commitments[1].seatIndex, 1);
      assert.equal(commitments[2].seatIndex, 2);
      assert.equal(commitments[3].seatIndex, 3);
    });

    it("should NOT expose cards in response", () => {
      const result = simulateDealEndpoint(dealerService, {
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 201);

      // Security check: cards should never be in the response
      const bodyStr = JSON.stringify(result.body);
      assert.ok(
        !bodyStr.includes('"cards"'),
        "Response should not contain cards"
      );
    });

    it("should return 409 if already dealt", () => {
      simulateDealEndpoint(dealerService, { tableId: "1", handId: "1" });
      const result = simulateDealEndpoint(dealerService, {
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 409);
      assert.equal(result.body.code, "ALREADY_DEALT");
    });

    it("should return 400 for missing tableId", () => {
      const result = simulateDealEndpoint(dealerService, {
        tableId: "",
        handId: "1",
      });

      assert.equal(result.status, 400);
      assert.equal(result.body.code, "INVALID_TABLE_ID");
    });

    it("should return 400 for missing handId", () => {
      const result = simulateDealEndpoint(dealerService, {
        tableId: "1",
        handId: "",
      });

      assert.equal(result.status, 400);
      assert.equal(result.body.code, "INVALID_HAND_ID");
    });
  });

  describe("GET /dealer/commitments", () => {
    it("should return commitments for all 4 seats of a dealt hand", () => {
      dealerService.deal({ tableId: "1", handId: "1" });
      const result = simulateCommitmentsEndpoint(dealerService, {
        tableId: "1",
        handId: "1",
      });

      assert.equal(result.status, 200);
      assert.equal(result.body.tableId, "1");
      assert.equal(result.body.handId, "1");

      const commitments = result.body.commitments as Array<{
        seatIndex: number;
        commitment: string;
      }>;
      assert.equal(commitments.length, 4);
    });

    it("should return 404 for undealt hand", () => {
      const result = simulateCommitmentsEndpoint(dealerService, {
        tableId: "1",
        handId: "999",
      });

      assert.equal(result.status, 404);
      assert.equal(result.body.code, "NOT_FOUND");
    });
  });

  describe("Security - Information Leakage Prevention", () => {
    it("deal endpoint never exposes hole cards", () => {
      const result = simulateDealEndpoint(dealerService, {
        tableId: "1",
        handId: "1",
      });

      // Check that the response doesn't contain any card values
      const bodyStr = JSON.stringify(result.body);
      assert.ok(!bodyStr.includes('"cards"'), "No cards field");
      assert.ok(!bodyStr.includes('"salt"'), "No salt field");

      // Verify cards are stored but not returned
      const storedCards = holeCardStore.get("1", "1", 0);
      assert.ok(storedCards, "Cards should be stored");
      assert.ok(storedCards.cards.length === 2, "Two cards stored");
    });

    it("commitments endpoint never exposes cards or salts", () => {
      dealerService.deal({ tableId: "1", handId: "1" });
      const result = simulateCommitmentsEndpoint(dealerService, {
        tableId: "1",
        handId: "1",
      });

      const bodyStr = JSON.stringify(result.body);
      assert.ok(!bodyStr.includes('"cards"'), "No cards field");
      assert.ok(!bodyStr.includes('"salt"'), "No salt field");
    });
  });

  describe("Dealer Auth Middleware", () => {
    const API_KEY = "test-dealer-api-key-secret";

    it("should pass when no API key is configured (local dev)", () => {
      const result = simulateDealerAuth(undefined, undefined);
      assert.equal(result, null);
    });

    it("should return 401 when API key is configured but no auth header", () => {
      const result = simulateDealerAuth(API_KEY, undefined);
      assert.notEqual(result, null);
      assert.equal(result!.status, 401);
      assert.equal(result!.body.code, "UNAUTHORIZED");
    });

    it("should return 401 when auth header is not Bearer", () => {
      const result = simulateDealerAuth(API_KEY, "Basic abc123");
      assert.notEqual(result, null);
      assert.equal(result!.status, 401);
      assert.equal(result!.body.code, "UNAUTHORIZED");
    });

    it("should return 403 when API key is wrong", () => {
      const result = simulateDealerAuth(API_KEY, "Bearer wrong-key");
      assert.notEqual(result, null);
      assert.equal(result!.status, 403);
      assert.equal(result!.body.code, "FORBIDDEN");
    });

    it("should pass when API key matches", () => {
      const result = simulateDealerAuth(API_KEY, `Bearer ${API_KEY}`);
      assert.equal(result, null);
    });
  });

  describe("4-seat dealing", () => {
    it("should deal unique cards to all 4 seats", () => {
      dealerService.deal({ tableId: "1", handId: "1" });

      const allCards: number[] = [];
      for (let seat = 0; seat < 4; seat++) {
        const record = holeCardStore.get("1", "1", seat);
        assert.ok(record, `Seat ${seat} should have cards`);
        assert.equal(record.cards.length, 2, `Seat ${seat} should have 2 cards`);
        allCards.push(...record.cards);
      }

      // All 8 cards should be unique
      const uniqueCards = new Set(allCards);
      assert.equal(uniqueCards.size, 8, "All 8 cards should be unique across 4 seats");
    });

    it("should generate unique commitments for each seat", () => {
      dealerService.deal({ tableId: "1", handId: "1" });

      const commitments = new Set<string>();
      for (let seat = 0; seat < 4; seat++) {
        const record = holeCardStore.get("1", "1", seat);
        assert.ok(record);
        commitments.add(record.commitment);
      }

      assert.equal(commitments.size, 4, "All 4 commitments should be unique");
    });
  });
});
