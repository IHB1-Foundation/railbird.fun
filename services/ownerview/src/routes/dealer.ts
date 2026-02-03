import { Router, type Request, type Response } from "express";
import { DealerService, DealerError } from "../dealer/index.js";

/**
 * Create dealer routes
 *
 * These routes are for internal/operator use to trigger dealing.
 * In production, consider protecting with API keys or operator auth.
 */
export function createDealerRoutes(dealerService: DealerService): Router {
  const router = Router();

  /**
   * POST /dealer/deal
   * Manually trigger dealing for a hand
   *
   * Body: { tableId: string, handId: string }
   */
  router.post("/deal", (req: Request, res: Response) => {
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

    try {
      const result = dealerService.deal({ tableId, handId });

      // Return commitments only (never expose cards in this endpoint)
      res.status(201).json({
        tableId: result.tableId,
        handId: result.handId,
        commitments: result.seats.map((s) => ({
          seatIndex: s.seatIndex,
          commitment: s.commitment,
        })),
      });
    } catch (err) {
      if (err instanceof DealerError) {
        const statusCode = err.code === "ALREADY_DEALT" ? 409 : 400;
        res.status(statusCode).json({
          error: err.message,
          code: err.code,
        });
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
  router.get("/commitments", (req: Request, res: Response) => {
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

    const commitments = dealerService.getCommitments(tableId, handId);

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
   * Query: tableId, handId, seatIndex
   *
   * WARNING: This exposes cards and salt. Should be protected in production.
   */
  router.get("/reveal", (req: Request, res: Response) => {
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
    if (isNaN(seatIdx) || seatIdx < 0 || seatIdx > 1) {
      res.status(400).json({
        error: "Missing or invalid seatIndex (must be 0 or 1)",
        code: "INVALID_SEAT_INDEX",
      });
      return;
    }

    const revealData = dealerService.getRevealData(tableId, handId, seatIdx);

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
  router.delete("/hand", (req: Request, res: Response) => {
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

    const deleted = dealerService.cleanupHand(tableId, handId);

    res.json({
      tableId,
      handId,
      deleted,
    });
  });

  return router;
}
