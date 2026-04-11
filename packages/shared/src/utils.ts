// @playerco/shared - Common utility functions

export interface RequireEnvOptions {
  /** Minimum length the value must satisfy */
  minLength?: number;
  /** Regex the value must match */
  pattern?: RegExp;
}

/**
 * Read a required environment variable. Fails the process on missing or invalid values.
 * - Rejects placeholder sentinels ("replace-with-*")
 * - Optionally enforces minLength and regex pattern
 * - Logs a masked version of the value (last 4 chars) for audit visibility
 */
export function requireEnv(name: string, opts: RequireEnvOptions = {}): string {
  const value = process.env[name];
  if (!value) {
    const msg = `[startup] FATAL: Missing required environment variable: ${name}`;
    console.error(msg);
    process.exit(1);
  }
  if (value.startsWith("replace-with-")) {
    const msg = `[startup] FATAL: ${name} still contains a placeholder value. Replace it with the actual secret.`;
    console.error(msg);
    process.exit(1);
  }
  if (opts.minLength !== undefined && value.length < opts.minLength) {
    const msg = `[startup] FATAL: ${name} is too short (got ${value.length}, need ≥ ${opts.minLength})`;
    console.error(msg);
    process.exit(1);
  }
  if (opts.pattern !== undefined && !opts.pattern.test(value)) {
    const msg = `[startup] FATAL: ${name} does not match required pattern ${opts.pattern}`;
    console.error(msg);
    process.exit(1);
  }
  // Masked audit log: show only last 4 chars
  const masked = value.length > 4 ? `***${value.slice(-4)}` : "***";
  console.info(`[startup] ${name}=${masked}`);
  return value;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

/**
 * Convert a hex string (with or without 0x prefix) to a Uint8Array.
 */
export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Fetch with an AbortController timeout.
 * Throws a descriptive error if the request times out.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms: ${url}`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
