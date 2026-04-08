// Distributed rate limiter middleware for the indexer REST API.
// Uses Redis (ioredis) when REDIS_URL is set; falls back to in-memory automatically.

import type { Request, Response, NextFunction } from "express";
import { createLogger } from "@playerco/shared";

const logger = createLogger({ service: "indexer:rate-limiter" });

const WINDOW_MS = 60_000; // 1-minute sliding window
export const MAX_REQUESTS_PER_WINDOW = 60;

// ─── In-memory fallback ────────────────────────────────────────────────────────

interface InMemoryEntry {
  count: number;
  resetAt: number; // epoch ms
}

const inMemoryStore = new Map<string, InMemoryEntry>();

/** Periodic cleanup of expired entries to prevent unbounded Map growth. */
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of inMemoryStore) {
    if (now >= entry.resetAt) inMemoryStore.delete(key);
  }
}, 5 * 60_000).unref(); // unref so the interval doesn't keep the process alive

function inMemoryIncrement(ip: string): { count: number; resetAt: number } {
  const now = Date.now();
  let entry = inMemoryStore.get(ip);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + WINDOW_MS };
    inMemoryStore.set(ip, entry);
  } else {
    entry.count++;
  }
  return { count: entry.count, resetAt: entry.resetAt };
}

// ─── Redis backend ─────────────────────────────────────────────────────────────

// Typed narrowly to avoid importing ioredis at module load time (optional dep).
let redisClient: {
  multi(): { incr(k: string): any; pexpire(k: string, ms: number): any; exec(): Promise<Array<[Error | null, any]>> };
  ping(): Promise<string>;
  quit(): Promise<string>;
  on(event: string, fn: (...args: any[]) => void): void;
} | null = null;

export async function initRateLimiter(): Promise<void> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info("REDIS_URL not set — using in-memory rate limiter (single-instance only)");
    return;
  }
  try {
    const ioredis = await import("ioredis");
    const Redis = ioredis.default ?? (ioredis as any).Redis ?? ioredis;
    const client = new (Redis as any)(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3_000,
      lazyConnect: true,
    });
    client.on("error", (err: Error) => {
      logger.warn({ err: err.message }, "Redis rate limiter error — falling back to in-memory");
      redisClient = null;
    });
    await client.connect();
    await client.ping();
    redisClient = client as typeof redisClient;
    logger.info({ url: redisUrl.replace(/\/\/.*@/, "//***@") }, "Redis rate limiter connected");
  } catch (err) {
    logger.warn({ err }, "Redis unavailable — using in-memory rate limiter");
    redisClient = null;
  }
}

async function redisIncrement(ip: string): Promise<{ count: number; resetAt: number }> {
  const now = Date.now();
  // Align reset to wall-clock minute boundaries for predictable Retry-After values.
  const resetAt = now - (now % WINDOW_MS) + WINDOW_MS;
  const ttlMs = resetAt - now;
  const key = `rl:rest:${ip}`;

  const results = await redisClient!.multi().incr(key).pexpire(key, ttlMs).exec();
  const count = (results[0][1] as number) ?? 1;
  return { count, resetAt };
}

// ─── Middleware ────────────────────────────────────────────────────────────────

export function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";

  (async () => {
    try {
      let count: number;
      let resetAt: number;

      if (redisClient) {
        ({ count, resetAt } = await redisIncrement(ip));
      } else {
        ({ count, resetAt } = inMemoryIncrement(ip));
      }

      const retryAfterSec = Math.ceil((resetAt - Date.now()) / 1000);

      res.setHeader("X-RateLimit-Limit", MAX_REQUESTS_PER_WINDOW);
      res.setHeader("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS_PER_WINDOW - count));
      res.setHeader("X-RateLimit-Reset", Math.ceil(resetAt / 1000));

      if (count > MAX_REQUESTS_PER_WINDOW) {
        logger.warn({ ip, count }, "Rate limit exceeded");
        res.setHeader("Retry-After", retryAfterSec);
        res.status(429).json({ error: "Too many requests", retryAfterSeconds: retryAfterSec });
        return;
      }

      next();
    } catch (err) {
      // On error, allow the request to pass through (fail-open is safer for availability).
      logger.error({ err, ip }, "Rate limiter error — allowing request");
      next();
    }
  })();
}
