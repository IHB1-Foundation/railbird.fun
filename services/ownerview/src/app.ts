import express, { type Express, type Request, type Response, type NextFunction } from "express";
import type { Address } from "@playerco/shared";
import { AuthService } from "./auth/index.js";
import { ChainService } from "./chain/index.js";
import { HoleCardStore } from "./holecards/index.js";
import { DealerService, HandStartedEventListener } from "./dealer/index.js";
import { createAuthMiddleware } from "./middleware/index.js";
import { createAuthRoutes, createOwnerRoutes, createDealerRoutes } from "./routes/index.js";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "https://railbird.fun",
  "https://www.railbird.fun",
];

function getAllowedOrigins(): Set<string> {
  const configured = (process.env.CORS_ALLOWED_ORIGINS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

export interface AppConfig {
  jwtSecret: string;
  nonceTtlMs?: number;
  sessionTtlMs?: number;
  /** RPC URL for on-chain lookups (required for owner routes) */
  rpcUrl?: string;
  /** PokerTable contract address (required for owner routes) */
  pokerTableAddress?: Address;
  /** Table ID for dealer event listener (optional) */
  tableId?: string;
  /** Enable event listener for automatic dealing (default: false) */
  enableEventListener?: boolean;
  /** Directory for persistent hole card storage. Omit for in-memory (tests). */
  dataDir?: string;
  /** API key for dealer endpoint authentication. Omit to disable (local dev). */
  dealerApiKey?: string;
  /** Max age in ms for hole card retention cleanup (default: 24h) */
  retentionMaxAgeMs?: number;
  /** Interval in ms for retention cleanup (default: 5 min) */
  retentionIntervalMs?: number;
}

export interface AppContext {
  app: Express;
  authService: AuthService;
  chainService?: ChainService;
  holeCardStore: HoleCardStore;
  dealerService: DealerService;
  eventListener?: HandStartedEventListener;
  /** Stop the retention cleanup interval */
  stopRetention?: () => void;
}

/** Default retention: 24 hours */
const DEFAULT_RETENTION_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Default cleanup interval: 5 minutes */
const DEFAULT_RETENTION_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Create the OwnerView Express app
 */
export function createApp(config: AppConfig): AppContext {
  const app = express();
  app.set("trust proxy", true);
  const allowedOrigins = getAllowedOrigins();

  // Middleware
  app.use(express.json());
  app.use((req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // Create services - only pass defined values to preserve defaults
  const authConfig: { jwtSecret: string; nonceTtlMs?: number; sessionTtlMs?: number } = {
    jwtSecret: config.jwtSecret,
  };
  if (config.nonceTtlMs !== undefined) authConfig.nonceTtlMs = config.nonceTtlMs;
  if (config.sessionTtlMs !== undefined) authConfig.sessionTtlMs = config.sessionTtlMs;

  const authService = new AuthService(authConfig);

  // Hole card store: file-backed if dataDir provided, in-memory otherwise
  const holeCardStore = new HoleCardStore(config.dataDir);

  // Dealer service (generates and stores hole cards)
  const dealerService = new DealerService(holeCardStore);

  // Chain service (optional - required for owner routes)
  let chainService: ChainService | undefined;
  if (config.rpcUrl && config.pokerTableAddress) {
    chainService = new ChainService({
      rpcUrl: config.rpcUrl,
      pokerTableAddress: config.pokerTableAddress,
    });
  }

  // Event listener for automatic dealing (optional)
  let eventListener: HandStartedEventListener | undefined;
  if (
    config.enableEventListener &&
    config.rpcUrl &&
    config.pokerTableAddress &&
    config.tableId
  ) {
    eventListener = new HandStartedEventListener(
      {
        rpcUrl: config.rpcUrl,
        pokerTableAddress: config.pokerTableAddress,
      },
      dealerService,
      config.tableId
    );
  }

  // Auth routes (public)
  app.use("/auth", createAuthRoutes(authService));

  // Dealer routes (protected with API key when configured)
  app.use("/dealer", createDealerRoutes(dealerService, config.dealerApiKey));

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

  // Retention cleanup interval
  const retentionMaxAge = config.retentionMaxAgeMs ?? DEFAULT_RETENTION_MAX_AGE_MS;
  const retentionInterval = config.retentionIntervalMs ?? DEFAULT_RETENTION_INTERVAL_MS;
  let retentionTimer: ReturnType<typeof setInterval> | null = null;

  if (retentionInterval > 0) {
    retentionTimer = setInterval(() => {
      const deleted = holeCardStore.deleteOlderThan(retentionMaxAge);
      if (deleted > 0) {
        console.log(`[Retention] Cleaned up ${deleted} expired hole card records`);
      }
    }, retentionInterval);
  }

  const stopRetention = (): void => {
    if (retentionTimer) {
      clearInterval(retentionTimer);
      retentionTimer = null;
    }
  };

  // Health check - reports dependency readiness
  app.get("/health", (_req: Request, res: Response) => {
    const chainReady = !!chainService;
    const allReady = chainReady;

    res.status(allReady ? 200 : 503).json({
      status: allReady ? "ready" : "degraded",
      dependencies: {
        chain: chainReady ? "ready" : "unavailable",
        dealer: "ready",
        eventListener: eventListener ? "ready" : "disabled",
        storage: config.dataDir ? "persistent" : "in-memory",
      },
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

  return { app, authService, chainService, holeCardStore, dealerService, eventListener, stopRetention };
}
