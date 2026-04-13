import type { Request, Response, NextFunction, RequestHandler } from "express";

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimitOptions {
  /** Max requests per window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

const buckets = new Map<string, TokenBucket>();

/**
 * Reset all in-memory buckets.
 * Primarily used by tests so suites don't leak limiter state into each other.
 */
export function resetRateLimiterBuckets(): void {
  buckets.clear();
}

/**
 * Return the client IP from X-Forwarded-For (trust proxy) or socket address.
 */
function getClientIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
    return first.trim();
  }
  return req.socket?.remoteAddress ?? "unknown";
}

/**
 * Token bucket rate limiter factory.
 * Key = `${ip}:${path}` to allow different limits per endpoint.
 */
export function createRateLimiter(opts: RateLimitOptions): RequestHandler {
  const { maxRequests, windowMs } = opts;

  return function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
    const ip = getClientIp(req);
    const bucketKey = `${ip}:${req.path}`;
    const now = Date.now();

    let bucket = buckets.get(bucketKey);
    if (!bucket) {
      bucket = { tokens: maxRequests, lastRefill: now };
      buckets.set(bucketKey, bucket);
    }

    // Refill tokens proportionally to elapsed time
    const elapsed = now - bucket.lastRefill;
    const refill = (elapsed / windowMs) * maxRequests;
    bucket.tokens = Math.min(maxRequests, bucket.tokens + refill);
    bucket.lastRefill = now;

    if (bucket.tokens < 1) {
      const retryAfterSec = Math.ceil((1 - bucket.tokens) / (maxRequests / windowMs) / 1000);
      res.set("Retry-After", String(retryAfterSec));
      res.status(429).json({
        error: "Too Many Requests",
        code: "RATE_LIMITED",
        retryAfter: retryAfterSec,
      });
      return;
    }

    bucket.tokens -= 1;
    next();
  };
}

/** Pre-built limiter: 10 req/min for auth endpoints */
export const authRateLimiter: RequestHandler = createRateLimiter({
  maxRequests: 10,
  windowMs: 60_000,
});

/** Pre-built limiter: 30 req/min for dealer/owner endpoints */
export const dealerRateLimiter: RequestHandler = createRateLimiter({
  maxRequests: 30,
  windowMs: 60_000,
});
