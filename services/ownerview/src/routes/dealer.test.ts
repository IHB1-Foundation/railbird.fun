import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { secp256k1 } from "@noble/curves/secp256k1.js";
import { HoleCardStore } from "../holecards/index.js";
import { DealerService, DealerError } from "../dealer/index.js";

// ============ Test helpers ============

const TEST_VRF = 0xdeadbeefdeadbeefn;
const TEST_DEALER_SEED =
  "0x0000000000000000000000000000000000000000000000000000000000000001" as const;

function buildEncryptionKeys(count = 4): Map<number, Uint8Array> {
  const keys = new Map<number, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const priv = secp256k1.utils.randomSecretKey();
    keys.set(i, secp256k1.getPublicKey(priv, true));
  }
  return keys;
}

async function simulateDealEndpoint(
  dealerService: DealerService,
  params: { tableId: string; handId: string; encryptionKeys?: Map<number, Uint8Array> }
): Promise<{ status: number; body: Record<string, unknown> }> {
  const { tableId, handId } = params;

  if (!tableId) return { status: 400, body: { code: "INVALID_TABLE_ID" } };
  if (!handId) return { status: 400, body: { code: "INVALID_HAND_ID" } };

  const encryptionKeys = params.encryptionKeys ?? buildEncryptionKeys(4);

  try {
    const result = await dealerService.deal({
      tableId,
      handId,
      vrfRandomness: TEST_VRF,
      dealerSeed: TEST_DEALER_SEED,
      encryptionKeys,
    });
    return {
      status: 201,
      body: {
        tableId: result.tableId,
        handId: result.handId,
        dealerSeedCommit: result.dealerSeedCommit,
        commitments: result.seats.map((s) => ({ seatIndex: s.seatIndex, commitment: s.commitment })),
      },
    };
  } catch (err) {
    if (err instanceof DealerError) {
      return { status: err.code === "ALREADY_DEALT" ? 409 : 400, body: { code: err.code, error: err.message } };
    }
    throw err;
  }
}

function simulateCommitmentsEndpoint(
  dealerService: DealerService,
  params: { tableId: string; handId: string }
): { status: number; body: Record<string, unknown> } {
  const { tableId, handId } = params;
  if (!tableId) return { status: 400, body: { code: "INVALID_TABLE_ID" } };
  if (!handId) return { status: 400, body: { code: "INVALID_HAND_ID" } };

  const commitments = dealerService.getCommitments(tableId, handId);
  if (!commitments) return { status: 404, body: { code: "NOT_FOUND" } };
  return { status: 200, body: { tableId, handId, commitments } };
}

function simulateDealerAuth(
  apiKey: string | undefined,
  authHeader: string | undefined
): { status: number; body: Record<string, unknown> } | null {
  if (!apiKey) return null;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { status: 401, body: { code: "UNAUTHORIZED" } };
  }
  if (authHeader.slice(7) !== apiKey) {
    return { status: 403, body: { code: "FORBIDDEN" } };
  }
  return null;
}

// ============ Tests ============

