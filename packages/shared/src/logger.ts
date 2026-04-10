// Structured logger using pino.
// Pretty transport is enabled only in explicit development mode so missing
// optional local tooling never crashes tests or default CLI runs.

import pino from "pino";

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
  });
}
