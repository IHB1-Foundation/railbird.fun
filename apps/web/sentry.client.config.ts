// Sentry client-side configuration (browser)
// @see https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;
const CHAIN_ENV = process.env.NEXT_PUBLIC_CHAIN_ENV ?? "local";

// Skip in local dev or when DSN is not configured
if (SENTRY_DSN && CHAIN_ENV !== "local") {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: CHAIN_ENV,
    release: process.env.NEXT_PUBLIC_RELEASE,
    // Sampling: mainnet 10%, testnet 50%
    tracesSampleRate: CHAIN_ENV === "mainnet" ? 0.1 : 0.5,
    // Replay 1% of sessions, 10% on errors
    replaysSessionSampleRate: 0.01,
    replaysOnErrorSampleRate: 0.1,
    integrations: [Sentry.replayIntegration()],
    beforeSend(event) {
      // Scrub wallet addresses (keep last 6 chars) and private keys
      function scrub(obj: unknown): unknown {
        if (typeof obj !== "object" || obj === null) return obj;
        const o = obj as Record<string, unknown>;
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(o)) {
          const key = k.toLowerCase();
          if (key.includes("privatekey") || key.includes("secret") || key.includes("signature")) {
            out[k] = "[REDACTED]";
          } else if (key.includes("address") && typeof v === "string" && v.startsWith("0x")) {
            out[k] = `0x***${v.slice(-6)}`;
          } else if (typeof v === "object") {
            out[k] = scrub(v);
          } else {
            out[k] = v;
          }
        }
        return out;
      }
      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      return event;
    },
  });
}
