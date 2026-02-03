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

describe("Dealer Routes", () => {
  let holeCardStore: HoleCardStore;
  let dealerService: DealerService;

  beforeEach(() => {
    holeCardStore = new HoleCardStore();
    dealerService = new DealerService(holeCardStore, { testSeed: "test-seed" });
  });

  describe("POST /dealer/deal", () => {
    it("should return 201 and commitments on successful deal", () => {
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
      assert.equal(commitments.length, 2);
      assert.equal(commitments[0].seatIndex, 0);
      assert.equal(commitments[1].seatIndex, 1);
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
    it("should return commitments for dealt hand", () => {
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
      assert.equal(commitments.length, 2);
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
});
