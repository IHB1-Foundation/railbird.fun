import type { Request, Response, NextFunction, RequestHandler } from "express";
import type { Address } from "@playerco/shared";
import type { AuthService } from "../auth/index.js";
import { COOKIE_JWT, COOKIE_CSRF } from "../routes/auth.js";

/**
 * Extended request with authenticated wallet address
 */
export interface AuthenticatedRequest extends Request {
  wallet?: Address;
}

/**
 * Parse a Cookie header value into a key→value map.
 */
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx < 0) continue;
    const key = part.slice(0, eqIdx).trim();
    const val = part.slice(eqIdx + 1).trim();
    if (key) result[key] = val;
  }
  return result;
}

/**
 * Create authentication middleware that verifies JWT session tokens.
 *
 * Accepts auth via:
 *   1. `Authorization: Bearer <token>` header (always accepted — local dev and API clients)
 *   2. httpOnly `jwt` cookie + `X-CSRF-Token` header that matches the `csrf_token` cookie
 *      (production cookie-session mode)
 *
 * When a cookie token is found but no CSRF token is provided, the request is rejected to
 * prevent cross-site request forgery attacks (double-submit cookie pattern).
 */
export function createAuthMiddleware(authService: AuthService): RequestHandler {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers.authorization;
    const cookies = parseCookies(req.headers.cookie);
    const cookieToken = cookies[COOKIE_JWT];

    let token: string | undefined;

    if (authHeader) {
      // Bearer token mode
      const parts = authHeader.split(" ");
      if (parts.length !== 2 || parts[0] !== "Bearer") {
        res.status(401).json({
          error: "Invalid Authorization header format. Expected: Bearer <token>",
          code: "INVALID_AUTH_FORMAT",
        });
        return;
      }
      token = parts[1];
    } else if (cookieToken) {
      // Cookie session mode: validate CSRF token (double-submit pattern)
      const csrfCookie = cookies[COOKIE_CSRF];
      const csrfHeader = req.headers["x-csrf-token"] as string | undefined;

      if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader) {
        res.status(401).json({
          error: "CSRF token mismatch or missing",
          code: "CSRF_MISMATCH",
        });
        return;
      }
      token = cookieToken;
    } else {
      res.status(401).json({
        error: "Missing Authorization header or session cookie",
        code: "MISSING_AUTH",
      });
      return;
    }

    try {
      const payload = await authService.verifySession(token);

      if (!payload) {
        res.status(401).json({
          error: "Invalid or expired token",
          code: "INVALID_TOKEN",
        });
        return;
      }

      // Attach wallet address to request
      req.wallet = payload.sub as Address;
      next();
    } catch {
      res.status(401).json({
        error: "Token verification failed",
        code: "TOKEN_VERIFICATION_FAILED",
      });
    }
  };
}
