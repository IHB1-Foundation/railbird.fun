// Fleet Service entry point — T-1202
// Manages pools of operator wallets and spawns agent bot processes on demand.

import express from "express";
import { createLogger, parseAllowedOrigins, createCorsMiddleware } from "@playerco/shared";
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

  // CORS — deny-by-default; explicitly allow origins via CORS_ALLOWED_ORIGINS env
  app.use(createCorsMiddleware(
    parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS),
    "GET, POST, DELETE, OPTIONS",
    "Content-Type, Authorization"
  ));

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
  logger.error({ err: err instanceof Error ? err.message : String(err) }, "Fleet fatal error");
  process.exit(1);
});
