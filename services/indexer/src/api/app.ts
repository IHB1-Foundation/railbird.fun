// Express application setup

import crypto from "node:crypto";
import express from "express";
import swaggerUi from "swagger-ui-express";
import { router } from "./routes.js";
import {
  createLogger,
  registry,
  metricsContentType,
  parseAllowedOrigins,
  createCorsMiddleware,
} from "@playerco/shared";
import { apiLatencyHistogram, wsConnectionsGauge, wsTablesGauge } from "../metrics.js";
import { getWsManager } from "../ws/index.js";
import { rateLimiterMiddleware } from "../middleware/rateLimiter.js";
import { indexerOpenApiSpec } from "./openapi.js";

const logger = createLogger({ service: "indexer" });

// Normalise route path for metric labels (replace dynamic segments with placeholders)
function normaliseRoute(path: string): string {
  return path.replace(/\/\d+/g, "/:id").replace(/\/0x[0-9a-fA-F]+/g, "/:address");
}

export function createApp(): express.Application {
  const app = express();
  // Trust exactly one hop of proxy (e.g. Railway / nginx in front of this process).
  // Setting to `true` trusts any proxy, which can allow IP spoofing via X-Forwarded-For.
  const proxyCount = parseInt(process.env.TRUST_PROXY_HOPS || "1", 10);
  app.set("trust proxy", Number.isNaN(proxyCount) ? 1 : proxyCount);

  // Middleware
  app.use(express.json());

  // CORS — deny-by-default; set CORS_ALLOWED_ORIGINS env in production
  app.use(
    createCorsMiddleware(
      parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS),
      "GET, POST, OPTIONS",
      "Content-Type, Authorization, X-Request-ID, X-Via",
    ),
  );

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

  // Autosign audit marker — log requests submitted via InterwovenKit auto-sign sessions.
  // Clients send X-Via: autosign as a hint; we record it for audit purposes only.
  app.use((req, _res, next) => {
    const via = req.headers["x-via"];
    if (via === "autosign") {
      logger.info(
        {
          method: req.method,
          path: req.path,
          address: req.headers["x-wallet-address"] ?? "unknown",
          via: "autosign",
        },
        "autosign-hint: request submitted via InterwovenKit auto-sign session",
      );
    }
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
        durationSec,
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

  // OpenAPI spec + Swagger UI (mounted before /api to bypass rate limiter)
  app.get("/openapi.json", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=300");
    res.json(indexerOpenApiSpec);
  });
  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(indexerOpenApiSpec, {
      customSiteTitle: "Railbird Indexer API",
    }),
  );

  // Rate limiting (60 req/min per IP; Redis-backed if REDIS_URL is set)
  app.use("/api", rateLimiterMiddleware);

  // API routes
  app.use("/api", router);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Error handler
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const requestId = res.locals["requestId"] as string | undefined;
      logger.error({ err, requestId }, "Unhandled error");
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}
