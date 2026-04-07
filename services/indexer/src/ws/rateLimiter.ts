/**
 * Token-bucket rate limiter for inbound WebSocket messages.
 * Returns true if the message is allowed, false if rate-limited.
 */
export class MessageRateLimiter {
  private tokens: number;
  private lastRefillMs: number;
  private readonly maxTokens: number;
  private readonly refillRatePerMs: number;

  constructor(maxPerSecond: number, burst: number) {
    this.maxTokens = burst;
    this.refillRatePerMs = maxPerSecond / 1000;
    this.tokens = burst;
    this.lastRefillMs = Date.now();
  }

  consume(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastRefillMs;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRatePerMs);
    this.lastRefillMs = now;
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }
}
