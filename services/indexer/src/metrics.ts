// Indexer-specific Prometheus metrics
// All metrics are registered in the shared registry so they appear
// in the same /metrics output as the default Node.js metrics.

import client from "prom-client";
import { registry } from "@playerco/shared";

const { Counter, Gauge, Histogram } = client;

/**
 * Total contract events processed by the indexer.
 * Labels: event_type (e.g. HandStarted, ActionTaken, HandSettled)
 */
export const eventsProcessedTotal = new Counter({
  name: "railbird_events_processed_total",
  help: "Total number of contract events processed by the indexer",
  labelNames: ["event_type"],
  registers: [registry],
});

/**
 * API request duration histogram.
 * Labels: method, route (normalised path), status_code
 */
export const apiLatencyHistogram = new Histogram({
  name: "railbird_api_latency_seconds",
  help: "REST API request duration in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  registers: [registry],
});

/**
 * Current number of active WebSocket connections across all tables.
 */
export const wsConnectionsGauge = new Gauge({
  name: "railbird_ws_connections",
  help: "Current number of active WebSocket connections",
  registers: [registry],
});

/**
 * Current number of tables being watched via WebSocket.
 */
export const wsTablesGauge = new Gauge({
  name: "railbird_ws_tables",
  help: "Current number of tables with at least one WebSocket subscriber",
  registers: [registry],
});

/** Cache hit counter (T-1901). Label: key prefix (e.g. "leaderboard"). */
export const cacheHitTotal = new Counter({
  name: "railbird_cache_hit_total",
  help: "Indexer Redis cache hits",
  labelNames: ["key"],
  registers: [registry],
});

/** Cache miss counter (T-1901). */
export const cacheMissTotal = new Counter({
  name: "railbird_cache_miss_total",
  help: "Indexer Redis cache misses",
  labelNames: ["key"],
  registers: [registry],
});

/** Cache I/O error counter (T-1901). */
export const cacheErrorTotal = new Counter({
  name: "railbird_cache_error_total",
  help: "Indexer Redis cache errors",
  labelNames: ["op"],
  registers: [registry],
});
