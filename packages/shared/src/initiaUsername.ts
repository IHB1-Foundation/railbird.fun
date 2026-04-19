/**
 * Initia .init username resolver.
 *
 * Resolves Ethereum addresses to Initia .init usernames via the Initia
 * Names REST API. Results are cached in-memory for CACHE_TTL_MS.
 *
 * Environment:
 *   INITIA_NAMES_API_URL — base URL of the Initia names API
 *     default: https://rest.testnet.initia.xyz
 */

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_NAMES_API = "https://rest.testnet.initia.xyz";

interface CacheEntry {
  name: string | null;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function getCachedName(address: string): string | null | undefined {
  const entry = cache.get(address.toLowerCase());
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(address.toLowerCase());
    return undefined;
  }
  return entry.name;
}

function setCachedName(address: string, name: string | null): void {
  cache.set(address.toLowerCase(), { name, expiresAt: Date.now() + CACHE_TTL_MS });
}

/**
 * Resolve an EVM address to a .init username.
 * Returns null if no username is registered or on any network error.
 */
export async function resolveInitUsername(address: string): Promise<string | null> {
  const cached = getCachedName(address);
  if (cached !== undefined) return cached;

  const apiBase =
    (typeof process !== "undefined" && process.env.INITIA_NAMES_API_URL) || DEFAULT_NAMES_API;

  try {
    const url = `${apiBase}/initia/usernames/v1/username/${address.toLowerCase()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
    if (!res.ok) {
      setCachedName(address, null);
      return null;
    }
    const data = (await res.json()) as { username?: string; name?: string };
    const name = (data.username ?? data.name ?? null) as string | null;
    const dotInit = name && !name.endsWith(".init") ? `${name}.init` : name;
    setCachedName(address, dotInit);
    return dotInit;
  } catch {
    setCachedName(address, null);
    return null;
  }
}

/**
 * Batch-resolve multiple addresses. Returns a map from address (lowercase) to
 * the .init name (or null if not registered).
 */
export async function resolveInitUsernames(
  addresses: string[],
): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();
  await Promise.all(
    addresses.map(async (addr) => {
      const name = await resolveInitUsername(addr);
      results.set(addr.toLowerCase(), name);
    }),
  );
  return results;
}

/** Format: returns .init name if available, otherwise shortens the address. */
export function formatInitAddress(
  address: string,
  resolvedName: string | null | undefined,
): string {
  if (resolvedName) return resolvedName;
  const a = address.toLowerCase();
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Clear the in-memory cache (useful for testing). */
export function clearInitUsernameCache(): void {
  cache.clear();
}
