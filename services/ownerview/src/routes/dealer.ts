import { timingSafeEqual } from "crypto";
import { Router, type Request, type Response, type NextFunction } from "express";
import { DealerService, DealerError } from "../dealer/index.js";

/**
 * Middleware that validates DEALER_API_KEY on privileged dealer endpoints.
 * Expects: Authorization: Bearer <api-key>
 */
function createDealerAuthMiddleware(apiKey: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({
        error: "Missing or invalid Authorization header",
        code: "UNAUTHORIZED",
      });
      return;
    }

    const token = authHeader.slice(7);
    const tokenBuf = Buffer.from(token);
    const keyBuf = Buffer.from(apiKey);
    const keysMatch =
      tokenBuf.length === keyBuf.length &&
      timingSafeEqual(tokenBuf, keyBuf);
    if (!keysMatch) {
      res.status(403).json({
        error: "Invalid dealer API key",
        code: "FORBIDDEN",
      });
      return;
    }

    next();
  };
}

/**
 * Create dealer routes
 *
 * All dealer endpoints are protected with operator auth (API key).
 * Pass dealerApiKey to enable protection. If undefined, endpoints are unprotected (local dev only).
 */
export function createDealerRoutes(dealerService: DealerService, dealerApiKey?: string): Router {
  const router = Router();

  // Apply auth middleware to all dealer routes if API key is configured
  if (dealerApiKey) {
    router.use(createDealerAuthMiddleware(dealerApiKey));
  }

  /**
   * POST /dealer/deal
   * Manually trigger dealing for a hand
   *
   * Body: { tableId: string, handId: string }
   */
  router.post("/deal", async (req: Request, res: Response) => {
    const { tableId, handId, vrfRandomness, dealerSeed, encryptionKeys } = req.body;

    if (!tableId || typeof tableId !== "string") {
      res.status(400).json({ error: "Missing or invalid tableId", code: "INVALID_TABLE_ID" });
      return;
    }
    if (!handId || typeof handId !== "string") {
      res.status(400).json({ error: "Missing or invalid handId", code: "INVALID_HAND_ID" });
      return;
    }
    if (!vrfRandomness) {
      res.status(400).json({ error: "Missing vrfRandomness", code: "INVALID_PARAMS" });
      return;
    }
    if (!dealerSeed || typeof dealerSeed !== "string") {
      res.status(400).json({ error: "Missing or invalid dealerSeed", code: "INVALID_PARAMS" });
      return;
    }
    if (!encryptionKeys || typeof encryptionKeys !== "object") {
      res.status(400).json({ error: "Missing encryptionKeys map", code: "INVALID_PARAMS" });
      return;
    }

    // encryptionKeys arrives as { "0": "0x...", "1": "0x..." } (JSON object)
    const keysMap = new Map<number, Uint8Array>();
    for (const [seatStr, hexKey] of Object.entries(encryptionKeys as Record<string, string>)) {
      const seatIdx = Number(seatStr);
      if (!Number.isInteger(seatIdx) || seatIdx < 0 || seatIdx > 8) continue;
      // hex key → Uint8Array
      const hex = (hexKey as string).replace(/^0x/, "");
      keysMap.set(seatIdx, Uint8Array.from(Buffer.from(hex, "hex")));
    }

    try {
      const result = await dealerService.deal({
        tableId,
        handId,
        vrfRandomness: BigInt(vrfRandomness),
        dealerSeed: dealerSeed as `0x${string}`,
        encryptionKeys: keysMap,
      });

      // Return commitments and dealer seed commit (never expose encrypted cards here)
      res.status(201).json({
        tableId: result.tableId,
        handId: result.handId,
        dealerSeedCommit: result.dealerSeedCommit,
        commitments: result.seats.map((s) => ({
          seatIndex: s.seatIndex,
          commitment: s.commitment,
        })),
      });
    } catch (err) {
      if (err instanceof DealerError) {
        const statusCode = err.code === "ALREADY_DEALT" ? 409 : 400;
        res.status(statusCode).json({ error: err.message, code: err.code });
        return;
      }
      throw err;
    }
  });

  /**
   * GET /dealer/commitments
   * Get commitments for a hand (for on-chain submission)
   *
   * Query: tableId, handId
   */
  router.get("/commitments", async (req: Request, res: Response) => {
    const { tableId, handId } = req.query;

    if (!tableId || typeof tableId !== "string") {
      res.status(400).json({
        error: "Missing or invalid tableId",
        code: "INVALID_TABLE_ID",
      });
      return;
    }

    if (!handId || typeof handId !== "string") {
      res.status(400).json({
        error: "Missing or invalid handId",
        code: "INVALID_HAND_ID",
      });
      return;
    }

    const commitments = await dealerService.getCommitments(tableId, handId);

    if (!commitments) {
      res.status(404).json({
        error: "Hand not dealt",
        code: "NOT_FOUND",
      });
      return;
    }

    res.json({
      tableId,
      handId,
      commitments,
    });
  });

  /**
   * GET /dealer/reveal
   * Get reveal data for showdown (internal use)
   *
   * Query: tableId, handId, seatIndex (uint8)
   */
  router.get("/reveal", async (req: Request, res: Response) => {
    const { tableId, handId, seatIndex } = req.query;

    if (!tableId || typeof tableId !== "string") {
      res.status(400).json({
        error: "Missing or invalid tableId",
        code: "INVALID_TABLE_ID",
      });
      return;
    }

    if (!handId || typeof handId !== "string") {
      res.status(400).json({
        error: "Missing or invalid handId",
        code: "INVALID_HAND_ID",
      });
      return;
    }

    const seatIdx = Number(seatIndex);
    if (!Number.isInteger(seatIdx) || seatIdx < 0 || seatIdx > 255) {
      res.status(400).json({
        error: "Missing or invalid seatIndex (must be uint8)",
        code: "INVALID_SEAT_INDEX",
      });
      return;
    }

    const revealData = await dealerService.getRevealData(tableId, handId, seatIdx);

    if (!revealData) {
      res.status(404).json({
        error: "Reveal data not found",
        code: "NOT_FOUND",
      });
      return;
    }

    res.json({
      tableId,
      handId,
      seatIndex: seatIdx,
      ...revealData,
    });
  });

  /**
   * DELETE /dealer/hand
   * Clean up hole cards for a completed hand
   *
   * Body: { tableId: string, handId: string }
   */
  router.delete("/hand", async (req: Request, res: Response) => {
    const { tableId, handId } = req.body;

    if (!tableId || typeof tableId !== "string") {
      res.status(400).json({
        error: "Missing or invalid tableId",
        code: "INVALID_TABLE_ID",
      });
      return;
    }

    if (!handId || typeof handId !== "string") {
      res.status(400).json({
        error: "Missing or invalid handId",
        code: "INVALID_HAND_ID",
      });
      return;
    }

    const deleted = await dealerService.cleanupHand(tableId, handId);

    res.json({
      tableId,
      handId,
      deleted,
    });
  });

  return router;
}
