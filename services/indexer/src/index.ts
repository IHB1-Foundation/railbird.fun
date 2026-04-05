// @playerco/indexer - Event ingestion and REST API

import { VERSION } from "@playerco/shared";
import { createApp } from "./api/index.js";
import { EventListener } from "./events/index.js";
import { setListenerStatus } from "./events/listenerState.js";
import { getPool, closePool } from "./db/index.js";
import { createWsServer, getWsManager } from "./ws/index.js";
import type { Address } from "viem";
import { createServer } from "http";

console.log(`Indexer service v${VERSION}`);

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
      console.error(
        `Database configuration required for ${CHAIN_ENV} environment.\n` +
          `Missing: ${missingDb.join(", ")}\n` +
          `No implicit defaults allowed in non-local environments.`
      );
      process.exit(1);
    }
  }

  // Test database connection - hard failure
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    console.log("Database connection successful");
  } catch (error) {
    console.error("Database connection failed:", error);
    throw new Error("Indexer requires a live database connection. Refusing to start.");
  }

  // Chain configuration: require in non-local environments
  const hasChainConfig =
    process.env.POKER_TABLE_ADDRESSES &&
    process.env.PLAYER_REGISTRY_ADDRESS &&
    process.env.RPC_URL;

  if (!isLocal && !hasChainConfig) {
    console.error(
      `Chain configuration required for ${CHAIN_ENV} environment.\n` +
        `Missing: POKER_TABLE_ADDRESSES, PLAYER_REGISTRY_ADDRESS, and/or RPC_URL.\n` +
        `Indexer cannot function without chain event ingestion in production.`
    );
    process.exit(1);
  }

  // Start REST API with HTTP server
  const app = createApp();
  const httpServer = createServer(app);

  // Attach WebSocket server
  const wss = createWsServer({
    httpServer,
    path: "/ws",
  });

  httpServer.listen(PORT, () => {
    console.log(`REST API listening on port ${PORT}`);
    console.log(`  Environment: ${CHAIN_ENV}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Tables: http://localhost:${PORT}/api/tables`);
    console.log(`Agents: http://localhost:${PORT}/api/agents`);
    console.log(`WebSocket: ws://localhost:${PORT}/ws/tables/:id`);
  });

  const server = httpServer;

  // Start event listener
  if (hasChainConfig) {
    const tableAddrs = (process.env.POKER_TABLE_ADDRESSES || "").split(",").map(s => s.trim()).filter(Boolean) as Address[];
    const listener = new EventListener({
      pokerTableAddresses: tableAddrs,
      playerRegistryAddress: process.env.PLAYER_REGISTRY_ADDRESS as Address,
      playerVaultAddress: process.env.PLAYER_VAULT_ADDRESS as Address | undefined,
      startBlock: process.env.START_BLOCK ? BigInt(process.env.START_BLOCK) : undefined,
      replayOnStart: parseBooleanEnv(process.env.INDEXER_REPLAY_ON_START, false),
      pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "2000", 10),
      logBlockRange: parseInt(process.env.LOG_BLOCK_RANGE || "90", 10),
    });

    // Start event listener — fail fast on fatal error so the orchestrator can restart
    setListenerStatus("starting");
    listener.start()
      .then(() => {
        setListenerStatus("running");
      })
      .catch((err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        console.error(
          JSON.stringify({
            level: "error",
            service: "indexer",
            event: "event_listener_fatal",
            message: "Event listener encountered a fatal error — exiting",
            reason,
            timestamp: new Date().toISOString(),
          })
        );
        setListenerStatus("failed", reason);
        process.exit(1);
      });

    // Graceful shutdown
    const shutdown = async () => {
      console.log("Shutting down...");
      listener.stop();
      wss.close();
      server.close();
      await closePool();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } else {
    // Only reachable in local mode (non-local already exited above)
    console.log("Chain config not provided - event listener disabled (local dev mode)");

    const shutdown = async () => {
      console.log("Shutting down...");
      wss.close();
      server.close();
      await closePool();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
