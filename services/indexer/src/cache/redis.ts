/**
 * Optional Redis cache for hot read paths (T-1901).
 *
 * Behaviour:
 *   - Active when REDIS_URL is set; otherwise every call is a miss + passthrough.
 *   - getOrSet() takes a loader, JSON-serialises the result, and writes it
 *     under a TTL.
 *   - Cache failures never break the request — they degrade to passthrough
 *     and increment the error counter.
 */
import { createLogger } from "@playerco/shared";
import { cacheHitTotal, cacheMissTotal, cacheErrorTotal } from "../metrics.js";

const logger = createLogger({ service: "indexer:cache" });

type RedisLike = {
  get(k: string): Promise<string | null>;
  set(k: string, v: string, ...args: unknown[]): Promise<unknown>;
  del(...keys: string[]): Promise<number>;
  ping(): Promise<string>;
  quit(): Promise<string>;
  on(event: string, fn: (...args: unknown[]) => void): void;
};

let client: RedisLike | null = null;
let initialized = false;

export async function initCache(): Promise<void> {
  if (initialized) return;
  initialized = true;
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.info("REDIS_URL not set — cache disabled (every call is a miss)");
    return;
  }
  try {
    const ioredis = await import("ioredis");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Redis = (ioredis.default ?? (ioredis as any).Redis ?? ioredis) as any;
    const c: RedisLike = new Redis(url, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      lazyConnect: true,
      keyPrefix: "railbird:cache:",
    });
    c.on("error", (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err: msg }, "Redis cache error — degrading to no-cache");
      cacheErrorTotal.inc({ op: "client" });
      client = null;
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (c as any).connect();
    await c.ping();
    client = c;
    logger.info({ url: url.replace(/\/\/.*@/, "//***@") }, "Redis cache connected");
  } catch (err) {
    logger.warn({ err }, "Redis cache unavailable — degrading to no-cache");
    client = null;
  }
}

export async function shutdownCache(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      /* swallow */
    }
    client = null;
  }
}

/** True when a Redis client is connected. Mainly for tests. */
export function isCacheActive(): boolean {
  return client !== null;
}

/**
 * Get-or-set with TTL. Loader runs only on miss; result is JSON-encoded.
 * Errors during cache I/O fall through to the loader.
 */
export async function getOrSet<T>(
  key: string,
  ttlSec: number,
  loader: () => Promise<T>,
): Promise<T> {
  if (!client) {
    cacheMissTotal.inc({ key: keyLabel(key) });
    return loader();
  }
  try {
    const cached = await client.get(key);
    if (cached !== null) {
      cacheHitTotal.inc({ key: keyLabel(key) });
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    cacheErrorTotal.inc({ op: "get" });
    logger.debug({ err, key }, "cache get failed — passthrough");
  }
  cacheMissTotal.inc({ key: keyLabel(key) });
  const value = await loader();
  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSec);
  } catch (err) {
    cacheErrorTotal.inc({ op: "set" });
    logger.debug({ err, key }, "cache set failed — passthrough");
  }
  return value;
}

/** Invalidate a list of cache keys. Safe to call when cache is disabled. */
export async function invalidate(...keys: string[]): Promise<void> {
  if (!client || keys.length === 0) return;
  try {
    await client.del(...keys);
  } catch (err) {
    cacheErrorTotal.inc({ op: "del" });
    logger.debug({ err, keys }, "cache invalidate failed");
  }
}

/**
 * Strip query/IDs from a key for low-cardinality metric labels.
 * `leaderboard:roi:24h` → `leaderboard`.
 */
function keyLabel(key: string): string {
  const colon = key.indexOf(":");
  return colon === -1 ? key : key.slice(0, colon);
}
