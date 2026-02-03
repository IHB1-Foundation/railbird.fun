import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { Address } from "@playerco/shared";
import { AuthService } from "./auth/index.js";
import { ChainService } from "./chain/index.js";
import { HoleCardStore } from "./holecards/index.js";
import { createAuthMiddleware } from "./middleware/index.js";
import { createAuthRoutes, createOwnerRoutes } from "./routes/index.js";

export interface AppConfig {
  jwtSecret: string;
  nonceTtlMs?: number;
  sessionTtlMs?: number;
  /** RPC URL for on-chain lookups (required for owner routes) */
  rpcUrl?: string;
  /** PokerTable contract address (required for owner routes) */
  pokerTableAddress?: Address;
}

export interface AppContext {
  app: Express;
  authService: AuthService;
  chainService?: ChainService;
  holeCardStore: HoleCardStore;
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

  // Hole card store (in-memory)
  const holeCardStore = new HoleCardStore();

  // Chain service (optional - required for owner routes)
  let chainService: ChainService | undefined;
  if (config.rpcUrl && config.pokerTableAddress) {
    chainService = new ChainService({
      rpcUrl: config.rpcUrl,
      pokerTableAddress: config.pokerTableAddress,
    });
  }

  // Auth routes (public)
  app.use("/auth", createAuthRoutes(authService));

  // Owner routes (authenticated, requires chain service)
  if (chainService) {
    const authMiddleware = createAuthMiddleware(authService);
    app.use("/owner", authMiddleware, createOwnerRoutes(chainService, holeCardStore));
  } else {
    // Return 503 if owner routes are requested but chain service is not configured
    app.use("/owner", (_req: Request, res: Response) => {
      res.status(503).json({
        error: "Owner routes not available. Missing RPC_URL or POKER_TABLE_ADDRESS configuration.",
        code: "SERVICE_UNAVAILABLE",
      });
    });
  }

  // Health check
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      chainServiceEnabled: !!chainService,
    });
  });

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
      error: "Internal server error",
      code: "INTERNAL_ERROR",
    });
  });

  return { app, authService, chainService, holeCardStore };
}
