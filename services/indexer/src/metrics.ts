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
