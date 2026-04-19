import { Router, type Request, type Response } from "express";
import { createLogger } from "@playerco/shared";
import type { AuthService } from "../auth/index.js";

const logger = createLogger({ service: "ownerview", module: "session" });

/**
 * Session revocation routes for auto-sign sessions (Initia-specific).
 *
 * These routes allow server-side tracking and revocation of InterwovenKit
 * auto-sign sessions. The client sends a hint when using auto-sign so that
 * the indexer can mark those submissions for audit.
 *
 * Endpoints:
 *   POST /session/revoke          — revoke the caller's active auto-sign session
 *   GET  /session/status          — check whether caller's session is active (server-side view)
 */

export interface SessionRecord {
  address: string;
  revokedAt: string;
  via: "autosign" | "manual";
}

// In-memory revocation set — production would use Redis or DB.
const revokedSessions = new Map<string, SessionRecord>();

export function createSessionRoutes(authService: AuthService): Router {
  const router = Router();

  /**
   * POST /session/revoke
   * Revoke the caller's auto-sign session server-side.
   *
   * Body: { address: string, via?: "autosign" | "manual" }
   * Requires: Authorization: Bearer <jwt> header OR valid cookie session
   */
  router.post("/revoke", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const cookieJwt = req.cookies?.jwt as string | undefined;
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : (cookieJwt ?? "");

    if (!token) {
      res.status(401).json({ error: "Authentication required", code: "UNAUTHORIZED" });
      return;
    }

    let address: string;
    try {
      const payload = await authService.verifySession(token);
      if (!payload) {
        res.status(401).json({ error: "Invalid or expired token", code: "INVALID_TOKEN" });
        return;
      }
      address = payload.sub;
    } catch {
      res.status(401).json({ error: "Invalid or expired token", code: "INVALID_TOKEN" });
      return;
    }

    const via = (req.body?.via as "autosign" | "manual" | undefined) ?? "manual";
    const record: SessionRecord = {
      address: address.toLowerCase(),
      revokedAt: new Date().toISOString(),
      via,
    };

    revokedSessions.set(address.toLowerCase(), record);
    logger.info(
      { address: record.address, via: record.via, revokedAt: record.revokedAt },
      "auto-sign session revoked",
    );

    res.json({
      ok: true,
      message: "Auto-sign session revoked.",
      address: record.address,
      revokedAt: record.revokedAt,
    });
  });

  /**
   * GET /session/status?address=0x...
   * Returns whether a given address has an active (non-revoked) session marker.
   * Used by the indexer to add audit markers to autosign-submitted transactions.
   */
  router.get("/status", (req: Request, res: Response) => {
    const address = (req.query.address as string | undefined)?.toLowerCase();
    if (!address) {
      res.status(400).json({ error: "Missing address parameter", code: "MISSING_ADDRESS" });
      return;
    }

    const record = revokedSessions.get(address);
    res.json({
      address,
      isRevoked: !!record,
      revokedAt: record?.revokedAt ?? null,
    });
  });

  return router;
}

/**
 * Returns true if the address has had its session revoked.
 * Can be called from indexer middleware to add audit markers.
 */
export function isSessionRevoked(address: string): boolean {
  return revokedSessions.has(address.toLowerCase());
}