describe("Dealer Routes", () => {
  let holeCardStore: HoleCardStore;
  let dealerService: DealerService;

  beforeEach(() => {
    holeCardStore = new HoleCardStore();
    dealerService = new DealerService(holeCardStore, { testDealerSeed: TEST_DEALER_SEED });
  });

  describe("POST /dealer/deal", () => {
    it("should return 201 and commitments for all 4 seats on successful deal", async () => {
      const result = await simulateDealEndpoint(dealerService, { tableId: "1", handId: "1" });

      assert.equal(result.status, 201);
      assert.equal(result.body.tableId, "1");
      assert.equal(result.body.handId, "1");

      const commitments = result.body.commitments as Array<{ seatIndex: number; commitment: string }>;
      assert.equal(commitments.length, 4);
    });

    it("should NOT expose plaintext cards in response", async () => {
      const result = await simulateDealEndpoint(dealerService, { tableId: "1", handId: "1" });
      assert.equal(result.status, 201);
      const bodyStr = JSON.stringify(result.body);
      assert.ok(!bodyStr.includes('"cards"'), "response must not contain plaintext cards");
    });

    it("should return 409 if already dealt", async () => {
      const keys = buildEncryptionKeys(4);
      await simulateDealEndpoint(dealerService, { tableId: "1", handId: "1", encryptionKeys: keys });
      const result = await simulateDealEndpoint(dealerService, { tableId: "1", handId: "1", encryptionKeys: keys });
      assert.equal(result.status, 409);
      assert.equal(result.body.code, "ALREADY_DEALT");
    });

    it("should return 400 for missing tableId", async () => {
      const result = await simulateDealEndpoint(dealerService, { tableId: "", handId: "1" });
      assert.equal(result.status, 400);
      assert.equal(result.body.code, "INVALID_TABLE_ID");
    });

    it("should return 400 for missing handId", async () => {
      const result = await simulateDealEndpoint(dealerService, { tableId: "1", handId: "" });
      assert.equal(result.status, 400);
      assert.equal(result.body.code, "INVALID_HAND_ID");
    });
  });

  describe("GET /dealer/commitments", () => {
    it("should return commitments for all 4 seats of a dealt hand", async () => {
      await simulateDealEndpoint(dealerService, { tableId: "1", handId: "1" });
      const result = simulateCommitmentsEndpoint(dealerService, { tableId: "1", handId: "1" });

      assert.equal(result.status, 200);
      const commitments = result.body.commitments as Array<{ seatIndex: number; commitment: string }>;
      assert.equal(commitments.length, 4);
    });

    it("should return 404 for undealt hand", () => {
      const result = simulateCommitmentsEndpoint(dealerService, { tableId: "1", handId: "999" });
      assert.equal(result.status, 404);
    });
  });

  describe("Security - Information Leakage Prevention", () => {
    it("deal endpoint never exposes hole cards or salt", async () => {
      const result = await simulateDealEndpoint(dealerService, { tableId: "1", handId: "1" });
      const bodyStr = JSON.stringify(result.body);
      assert.ok(!bodyStr.includes('"cards"'), "No plaintext cards");
      assert.ok(!bodyStr.includes('"salt"'), "No salt");

      // Stored records must also not have plaintext cards
      const stored = holeCardStore.get("1", "1", 0);
      assert.ok(stored, "record must be stored");
      assert.ok(stored.encryptedCards, "encryptedCards must be present");
      assert.ok(!("cards" in stored), "stored record must not have plaintext cards");
    });

    it("commitments endpoint never exposes cards or salts", async () => {
      await simulateDealEndpoint(dealerService, { tableId: "1", handId: "1" });
      const result = simulateCommitmentsEndpoint(dealerService, { tableId: "1", handId: "1" });
      const bodyStr = JSON.stringify(result.body);
      assert.ok(!bodyStr.includes('"cards"'), "No cards field");
      assert.ok(!bodyStr.includes('"salt"'), "No salt field");
    });
  });

  describe("Dealer Auth Middleware", () => {
    const API_KEY = "test-dealer-api-key-secret";

    it("should pass when no API key is configured", () => {
      assert.equal(simulateDealerAuth(undefined, undefined), null);
    });

    it("should return 401 when API key configured but no auth header", () => {
      assert.equal(simulateDealerAuth(API_KEY, undefined)!.status, 401);
    });

    it("should return 401 when auth header is not Bearer", () => {
      assert.equal(simulateDealerAuth(API_KEY, "Basic abc123")!.status, 401);
    });

    it("should return 403 when API key is wrong", () => {
      assert.equal(simulateDealerAuth(API_KEY, "Bearer wrong-key")!.status, 403);
    });

    it("should pass when API key matches", () => {
      assert.equal(simulateDealerAuth(API_KEY, `Bearer ${API_KEY}`), null);
    });
  });

  describe("4-seat dealing", () => {
    it("should store encrypted cards for all 4 seats (no plaintext)", async () => {
      await simulateDealEndpoint(dealerService, { tableId: "1", handId: "1" });

      for (let seat = 0; seat < 4; seat++) {
        const record = holeCardStore.get("1", "1", seat);
        assert.ok(record, `Seat ${seat} must have a record`);
        assert.ok(record.encryptedCards, `Seat ${seat} must have encryptedCards`);
        assert.ok(!("cards" in record), `Seat ${seat} must NOT have plaintext cards`);
      }
    });

    it("should generate unique commitments for each seat", async () => {
      await simulateDealEndpoint(dealerService, { tableId: "1", handId: "1" });

      const commitments = new Set<string>();
      for (let seat = 0; seat < 4; seat++) {
        const record = holeCardStore.get("1", "1", seat);
        assert.ok(record);
        commitments.add(record.commitment);
      }
      assert.equal(commitments.size, 4, "All 4 commitments must be unique");
    });
  });
});
