// @playerco/indexer - Event ingestion and REST API

import { VERSION, createLogger, validateChainIdWithRpc, logAbiVersions } from "@playerco/shared";
import { createApp } from "./api/index.js";
import { EventListener } from "./events/index.js";
import { setListenerStatus } from "./events/listenerState.js";
import { getPool, closePool } from "./db/index.js";
import { createWsServer } from "./ws/index.js";
import { initRateLimiter } from "./middleware/rateLimiter.js";
import { initCache, shutdownCache } from "./cache/redis.js";
import type { Address } from "viem";
import { createServer } from "http";

const logger = createLogger({ service: "indexer" });

logger.info({ version: VERSION }, "Indexer service starting");
logAbiVersions(logger);

const PORT = parseInt(process.env.PORT || "3002", 10);
const CHAIN_ENV = process.env.CHAIN_ENV || "local";
const isLocal = CHAIN_ENV === "local";

function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (!value) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

async function main(): Promise<void> {
  // Database configuration: require explicit values in non-local environments
  if (isLocal) {
    // Local dev defaults
    if (!process.env.DB_HOST) process.env.DB_HOST = "localhost";
    if (!process.env.DB_PORT) process.env.DB_PORT = "5432";
    if (!process.env.DB_NAME) process.env.DB_NAME = "playerco";
    if (!process.env.DB_USER) process.env.DB_USER = "postgres";
    if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = "postgres";
  } else {
    const requiredDbVars = ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"];
    const missingDb = requiredDbVars.filter((v) => !process.env[v]);
    if (missingDb.length > 0) {
      logger.error(
        { missing: missingDb, env: CHAIN_ENV },
        "Database configuration required but missing",
      );
      process.exit(1);
    }
  }

  // Test database connection - hard failure
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    logger.info("Database connection successful");
  } catch (error) {
    logger.error({ err: error }, "Database connection failed");
    throw new Error("Indexer requires a live database connection. Refusing to start.");
  }

  // Chain configuration: require in non-local environments
  const hasChainConfig =
    process.env.POKER_TABLE_ADDRESSES && process.env.PLAYER_REGISTRY_ADDRESS && process.env.RPC_URL;

  if (!isLocal && !hasChainConfig) {
    logger.error(
      { env: CHAIN_ENV },
      "Chain configuration required but missing (POKER_TABLE_ADDRESSES, PLAYER_REGISTRY_ADDRESS, RPC_URL)",
    );
    process.exit(1);
  }

  // Validate CHAIN_ENV ↔ RPC_URL chain ID match at startup.
  if (process.env.RPC_URL) {
    const EXPECTED_CHAIN_IDS: Record<string, number> = { local: 31337, testnet: 133, mainnet: 177 };
    const expectedChainId = EXPECTED_CHAIN_IDS[CHAIN_ENV];
    if (expectedChainId !== undefined) {
      await validateChainIdWithRpc(process.env.RPC_URL, expectedChainId).catch((err: unknown) => {
        logger.error(
          { err },
          "Chain ID mismatch — RPC_URL and CHAIN_ENV disagree. Refusing to start.",
        );
        process.exit(1);
      });
    }
  }

  // Initialize rate limiter (Redis if REDIS_URL set, otherwise in-memory)
  await initRateLimiter();

  // Initialize Redis cache for hot read paths (T-1901)
  await initCache();

  // Start REST API with HTTP server
  const app = createApp();
  const httpServer = createServer(app);

  // Attach WebSocket server
  const wss = createWsServer({
    httpServer,
    path: "/ws",
  });

  httpServer.listen(PORT, () => {
    logger.info(
      { port: PORT, env: CHAIN_ENV, healthUrl: `http://localhost:${PORT}/api/health` },
      "REST API listening",
    );
  });

  const server = httpServer;

  // Start event listener
  if (hasChainConfig) {
    const tableAddrs = (process.env.POKER_TABLE_ADDRESSES || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as Address[];
    const listener = new EventListener({
      pokerTableAddresses: tableAddrs,
      playerRegistryAddress: process.env.PLAYER_REGISTRY_ADDRESS as Address,
      playerVaultAddress: process.env.PLAYER_VAULT_ADDRESS as Address | undefined,
      startBlock: process.env.START_BLOCK ? BigInt(process.env.START_BLOCK) : undefined,
      replayOnStart: parseBooleanEnv(process.env.INDEXER_REPLAY_ON_START, false),
      pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "2000", 10),
      logBlockRange: parseInt(process.env.LOG_BLOCK_RANGE || "90", 10),
    });

    // Graceful shutdown — defined before starting the listener so the error
    // handler can trigger the same cleanup path.
    let shutdownCalled = false;
    const shutdown = async (exitCode = 0) => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      logger.info({ exitCode }, "Shutting down...");
      listener.stop();
      wss.close();
      server.close();
      await shutdownCache();
      await closePool();
      process.exit(exitCode);
    };

    process.on("SIGINT", () => void shutdown(0));
    process.on("SIGTERM", () => void shutdown(0));

    // Start event listener — on fatal error, perform graceful cleanup before exit
    setListenerStatus("starting");
    listener
      .start()
      .then(() => {
        setListenerStatus("running");
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        logger.error({ reason }, "Event listener encountered a fatal error — shutting down");
        setListenerStatus("failed", reason);
        void shutdown(1);
      });
  } else {
    // Only reachable in local mode (non-local already exited above)
    logger.info("Chain config not provided - event listener disabled (local dev mode)");

    let shutdownCalled = false;
    const shutdown = async () => {
      if (shutdownCalled) return;
      shutdownCalled = true;
      logger.info("Shutting down...");
      wss.close();
      server.close();
      await shutdownCache();
      await closePool();
      process.exit(0);
    };

    process.on("SIGINT", () => void shutdown());
    process.on("SIGTERM", () => void shutdown());
  }
}

main().catch((err) => {
  logger.error({ err }, "Fatal error");
  process.exit(1);
});
