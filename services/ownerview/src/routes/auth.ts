import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { AuthService, AuthError } from "../auth/index.js";
import { authRateLimiter } from "../middleware/rateLimit.js";

/** Cookie names used by the double-submit CSRF pattern. */
export const COOKIE_JWT = "jwt";
export const COOKIE_CSRF = "csrf_token";

/**
 * Create auth routes with the given auth service
 * @param cookieSession When true, issue JWTs as httpOnly cookies instead of JSON body.
 *                      Defaults to process.env.COOKIE_SESSION === 'true'.
 */
export function createAuthRoutes(
  authService: AuthService,
  cookieSession: boolean = process.env.COOKIE_SESSION === "true"
): Router {
  const router = Router();

  /**
   * GET /auth/nonce?address=0x...
   * Generate a nonce for wallet authentication
   */
  router.get("/nonce", authRateLimiter, (req: Request, res: Response) => {
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
        const statusCode = err.code === "RATE_LIMITED" ? 429 : 400;
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
   * POST /auth/verify
   * Verify signature and issue session token
   * Body: { address, nonce, signature }
   *
   * In cookie mode: sets httpOnly JWT cookie + readable CSRF cookie.
   * In bearer mode: returns { token, address, expiresAt } in JSON.
   */
  router.post("/verify", authRateLimiter, async (req: Request, res: Response) => {
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

      if (cookieSession) {
        const maxAgeSec = Math.floor((result.expiresAt - Date.now()) / 1000);
        const csrfToken = randomBytes(16).toString("hex");

        // httpOnly cookie: not accessible from JS
        res.cookie(COOKIE_JWT, result.token, {
          httpOnly: true,
          secure: true,
          sameSite: "strict",
          maxAge: maxAgeSec * 1000,
          path: "/",
        });

        // Readable CSRF token: JS reads this and sends as X-CSRF-Token header
        res.cookie(COOKIE_CSRF, csrfToken, {
          httpOnly: false,
          secure: true,
          sameSite: "strict",
          maxAge: maxAgeSec * 1000,
          path: "/",
        });

        // Don't expose the JWT token in the body in cookie mode
        res.json({
          address: result.address,
          expiresAt: result.expiresAt,
          cookieSession: true,
        });
      } else {
        res.json(result);
      }
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

  /**
   * POST /auth/logout
   * Clear session cookies (cookie mode only)
   */
  router.post("/logout", (_req: Request, res: Response) => {
    res.clearCookie(COOKIE_JWT, { path: "/" });
    res.clearCookie(COOKIE_CSRF, { path: "/" });
    res.json({ success: true });
  });

  return router;
}
