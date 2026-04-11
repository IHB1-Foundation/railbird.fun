/**
 * Exponential backoff retry wrapper for viem RPC calls.
 *
 * Usage:
 *   import { withRpcRetry } from "@playerco/shared";
 *   const block = await withRpcRetry(() => publicClient.getBlock());
 */

export interface RpcRetryOptions {
  /** Maximum number of attempts (including the first) */
  maxAttempts?: number;
  /** Initial delay in milliseconds */
  baseMs?: number;
  /** Maximum delay in milliseconds */
  maxMs?: number;
  /** Predicate — return true to retry this error, false to rethrow immediately */
  retryOn?: (err: unknown) => boolean;
}

/** Check if an error message or code suggests a retriable RPC condition */
function isRetriableByDefault(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  // Network-level errors
  if (msg.includes("network") || msg.includes("econnreset") || msg.includes("enotfound")) return true;
  if (msg.includes("etimedout") || msg.includes("timeout")) return true;
  // Rate limiting
  if (msg.includes("429") || msg.includes("too many requests")) return true;
  // Server errors (5xx)
  if (msg.includes("500") || msg.includes("502") || msg.includes("503") || msg.includes("504")) return true;
  // Nonce mismatch (requires nonce re-fetch by caller, but retry may help)
  if (msg.includes("nonce too low") || msg.includes("nonce too high")) return true;
  return false;
}

/** Sleep for `ms` milliseconds */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Add ±25% jitter to a delay value */
function withJitter(ms: number): number {
  return ms * (0.75 + Math.random() * 0.5);
}

/**
 * Wrap an async RPC call with exponential backoff + jitter.
 *
 * @param fn        Async function to call (typically a viem client call)
 * @param options   Retry configuration
 * @returns         The resolved value of fn()
 * @throws          The last error if all attempts are exhausted, or a non-retriable error immediately
 */
export async function withRpcRetry<T>(
  fn: () => Promise<T>,
  options: RpcRetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = 5,
    baseMs = 200,
    maxMs = 5_000,
    retryOn = isRetriableByDefault,
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!retryOn(err)) {
        // Non-retriable error — rethrow immediately
        throw err;
      }
      if (attempt === maxAttempts) {
        break; // exhausted
      }
      const delay = withJitter(Math.min(baseMs * 2 ** (attempt - 1), maxMs));
      await sleep(delay);
    }
  }
  throw lastError;
}
