import express, { type Express, type Request, type Response, type NextFunction } from "express";
import { AuthService } from "./auth/index.js";
import { createAuthRoutes } from "./routes/index.js";

export interface AppConfig {
  jwtSecret: string;
  nonceTtlMs?: number;
  sessionTtlMs?: number;
}

export interface AppContext {
  app: Express;
  authService: AuthService;
}

/**
 * Create the OwnerView Express app
 */
export function createApp(config: AppConfig): AppContext {
  const app = express();

  // Middleware
  app.use(express.json());

  // Create services - only pass defined values to preserve defaults
  const authConfig: { jwtSecret: string; nonceTtlMs?: number; sessionTtlMs?: number } = {
    jwtSecret: config.jwtSecret,
  };
  if (config.nonceTtlMs !== undefined) authConfig.nonceTtlMs = config.nonceTtlMs;
  if (config.sessionTtlMs !== undefined) authConfig.sessionTtlMs = config.sessionTtlMs;

  const authService = new AuthService(authConfig);

  // Routes
  app.use("/auth", createAuthRoutes(authService));

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({ status: "ok" });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });

  return { app, authService };
}
