import { randomUUID } from "node:crypto";
import { withTraceId } from "../logger.js";

interface TraceRequest {
  headers: Record<string, string | string[] | undefined>;
}

interface TraceResponse {
  setHeader(name: string, value: string): this;
}

type TraceNext = () => void;
type TraceHandler = (req: TraceRequest, res: TraceResponse, next: TraceNext) => void;

/**
 * Express-compatible middleware that injects a trace ID into every request's
 * async context. All log lines within that request automatically include traceId.
 *
 * - Reuses `X-Trace-Id` header if present (forwarded from upstream)
 * - Generates a new UUID otherwise
 * - Echoes the trace ID in the response header
 */
export function traceIdMiddleware(): TraceHandler {
  return function(req: TraceRequest, res: TraceResponse, next: TraceNext): void {
    const incoming = req.headers["x-trace-id"];
    const traceId =
      (typeof incoming === "string" && incoming.length > 0 ? incoming : null) ??
      randomUUID();

    res.setHeader("X-Trace-Id", traceId);

    withTraceId(traceId, next);
  };
}
