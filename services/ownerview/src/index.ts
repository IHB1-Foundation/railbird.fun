// @playerco/ownerview - Wallet-sign auth + hole card ACL service
import { join } from "node:path";
import { VERSION, type Address, createLogger } from "@playerco/shared";
import { createApp } from "./app.js";

const logger = createLogger({ service: "ownerview" });

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const CHAIN_ENV = process.env.CHAIN_ENV || "local";
const isLocal = CHAIN_ENV === "local";

// JWT_SECRET: required explicitly in non-local environments (no insecure default)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  logger.error({ env: CHAIN_ENV }, "JWT_SECRET is not set. Set JWT_SECRET (min 32 characters) to start the service.");
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  logger.error("JWT_SECRET must be at least 32 characters");
  process.exit(1);
}

// RPC_URL + table addresses: required in non-local environments
// Supports POKER_TABLE_ADDRESSES (comma-separated, preferred) or legacy POKER_TABLE_ADDRESS.
const RPC_URL = process.env.RPC_URL;

const _rawAddresses = process.env.POKER_TABLE_ADDRESSES || process.env.POKER_TABLE_ADDRESS || "";
const POKER_TABLE_ADDRESSES: Address[] = _rawAddresses
  .split(",")
  .map(s => s.trim())
  .filter(Boolean) as Address[];
// Primary address used by chain service (first in list)
const POKER_TABLE_ADDRESS: Address | undefined = POKER_TABLE_ADDRESSES[0];

if (!isLocal && (!RPC_URL || POKER_TABLE_ADDRESSES.length === 0)) {
  logger.error(
    { env: CHAIN_ENV },
    "RPC_URL and POKER_TABLE_ADDRESSES are required. OwnerView cannot verify seat ownership without chain access."
  );
  process.exit(1);
}

if (POKER_TABLE_ADDRESSES.length > 1) {
  logger.info({ tableCount: POKER_TABLE_ADDRESSES.length, tables: POKER_TABLE_ADDRESSES }, "Multiple poker table addresses configured");
}

// DEALER_API_KEY: required in non-local environments to protect dealer endpoints
const DEALER_API_KEY = process.env.DEALER_API_KEY;
if (!isLocal && !DEALER_API_KEY) {
  logger.error(
    { env: CHAIN_ENV },
    "DEALER_API_KEY is required. Dealer endpoints must be protected with operator auth."
  );
  process.exit(1);
}

// HOLECARD_DATA_DIR: persistent storage directory for hole cards
// Defaults to ./data/holecards in non-local, undefined (in-memory) in local
const HOLECARD_DATA_DIR = process.env.HOLECARD_DATA_DIR || (!isLocal ? join(process.cwd(), "data", "holecards") : undefined);

// TRUSTLESS_DEALER_ENABLED: opt-in to verifiable shuffle + ECIES protocol.
const TRUSTLESS_DEALER_ENABLED = process.env.TRUSTLESS_DEALER_ENABLED === "true";

logger.info(
  { trustlessDealer: TRUSTLESS_DEALER_ENABLED },
  TRUSTLESS_DEALER_ENABLED
    ? "Trustless dealer protocol ENABLED (verifiable shuffle + ECIES)"
    : "Trustless dealer protocol DISABLED (legacy mode)"
);

const { app, authService, chainService, stopRetention } = createApp({
  jwtSecret: JWT_SECRET,
  rpcUrl: RPC_URL,
  pokerTableAddress: POKER_TABLE_ADDRESS,
  dataDir: HOLECARD_DATA_DIR,
  dealerApiKey: DEALER_API_KEY,
  trustlessDealerEnabled: TRUSTLESS_DEALER_ENABLED,
});

// Start cleanup intervals
authService.start();

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down...");
  authService.stop();
  stopRetention?.();
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("Received SIGINT, shutting down...");
  authService.stop();
  stopRetention?.();
  process.exit(0);
});

app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      env: CHAIN_ENV,
      chainService: chainService ? "enabled" : "disabled",
      storage: HOLECARD_DATA_DIR ?? "in-memory",
      dealerAuth: DEALER_API_KEY ? "enabled" : "disabled",
      trustlessDealer: TRUSTLESS_DEALER_ENABLED,
      version: VERSION,
    },
    "OwnerView service listening"
  );
});

// Re-export for programmatic use
export { createApp } from "./app.js";
export * from "./auth/index.js";
export * from "./chain/index.js";
export * from "./holecards/index.js";
export * from "./middleware/index.js";
export * from "./routes/index.js";
