// Circuit breaker pattern for external service calls.
// States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing recovery)

import { createLogger } from "./logger.js";

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Number of consecutive failures to open the circuit. Default: 5 */
  failureThreshold?: number;
  /** Milliseconds to wait in OPEN state before trying HALF_OPEN. Default: 30_000 */
  recoveryTimeoutMs?: number;
  /** Name used in log messages for observability. */
  name?: string;
}

/**
 * CircuitBreaker wraps an async call and opens after N consecutive failures.
 * While open, all calls immediately throw without hitting the downstream service.
 * After recoveryTimeout, one probe call is allowed (HALF_OPEN).
 * Success → CLOSED; failure → back to OPEN.
 *
 * Usage:
 *   const cb = new CircuitBreaker({ name: "OwnerView", failureThreshold: 5 });
 *   const result = await cb.execute(() => ownerviewClient.getHoleCards(...));
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private consecutiveFailures = 0;
  private lastOpenedAt = 0;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly name: string;
  private readonly log: ReturnType<typeof createLogger>;

  constructor(opts: CircuitBreakerOptions = {}) {
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.recoveryTimeoutMs = opts.recoveryTimeoutMs ?? 30_000;
    this.name = opts.name ?? "CircuitBreaker";
    this.log = createLogger({ service: this.name });
  }

  get circuitState(): CircuitState {
    return this.state;
  }

  /** Execute a call through the circuit breaker. */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionToHalfOpen();

    if (this.state === "OPEN") {
      throw new CircuitOpenError(
        `[${this.name}] Circuit is OPEN — skipping call (recovery in ${this.remainingRecoveryMs()}ms)`
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  /** Reset to CLOSED (e.g., after external confirmation of recovery). */
  reset(): void {
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
    this.log.info("Circuit manually reset to CLOSED");
  }

  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.log.info("Probe succeeded — circuit CLOSED");
    }
    this.state = "CLOSED";
    this.consecutiveFailures = 0;
  }

  private onFailure(): void {
    this.consecutiveFailures++;
    if (this.state === "HALF_OPEN") {
      // Probe failed: back to OPEN
      this.state = "OPEN";
      this.lastOpenedAt = Date.now();
      this.log.warn("Probe failed — circuit re-OPENED");
    } else if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = "OPEN";
      this.lastOpenedAt = Date.now();
      this.log.warn(
        { consecutiveFailures: this.consecutiveFailures },
        "Consecutive failures threshold reached — circuit OPENED"
      );
    }
  }

  private maybeTransitionToHalfOpen(): void {
    if (this.state === "OPEN" && Date.now() - this.lastOpenedAt >= this.recoveryTimeoutMs) {
      this.state = "HALF_OPEN";
      this.log.info("Recovery timeout elapsed — circuit HALF_OPEN (probing)");
    }
  }

  private remainingRecoveryMs(): number {
    return Math.max(0, this.recoveryTimeoutMs - (Date.now() - this.lastOpenedAt));
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}
