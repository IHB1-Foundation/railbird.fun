// Fleet Service entry point — T-1202
// Manages pools of operator wallets and spawns agent bot processes on demand.

import express from "express";
import { createLogger } from "@playerco/shared";
import { WalletPool, parseOperatorKeys } from "./pool.js";
import { ProcessManager } from "./spawner.js";
import { createFleetRouter } from "./api.js";

const logger = createLogger({ service: "fleet" });

const PORT = parseInt(process.env.FLEET_PORT ?? "3003", 10);

async function main() {
  logger.info({}, "Fleet service starting");

  const keys = parseOperatorKeys();
  if (keys.length === 0) {
    logger.warn({}, "FLEET_OPERATOR_KEYS is empty — no wallets available. Set comma-separated private keys.");
  }

  const pool = new WalletPool(keys);
  const manager = new ProcessManager();

  const app = express();
  app.use(express.json());

  // CORS for web app
  app.use((_req, res, next) => {
    res.header("Access-Control-Allow-Origin", process.env.CORS_ORIGIN ?? "*");
    res.header("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    next();
  });

  app.options("*", (_req, res) => res.sendStatus(204));

  app.get("/health", (_req, res) => {
    res.json({
      ok: true,
      wallets: { available: pool.availableCount(), total: pool.totalCount() },
      agents: manager.list().length,
    });
  });

  app.use("/fleet", createFleetRouter(pool, manager));

  const server = app.listen(PORT, () => {
    logger.info({ port: PORT }, "Fleet service listening");
  });

  const shutdown = () => {
    logger.info({}, "Shutting down fleet service");
    manager.shutdown();
    server.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error("Fleet fatal error:", err);
  process.exit(1);
});
