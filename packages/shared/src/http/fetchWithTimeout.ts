/**
 * fetch() wrapper with explicit AbortController timeout.
 *
 * Supports two call patterns:
 *   fetchWithTimeout(url, { timeoutMs: 15_000, ...fetchOptions })
 *   fetchWithTimeout(url, fetchOptions, timeoutMs)  ← legacy compat
 */

export interface FetchWithTimeoutOptions extends RequestInit {
  /** Timeout in milliseconds (default: 10_000) */
  timeoutMs?: number;
}

/**
 * Fetch a URL with an explicit AbortController timeout.
 * Throws a descriptive error on timeout (distinct from network errors).
 */
export async function fetchWithTimeout(
  url: string,
  optionsOrFetchInit: FetchWithTimeoutOptions | RequestInit = {},
  legacyTimeoutMs?: number
): Promise<Response> {
  const timeoutMs =
    legacyTimeoutMs ??
    (optionsOrFetchInit as FetchWithTimeoutOptions).timeoutMs ??
    10_000;

  // Strip timeoutMs from fetch options to avoid passing unknown fields to fetch()
  const { timeoutMs: _dropped, ...fetchOpts } = optionsOrFetchInit as FetchWithTimeoutOptions;
  void _dropped;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...fetchOpts, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
