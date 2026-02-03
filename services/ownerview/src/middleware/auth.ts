import type { Request, Response, NextFunction, RequestHandler } from "express";
import { AuthService } from "../auth/index.js";
import type { Address } from "@playerco/shared";

/**
 * Extended request with authenticated wallet address
 */
export interface AuthenticatedRequest extends Request {
  wallet?: Address;
}

/**
 * Create authentication middleware that verifies JWT session tokens
 */
export function createAuthMiddleware(authService: AuthService): RequestHandler {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      res.status(401).json({
        error: "Missing Authorization header",
        code: "MISSING_AUTH",
      });
      return;
    }

    // Expect "Bearer <token>"
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer") {
      res.status(401).json({
        error: "Invalid Authorization header format. Expected: Bearer <token>",
        code: "INVALID_AUTH_FORMAT",
      });
      return;
    }

    const token = parts[1];

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
