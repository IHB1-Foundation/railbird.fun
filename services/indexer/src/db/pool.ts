// Database connection pool

import pg from "pg";
const { Pool } = pg;

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  max?: number;
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
  };
}

export function getPool(): pg.Pool {
  if (!pool) {
    const config = getDbConfig();
    pool = new Pool(config);

    pool.on("error", (err) => {
      console.error("Unexpected error on idle client", err);
    });
  }
  return pool;
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
