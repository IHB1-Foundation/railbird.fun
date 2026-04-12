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
 * Auth attempt counter.
 * Labels: outcome (success|failure|blocked), path (/auth/nonce|/auth/verify|etc.)
 */
export const authAttemptsTotal = new Counter({
  name: "railbird_auth_attempts_total",
  help: "Total auth attempts",
  labelNames: ["outcome", "path"],
  registers: [registry],
});

/**
 * Auth rate-limited request counter.
 * Labels: path
 */
export const authRateLimitedTotal = new Counter({
  name: "railbird_auth_rate_limited_total",
  help: "Total auth requests blocked by rate limiter",
  labelNames: ["path"],
  registers: [registry],
});

/**
 * Indexer block lag gauge.
 * Labels: network (local|testnet|mainnet)
 */
export const indexerBlockLag = new Gauge({
  name: "railbird_indexer_block_lag",
  help: "Gap between chain head and last indexed block",
  labelNames: ["network"],
  registers: [registry],
});

/**
 * Active JWT session count gauge.
 */
export const ownerviewJwtActive = new Gauge({
  name: "railbird_ownerview_jwt_active",
  help: "Estimated number of active JWT sessions (nonce store size)",
  registers: [registry],
});

/**
 * Indexer cursor lag gauge.
 * Labels: contract (contract address)
 */
export const indexerCursorLag = new Gauge({
  name: "railbird_indexer_cursor_lag",
  help: "Gap between chain head and indexer cursor per contract",
  labelNames: ["contract"],
  registers: [registry],
});

/**
 * Chain reorg counter.
 * Labels: depth (number of blocks rolled back)
 */
export const indexerReorgTotal = new Counter({
  name: "railbird_indexer_reorg_total",
  help: "Total chain reorgs detected by the indexer",
  labelNames: ["depth"],
  registers: [registry],
});

// ── Fleet metrics ──────────────────────────────────────────────────────────

/**
 * Total agent process restarts by the fleet spawner.
 * Labels: agentId
 */
export const fleetAgentRestartsTotal = new Counter({
  name: "railbird_fleet_agent_restarts_total",
  help: "Total number of agent process restarts",
  labelNames: ["agentId"],
  registers: [registry],
});

// ── PG pool metrics ────────────────────────────────────────────────────────

export const pgPoolTotalCount = new Gauge({
  name: "railbird_pg_pool_total_count",
  help: "Total connections in PG pool",
  registers: [registry],
});

export const pgPoolIdleCount = new Gauge({
  name: "railbird_pg_pool_idle_count",
  help: "Idle connections in PG pool",
  registers: [registry],
});

export const pgPoolWaitingCount = new Gauge({
  name: "railbird_pg_pool_waiting_count",
  help: "Waiting clients in PG pool",
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
export const metricsContentType: string =
  (client as { contentType?: string }).contentType ?? "text/plain; version=0.0.4; charset=utf-8";
