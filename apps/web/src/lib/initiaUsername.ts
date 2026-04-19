/**
 * .init username utilities — usable in both server and client contexts.
 * The React hook is in useInitiaUsername.ts (client-only).
 */

const CACHE_TTL_MS = 5 * 60 * 1000;
interface Entry {
  name: string | null;
  expiresAt: number;
}
const cache = new Map<string, Entry>();

function getCached(addr: string): string | null | undefined {
  const e = cache.get(addr.toLowerCase());
  if (!e) return undefined;
  if (Date.now() > e.expiresAt) {
    cache.delete(addr.toLowerCase());
    return undefined;
  }
  return e.name;
}

const NAMES_API = process.env.NEXT_PUBLIC_INITIA_NAMES_API_URL ?? "https://rest.testnet.initia.xyz";

/** Fetch a .init username for an address. Returns null if not registered. */
export async function fetchInitUsername(address: string): Promise<string | null> {
  const cached = getCached(address);
  if (cached !== undefined) return cached;

  try {
    const res = await fetch(`${NAMES_API}/initia/usernames/v1/username/${address.toLowerCase()}`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) {
      cache.set(address.toLowerCase(), { name: null, expiresAt: Date.now() + CACHE_TTL_MS });
      return null;
    }
    const data = (await res.json()) as { username?: string; name?: string };
    const raw = (data.username ?? data.name ?? null) as string | null;
    const name = raw && !raw.endsWith(".init") ? `${raw}.init` : raw;
    cache.set(address.toLowerCase(), { name, expiresAt: Date.now() + CACHE_TTL_MS });
    return name;
  } catch {
    cache.set(address.toLowerCase(), { name: null, expiresAt: Date.now() + CACHE_TTL_MS });
    return null;
  }
}

/** Format: .init name if known, otherwise shortened hex address. */
export function formatInitAddress(address: string, name: string | null | undefined): string {
  if (name) return name;
  const a = address.toLowerCase();
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}
