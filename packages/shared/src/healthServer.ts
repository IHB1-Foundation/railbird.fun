// Minimal HTTP health-check server for bot processes.
// Responds to GET /health with { status: "ok", uptime, service }.
// Also exposes GET /metrics in Prometheus text format.

import http from "http";
import { getMetricsText, metricsContentType } from "./metrics.js";

export interface HealthServerOptions {
  port?: number;
  service: string;
  /** Optional callback returning extra fields merged into the /health response. */
  getExtras?: () => Record<string, unknown>;
  /**
   * Optional deep health check. Called when `?deep=1` query param is present.
   * Should return { ok: boolean, checks: Record<string, boolean | string> }.
   * Returning ok=false causes HTTP 503.
   */
  deepCheck?: () => Promise<{ ok: boolean; checks: Record<string, boolean | string> }>;
}

export interface HealthServer {
  close: () => Promise<void>;
}

/**
 * Start a tiny HTTP server on `port` (default: 9000 or HEALTH_PORT env var).
 * Returns an object with a `close()` method for graceful shutdown.
 *
 * GET /health  → 200 { status: "ok", uptime: <seconds>, service: "<name>" }
 * GET /metrics → 200 Prometheus text format
 * Anything else → 404
 */
export function startHealthServer(options: HealthServerOptions): HealthServer {
  const port = options.port ?? parseInt(process.env.HEALTH_PORT || "9000", 10);
  const startTime = Date.now();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    if (req.method === "GET" && url.pathname === "/health") {
      const extras = options.getExtras ? options.getExtras() : {};
      const isDeep = url.searchParams.get("deep") === "1";

      if (isDeep && options.deepCheck) {
        try {
          const result = await options.deepCheck();
          const body = JSON.stringify({
            status: result.ok ? "ok" : "degraded",
            uptime: Math.floor((Date.now() - startTime) / 1000),
            service: options.service,
            deep: result.checks,
            ...extras,
          });
          res.writeHead(result.ok ? 200 : 503, { "Content-Type": "application/json" });
          res.end(body);
        } catch (err) {
          const body = JSON.stringify({ status: "error", error: String(err) });
          res.writeHead(503, { "Content-Type": "application/json" });
          res.end(body);
        }
        return;
      }

      const body = JSON.stringify({
        status: "ok",
        uptime: Math.floor((Date.now() - startTime) / 1000),
        service: options.service,
        ...extras,
      });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(body);
    } else if (req.method === "GET" && req.url === "/metrics") {
      try {
        const text = await getMetricsText();
        res.writeHead(200, { "Content-Type": metricsContentType });
        res.end(text);
      } catch {
        res.writeHead(500);
        res.end("Error collecting metrics");
      }
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  server.listen(port);

  return {
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
