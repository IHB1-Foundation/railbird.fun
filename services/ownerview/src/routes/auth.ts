import { Router, type Request, type Response } from "express";
import { AuthService, AuthError } from "../auth/index.js";

/**
 * Create auth routes with the given auth service
 */
export function createAuthRoutes(authService: AuthService): Router {
  const router = Router();

  /**
   * GET /auth/nonce?address=0x...
   * Generate a nonce for wallet authentication
   */
  router.get("/nonce", (req: Request, res: Response) => {
    const address = req.query.address as string;

    if (!address) {
      res.status(400).json({
        error: "Missing address parameter",
        code: "MISSING_ADDRESS",
      });
      return;
    }

    try {
      const result = authService.getNonce(address);
      res.json(result);
    } catch (err) {
      if (err instanceof AuthError) {
        res.status(400).json({
          error: err.message,
          code: err.code,
        });
        return;
      }
      throw err;
    }
  });

  /**
   * POST /auth/verify
   * Verify signature and issue session token
   * Body: { address, nonce, signature }
   */
  router.post("/verify", async (req: Request, res: Response) => {
    const { address, nonce, signature } = req.body;

    if (!address || !nonce || !signature) {
      res.status(400).json({
        error: "Missing required fields: address, nonce, signature",
        code: "MISSING_FIELDS",
      });
      return;
    }

    try {
      const result = await authService.verify(address, nonce, signature);
      res.json(result);
    } catch (err) {
      if (err instanceof AuthError) {
        const statusCode =
          err.code === "INVALID_SIGNATURE" ? 401 : 400;
        res.status(statusCode).json({
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
