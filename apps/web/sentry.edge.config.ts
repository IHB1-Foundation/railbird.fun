// Sentry edge runtime configuration

import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN = process.env.SENTRY_DSN;
const CHAIN_ENV = process.env.CHAIN_ENV ?? "local";

if (SENTRY_DSN && CHAIN_ENV !== "local") {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: CHAIN_ENV,
    release: process.env.RELEASE,
    tracesSampleRate: CHAIN_ENV === "mainnet" ? 0.1 : 0.5,
  });
}
