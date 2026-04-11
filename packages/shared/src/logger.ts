// Structured logger using pino.
// Pretty transport is enabled only in explicit development mode so missing
// optional local tooling never crashes tests or default CLI runs.

import { AsyncLocalStorage } from "node:async_hooks";
import pino from "pino";

// ── Trace ID propagation via AsyncLocalStorage ─────────────────────────────

interface TraceContext {
  traceId: string;
}

/** Storage for the current trace context (per async chain) */
export const traceStorage = new AsyncLocalStorage<TraceContext>();

/** Get the trace ID for the current async context, if any */
export function getTraceId(): string | undefined {
  return traceStorage.getStore()?.traceId;
}

/** Run a callback in a new trace context */
export function withTraceId<T>(traceId: string, fn: () => T): T {
  return traceStorage.run({ traceId }, fn);
}

export type LogLevel = "error" | "warn" | "info" | "debug";

export interface LoggerOptions {
  /** Service name included in every log line */
  service: string;
  /** Override log level (defaults to NODE_ENV-based selection) */
  level?: LogLevel;
}

/**
 * Create a structured logger for a service or bot.
 *
 * Usage:
 *   import { createLogger } from "@playerco/shared";
 *   const logger = createLogger({ service: "indexer" });
 *   logger.info({ tableId }, "Hand started");
 */
export function createLogger({ service, level }: LoggerOptions): pino.Logger {
  const defaultLevel: LogLevel =
    process.env.LOG_LEVEL as LogLevel ||
    (process.env.NODE_ENV === "production" ? "info" : "debug");

  const transport =
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "HH:MM:ss",
            ignore: "pid,hostname",
          },
        }
      : undefined;

  return pino({
    name: service,
    level: level ?? defaultLevel,
    ...(transport ? { transport } : {}),
    base: { service },
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    // Automatically inject traceId from AsyncLocalStorage if present
    mixin() {
      const traceId = getTraceId();
      return traceId ? { traceId } : {};
    },
  });
}
