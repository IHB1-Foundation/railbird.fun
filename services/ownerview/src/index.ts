// @playerco/ownerview - Wallet-sign auth + hole card ACL service
import { join } from "node:path";
import { VERSION, type Address } from "@playerco/shared";
import { createApp } from "./app.js";

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const CHAIN_ENV = process.env.CHAIN_ENV || "local";
const isLocal = CHAIN_ENV === "local";

// JWT_SECRET: required explicitly in non-local environments (no insecure default)
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (isLocal) {
    console.error("JWT_SECRET is not set. Set JWT_SECRET (min 32 characters) to start the service.");
  } else {
    console.error(`JWT_SECRET is required for ${CHAIN_ENV} environment. No insecure defaults allowed.`);
  }
  process.exit(1);
}

if (JWT_SECRET.length < 32) {
  console.error("JWT_SECRET must be at least 32 characters");
  process.exit(1);
}

// RPC_URL and POKER_TABLE_ADDRESS: required in non-local environments
const RPC_URL = process.env.RPC_URL;
const POKER_TABLE_ADDRESS = process.env.POKER_TABLE_ADDRESS as Address | undefined;

if (!isLocal && (!RPC_URL || !POKER_TABLE_ADDRESS)) {
  console.error(
    `RPC_URL and POKER_TABLE_ADDRESS are required for ${CHAIN_ENV} environment.\n` +
      `OwnerView cannot verify seat ownership without chain access. Refusing to start.`
  );
  process.exit(1);
}

// DEALER_API_KEY: required in non-local environments to protect dealer endpoints
const DEALER_API_KEY = process.env.DEALER_API_KEY;
if (!isLocal && !DEALER_API_KEY) {
  console.error(
    `DEALER_API_KEY is required for ${CHAIN_ENV} environment.\n` +
      `Dealer endpoints must be protected with operator auth. Refusing to start.`
  );
  process.exit(1);
}

// HOLECARD_DATA_DIR: persistent storage directory for hole cards
// Defaults to ./data/holecards in non-local, undefined (in-memory) in local
const HOLECARD_DATA_DIR = process.env.HOLECARD_DATA_DIR || (!isLocal ? join(process.cwd(), "data", "holecards") : undefined);

const { app, authService, chainService, stopRetention } = createApp({
  jwtSecret: JWT_SECRET,
  rpcUrl: RPC_URL,
  pokerTableAddress: POKER_TABLE_ADDRESS,
  dataDir: HOLECARD_DATA_DIR,
  dealerApiKey: DEALER_API_KEY,
});

// Start cleanup intervals
authService.start();

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Received SIGTERM, shutting down...");
  authService.stop();
  stopRetention?.();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Received SIGINT, shutting down...");
  authService.stop();
  stopRetention?.();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`OwnerView service v${VERSION} listening on port ${PORT}`);
  console.log(`  Environment: ${CHAIN_ENV}`);
  console.log(`  Chain service: ${chainService ? "enabled" : "disabled (local only)"}`);
  console.log(`  Storage: ${HOLECARD_DATA_DIR ? `persistent (${HOLECARD_DATA_DIR})` : "in-memory"}`);
  console.log(`  Dealer auth: ${DEALER_API_KEY ? "enabled" : "disabled (local only)"}`);
});

// Re-export for programmatic use
export { createApp } from "./app.js";
export * from "./auth/index.js";
export * from "./chain/index.js";
export * from "./holecards/index.js";
export * from "./middleware/index.js";
export * from "./routes/index.js";
