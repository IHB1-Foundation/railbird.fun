// Shared Prometheus metrics registry and bot metrics
// Used by bots and exposed via the /metrics endpoint on the health server.

import client from "prom-client";

const { Registry, Counter, Gauge, collectDefaultMetrics } = client;

/**
 * Shared Prometheus registry.
 * Each process has its own isolated instance.
 */
export const registry = new Registry();

// Default Node.js metrics (memory, GC, event loop lag, etc.)
collectDefaultMetrics({ register: registry });

/**
 * Total on-chain actions submitted by a bot.
 * Labels: service (agent-bot|keeper-bot|vrf-operator), action (e.g. fold, call, raise, forceTimeout)
 */
export const botActionsTotal = new Counter({
  name: "railbird_bot_actions_total",
  help: "Total number of on-chain actions submitted by bots",
  labelNames: ["service", "action"],
  registers: [registry],
});

/**
 * Total errors encountered by a bot.
 * Labels: service, type (rpc|api|tx|strategy|unknown)
 */
export const botErrorsTotal = new Counter({
  name: "railbird_bot_errors_total",
  help: "Total number of errors encountered by bots",
  labelNames: ["service", "type"],
  registers: [registry],
});

/**
 * Circuit breaker state per service and circuit name.
 * Values: 0 = closed (healthy), 1 = half-open, 2 = open (failing)
 */
export const botCircuitState = new Gauge({
  name: "railbird_bot_circuit_state",
  help: "Circuit breaker state: 0=closed, 1=half_open, 2=open",
  labelNames: ["service", "circuit"],
  registers: [registry],
});

/**
 * Return Prometheus text format output for all registered metrics.
 */
export async function getMetricsText(): Promise<string> {
  return registry.metrics();
}

/**
 * Content-type header value for Prometheus exposition format.
 */
export const metricsContentType: string = (client as any).contentType ?? "text/plain; version=0.0.4; charset=utf-8";
