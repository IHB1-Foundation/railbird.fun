import { Router, type Response } from "express";
import type { AuthenticatedRequest } from "../middleware/index.js";
import { ChainError } from "../chain/index.js";
import { HoleCardError } from "../holecards/index.js";
import type { ChainService } from "../chain/index.js";
import type { HoleCardStore } from "../holecards/index.js";
import type { EncryptionKeyStore } from "../encryptionKeyStore.js";

/**
 * Create owner routes with required services
 */
export function createOwnerRoutes(
  chainService: ChainService,
  holeCardStore: HoleCardStore,
  encryptionKeyStore: EncryptionKeyStore,
): Router {
  const router = Router();

  router.post("/encryption-key", async (req: AuthenticatedRequest, res: Response) => {
    const pubKey = req.body?.pubKey;

    if (!pubKey || typeof pubKey !== "string" || !/^0x[a-fA-F0-9]{66}$/.test(pubKey)) {
      res.status(400).json({
        error: "Missing or invalid pubKey (expected 33-byte compressed secp256k1 key)",
        code: "INVALID_PUBKEY",
      });
      return;
    }

    await encryptionKeyStore.set(req.wallet!, pubKey.toLowerCase() as `0x${string}`);

    res.status(201).json({
      address: req.wallet,
      stored: true,
    });
  });

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

    // Validate required parameters — must be non-empty numeric strings.
    if (!tableId || typeof tableId !== "string" || !/^\d+$/.test(tableId)) {
      res.status(400).json({
        error: "Missing or invalid tableId parameter: must be a numeric string",
        code: "INVALID_TABLE_ID",
      });
      return;
    }

    if (!handId || typeof handId !== "string" || !/^\d+$/.test(handId)) {
      res.status(400).json({
        error: "Missing or invalid handId parameter: must be a numeric string",
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
      const record = await holeCardStore.get(tableId, handId, seatIndex);

      if (!record) {
        res.status(404).json({
          error: "Hole cards not found for this hand",
          code: "HOLECARDS_NOT_FOUND",
        });
        return;
      }

      // Return encrypted cards — client decrypts locally with their private key
      res.json({
        tableId,
        handId,
        seatIndex,
        encryptedCards: record.encryptedCards,
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
