// Express application setup

import express from "express";
import { router } from "./routes.js";
import { createLogger, registry, metricsContentType } from "@playerco/shared";
import { apiLatencyHistogram, wsConnectionsGauge, wsTablesGauge } from "../metrics.js";
import { getWsManager } from "../ws/index.js";
import { rateLimiterMiddleware } from "../middleware/rateLimiter.js";

const logger = createLogger({ service: "indexer" });

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

// Normalise route path for metric labels (replace dynamic segments with placeholders)
function normaliseRoute(path: string): string {
  return path
    .replace(/\/\d+/g, "/:id")
    .replace(/\/0x[0-9a-fA-F]+/g, "/:address");
}

export function createApp(): express.Application {
  const app = express();
  // Trust exactly one hop of proxy (e.g. Railway / nginx in front of this process).
  // Setting to `true` trusts any proxy, which can allow IP spoofing via X-Forwarded-For.
  const proxyCount = parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);
  app.set("trust proxy", Number.isNaN(proxyCount) ? 1 : proxyCount);
  const allowedOrigins = getAllowedOrigins();

  // Middleware
  app.use(express.json());

  // CORS
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
    }
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID");
    res.header("Access-Control-Expose-Headers", "X-Request-ID");
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });

  // X-Request-ID correlation tracing
  app.use((req, res, next) => {
    const incoming = req.headers["x-request-id"];
    const requestId =
      (typeof incoming === "string" && incoming.length > 0 ? incoming : null) ??
      crypto.randomUUID();
    res.locals["requestId"] = requestId;
    res.setHeader("X-Request-ID", requestId);
    logger.debug({ method: req.method, path: req.path, requestId }, "Incoming request");
    next();
  });

  // API latency tracking middleware
  app.use((req, res, next) => {
    const startMs = Date.now();
    res.on("finish", () => {
      const durationSec = (Date.now() - startMs) / 1000;
      apiLatencyHistogram.observe(
        {
          method: req.method,
          route: normaliseRoute(req.path),
          status_code: String(res.statusCode),
        },
        durationSec
      );
    });
    next();
  });

  // Prometheus metrics endpoint (outside /api to avoid auth/rate-limit middleware)
  app.get("/metrics", async (_req, res) => {
    try {
      // Update WS gauges on each scrape so values are fresh
      const wsStats = getWsManager().getStats();
      wsConnectionsGauge.set(wsStats.totalConnections);
      wsTablesGauge.set(wsStats.tables);

      const text = await registry.metrics();
      res.setHeader("Content-Type", metricsContentType);
      res.send(text);
    } catch (err) {
      logger.error({ err }, "Error collecting metrics");
      res.status(500).send("Error collecting metrics");
    }
  });

  // Rate limiting (60 req/min per IP; Redis-backed if REDIS_URL is set)
  app.use("/api", rateLimiterMiddleware);

  // API routes
  app.use("/api", router);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const requestId = res.locals["requestId"] as string | undefined;
    logger.error({ err, requestId }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
