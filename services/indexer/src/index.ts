// @playerco/indexer - Event ingestion and REST API

import { VERSION } from "@playerco/shared";
import { createApp } from "./api/index.js";
import { EventListener } from "./events/index.js";
import { getPool, closePool } from "./db/index.js";
import type { Address } from "viem";

console.log(`Indexer service v${VERSION}`);

const PORT = parseInt(process.env.PORT || "3002", 10);

async function main(): Promise<void> {
  // Validate required environment variables
  const requiredEnvVars = [
    "DB_HOST",
    "POKER_TABLE_ADDRESS",
    "PLAYER_REGISTRY_ADDRESS",
    "CHAIN_ENV",
    "RPC_URL",
  ];

  const missingVars = requiredEnvVars.filter((v) => !process.env[v]);

  // For development, use defaults
  if (!process.env.DB_HOST) process.env.DB_HOST = "localhost";
  if (!process.env.DB_PORT) process.env.DB_PORT = "5432";
  if (!process.env.DB_NAME) process.env.DB_NAME = "playerco";
  if (!process.env.DB_USER) process.env.DB_USER = "postgres";
  if (!process.env.DB_PASSWORD) process.env.DB_PASSWORD = "postgres";

  // Test database connection
  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    console.log("Database connection successful");
  } catch (error) {
    console.error("Database connection failed:", error);
    console.log("Continuing without database - API will return mock data");
  }

  // Start REST API
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`REST API listening on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/api/health`);
    console.log(`Tables: http://localhost:${PORT}/api/tables`);
    console.log(`Agents: http://localhost:${PORT}/api/agents`);
  });

  // Start event listener if chain config is available
  if (
    process.env.POKER_TABLE_ADDRESS &&
    process.env.PLAYER_REGISTRY_ADDRESS &&
    process.env.RPC_URL
  ) {
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
      server.close();
      await closePool();
      process.exit(0);
    };

    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
  } else {
    console.log("Chain config not available - running in API-only mode");
    console.log("Set POKER_TABLE_ADDRESS, PLAYER_REGISTRY_ADDRESS, and RPC_URL to enable event listener");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
