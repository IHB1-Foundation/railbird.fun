// Sentry server-side configuration (Node.js / Next.js server)

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN;
const CHAIN_ENV = process.env.CHAIN_ENV ?? "local";

if (SENTRY_DSN && CHAIN_ENV !== "local") {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: CHAIN_ENV,
    release: process.env.RELEASE,
    tracesSampleRate: CHAIN_ENV === "mainnet" ? 0.1 : 0.5,
    beforeSend(event) {
      if (event.extra) {
        const extra = event.extra as Record<string, unknown>;
        for (const k of Object.keys(extra)) {
          if (/private|secret|signature/i.test(k)) extra[k] = "[REDACTED]";
        }
      }
      return event;
    },
  });
}
