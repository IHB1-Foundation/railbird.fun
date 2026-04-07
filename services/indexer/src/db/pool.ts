// Database connection pool

import pg from "pg";
const { Pool } = pg;
import { createLogger } from "@playerco/shared";

const logger = createLogger({ service: "indexer" });

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
  /** Max milliseconds a query may run before auto-cancellation. Default: 10000. */
  statement_timeout?: number;
}

export interface PoolStats {
  total: number;
  idle: number;
  waiting: number;
}

let pool: pg.Pool | null = null;

export function getDbConfig(): DbConfig {
  // DB env vars are validated at startup (index.ts).
  // Defaults are only applied for local dev there; by this point they are set.
  const host = process.env.DB_HOST;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;

  if (!host || !database || !user || !password) {
    throw new Error(
      "Database configuration missing. Required: DB_HOST, DB_NAME, DB_USER, DB_PASSWORD"
    );
  }

  return {
    host,
    port: parseInt(process.env.DB_PORT || "5432", 10),
    database,
    user,
    password,
    max: parseInt(process.env.DB_POOL_SIZE || "10", 10),
    // Cancel queries that exceed this limit to prevent pool exhaustion.
    statement_timeout: parseInt(process.env.DB_QUERY_TIMEOUT_MS || "10000", 10),
  };
}

export function getPool(): pg.Pool {
  if (!pool) {
    const config = getDbConfig();
    pool = new Pool(config);

    pool.on("error", (err) => {
      logger.error({ err }, "Unexpected error on idle DB client");
    });
  }
  return pool;
}

/** Return current pool connection counts for health monitoring. */
export function getPoolStats(): PoolStats {
  const p = pool;
  if (!p) return { total: 0, idle: 0, waiting: 0 };
  const total = p.totalCount;
  const idle = p.idleCount;
  const waiting = p.waitingCount;
  const maxClients = parseInt(process.env.DB_POOL_SIZE || "10", 10);
  const utilization = maxClients > 0 ? total / maxClients : 0;
  if (utilization >= 0.8) {
    logger.warn({ total, idle, waiting, maxClients }, "DB pool utilization ≥80%");
  }
  return { total, idle, waiting };
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<pg.QueryResult<T>> {
  const client = getPool();
  return client.query<T>(text, params);
}

export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
