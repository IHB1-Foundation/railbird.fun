/**
 * Shared PG pool factory with prod-ready defaults and Prometheus metrics.
 *
 * Usage in services:
 *   import { createPgPool } from "@playerco/shared";
 *   const pool = createPgPool({ max: 20 });
 */

export interface PgPoolOptions {
  /** Max connections (default: 20) */
  max?: number;
  /** Idle connection timeout in ms (default: 10_000) */
  idleTimeoutMs?: number;
  /** Connection acquisition timeout in ms (default: 5_000) */
  connectionTimeoutMs?: number;
  /** Statement timeout in ms — auto-cancelled if exceeded (default: 30_000) */
  statementTimeoutMs?: number;
}

/**
 * Create a pg.Pool with prod-ready defaults.
 * Metrics export requires the consuming service to import prom-client.
 * Returns a config object for use with `new Pool(config)`.
 */
export function buildPgPoolConfig(opts: PgPoolOptions = {}): Record<string, unknown> {
  return {
    max: opts.max ?? 20,
    idleTimeoutMillis: opts.idleTimeoutMs ?? 10_000,
    connectionTimeoutMillis: opts.connectionTimeoutMs ?? 5_000,
    statement_timeout: opts.statementTimeoutMs ?? 30_000,
  };
}

/**
 * Perform a lightweight deep health check against a pg pool.
 * Returns { ok: true } if SELECT 1 succeeds within 2 seconds.
 */
export async function pgDeepHealthCheck(
  pool: { query: (sql: string) => Promise<unknown> }
): Promise<{ ok: boolean; error?: string }> {
  try {
    await Promise.race([
      pool.query("SELECT 1"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DB health check timed out")), 2_000)),
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
