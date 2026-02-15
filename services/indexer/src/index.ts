// @playerco/indexer - Event ingestion and REST API

import { VERSION } from "@playerco/shared";
import { createApp } from "./api/index.js";
import { EventListener } from "./events/index.js";
import { getPool, closePool } from "./db/index.js";
import { createWsServer, getWsManager } from "./ws/index.js";
import type { Address } from "viem";
import { createServer } from "http";

console.log(`Indexer service v${VERSION}`);

const PORT = parseInt(process.env.PORT || "3002", 10);
const CHAIN_ENV = process.env.CHAIN_ENV || "local";
const isLocal = CHAIN_ENV === "local";

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
    process.env.POKER_TABLE_ADDRESS &&
    process.env.PLAYER_REGISTRY_ADDRESS &&
    process.env.RPC_URL;

  if (!isLocal && !hasChainConfig) {
    console.error(
      `Chain configuration required for ${CHAIN_ENV} environment.\n` +
        `Missing: POKER_TABLE_ADDRESS, PLAYER_REGISTRY_ADDRESS, and/or RPC_URL.\n` +
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
    const listener = new EventListener({
      pokerTableAddress: process.env.POKER_TABLE_ADDRESS as Address,
      playerRegistryAddress: process.env.PLAYER_REGISTRY_ADDRESS as Address,
      playerVaultAddress: process.env.PLAYER_VAULT_ADDRESS as Address | undefined,
      startBlock: process.env.START_BLOCK ? BigInt(process.env.START_BLOCK) : undefined,
      pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS || "2000", 10),
    });

    // Don't block on listener start - run in background
    listener.start().catch((err) => {
      console.error("Event listener error:", err);
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
