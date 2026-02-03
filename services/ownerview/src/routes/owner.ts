import { Router, type Response } from "express";
import type { AuthenticatedRequest } from "../middleware/index.js";
import { ChainService, ChainError } from "../chain/index.js";
import { HoleCardStore, HoleCardError } from "../holecards/index.js";

/**
 * Create owner routes with required services
 */
export function createOwnerRoutes(
  chainService: ChainService,
  holeCardStore: HoleCardStore
): Router {
  const router = Router();

  /**
   * GET /owner/holecards?tableId=&handId=
   * Get hole cards for the authenticated owner's seat
   *
   * Security: Only returns hole cards if:
   * 1. Valid session token (verified by middleware)
   * 2. Authenticated wallet owns a seat at the table (on-chain verification)
   * 3. Hole cards exist for that seat/hand
   */
  router.get("/holecards", async (req: AuthenticatedRequest, res: Response) => {
    const { tableId, handId } = req.query;

    // Validate required parameters
    if (!tableId || typeof tableId !== "string") {
      res.status(400).json({
        error: "Missing or invalid tableId parameter",
        code: "INVALID_TABLE_ID",
      });
      return;
    }

    if (!handId || typeof handId !== "string") {
      res.status(400).json({
        error: "Missing or invalid handId parameter",
        code: "INVALID_HAND_ID",
      });
      return;
    }

    // Authenticated wallet address (set by auth middleware)
    const walletAddress = req.wallet!;

    try {
      // Find the seat owned by this wallet (on-chain lookup)
      const seatIndex = await chainService.findSeatByOwner(walletAddress);

      if (seatIndex === null) {
        res.status(403).json({
          error: "Wallet does not own any seat at this table",
          code: "NOT_SEAT_OWNER",
        });
        return;
      }

      // Get hole cards for this seat only
      const record = holeCardStore.get(tableId, handId, seatIndex);

      if (!record) {
        res.status(404).json({
          error: "Hole cards not found for this hand",
          code: "HOLECARDS_NOT_FOUND",
        });
        return;
      }

      // Return only the cards - never return salt or commitment to client
      res.json({
        tableId,
        handId,
        seatIndex,
        cards: record.cards,
      });
    } catch (err) {
      if (err instanceof ChainError) {
        // On-chain lookup failed
        res.status(503).json({
          error: `Chain lookup failed: ${err.message}`,
          code: "CHAIN_ERROR",
        });
        return;
      }

      if (err instanceof HoleCardError) {
        res.status(400).json({
          error: err.message,
          code: err.code,
        });
        return;
      }

      throw err;
    }
  });

  return router;
}
