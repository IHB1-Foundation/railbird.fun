/**
 * Shared Sentry initialisation for Node.js services and bots.
 *
 * Usage:
 *   import { initSentry } from "@playerco/shared/observability/sentry";
 *   initSentry({ service: "indexer" }); // call BEFORE other imports
 *
 * Requires env vars:
 *   SENTRY_DSN     — Sentry Data Source Name
 *   CHAIN_ENV      — "local" | "testnet" | "mainnet" (maps to Sentry environment)
 *   RELEASE        — optional release tag (e.g. git SHA)
 */

export interface SentryInitOptions {
  /** Service name used as the Sentry `transaction` prefix */
  service: string;
  /** Override environment (defaults to CHAIN_ENV env var) */
  environment?: string;
  /** Override DSN (defaults to SENTRY_DSN env var) */
  dsn?: string;
  /** Override release (defaults to RELEASE env var) */
  release?: string;
}

/**
 * Scrub PII from Sentry events.
 * - Wallet private keys / signatures → redacted
 * - Wallet addresses → hashed (last 6 chars only)
 */
function scrubPii(data: unknown): unknown {
  if (typeof data !== "object" || data === null) return data;
  const obj = data as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase();
    if (key.includes("private_key") || key.includes("privatekey") || key.includes("signature") || key.includes("secret")) {
      out[k] = "[REDACTED]";
    } else if (key.includes("address") && typeof v === "string" && v.startsWith("0x")) {
      out[k] = `0x***${v.slice(-6)}`;
    } else if (typeof v === "object") {
      out[k] = scrubPii(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Initialise Sentry for Node.js services/bots.
 * No-ops if SENTRY_DSN is absent (local development) or CHAIN_ENV is "local".
 */
export function initSentry(opts: SentryInitOptions): void {
  const dsn = opts.dsn ?? process.env.SENTRY_DSN;
  const environment = opts.environment ?? process.env.CHAIN_ENV ?? "local";
  const release = opts.release ?? process.env.RELEASE;

  // Skip Sentry in local development or when DSN is not configured
  if (!dsn || environment === "local") {
    return;
  }

  // Dynamic import to avoid loading Sentry in local environments
  // where it's not installed in the workspace package (only root devDep)
  void (async () => {
    try {
      const Sentry = await import("@sentry/node");

      // Sampling: prod=10%, testnet=50%
      const tracesSampleRate = environment === "mainnet" ? 0.1 : 0.5;

      Sentry.init({
        dsn,
        environment,
        release,
        tracesSampleRate,
        serverName: opts.service,
        beforeSend(event) {
          // Scrub PII from event extra/contexts
          if (event.extra) event.extra = scrubPii(event.extra) as Record<string, unknown>;
          if (event.contexts) event.contexts = scrubPii(event.contexts) as Record<string, Record<string, unknown>>;
          return event;
        },
      });

      console.info(`[sentry] Initialised for service=${opts.service} env=${environment}`);
    } catch {
      // Sentry not available (e.g., not installed in this workspace)
      console.warn("[sentry] @sentry/node not available — error tracking disabled");
    }
  })();
}
