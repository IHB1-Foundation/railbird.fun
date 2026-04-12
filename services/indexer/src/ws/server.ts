// WebSocket server for table streaming

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { getWsManager } from "./manager.js";
import type { WsConnectedData, WsErrorData } from "./types.js";
import { createLogger } from "@playerco/shared";
import { MessageRateLimiter } from "./rateLimiter.js";

export { MessageRateLimiter } from "./rateLimiter.js";

const logger = createLogger({ service: "indexer:ws" });

export interface WsServerConfig {
  httpServer: Server;
  path?: string;
  /** Max concurrent connections per IP (default 10) */
  maxConnectionsPerIp?: number;
  /** Heartbeat interval in ms (default 30000) */
  heartbeatIntervalMs?: number;
  /** Allowed origins (CSV); empty = allow all */
  allowedOrigins?: string;
  /** Max inbound messages per second per connection (default 20) */
  msgRateLimitPerSec?: number;
  /** Burst capacity for message rate limiter (default 20) */
  msgRateBurst?: number;
}

const MAX_CONNECTIONS_PER_IP = 10;
const HEARTBEAT_INTERVAL_MS = 30_000;
const MISSED_PONGS_LIMIT = 2;

// Per-connection message rate limit: 20 msg/sec, burst capacity of 20
const MSG_RATE_LIMIT_PER_SEC = 20;
const MSG_RATE_BURST = 20;

export function createWsServer(config: WsServerConfig): WebSocketServer {
  const maxConnsPerIp = config.maxConnectionsPerIp ?? MAX_CONNECTIONS_PER_IP;
  const heartbeatMs = config.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS;
  const msgRateLimitPerSec = config.msgRateLimitPerSec ?? MSG_RATE_LIMIT_PER_SEC;
  const msgRateBurst = config.msgRateBurst ?? MSG_RATE_BURST;
  const allowedOrigins = config.allowedOrigins
    ? new Set(
        config.allowedOrigins
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  const wss = new WebSocketServer({
    server: config.httpServer,
    path: config.path ?? "/ws",
    // Compress frames > 1 KB — reduces WS bandwidth significantly for JSON payloads
    perMessageDeflate: {
      zlibDeflateOptions: { level: 6 },
      threshold: 1024,
      concurrencyLimit: 10,
      serverNoContextTakeover: false,
      clientNoContextTakeover: false,
    },
  });

  // Start 50 ms batch flush window
  const manager = getWsManager();
  manager.startBatching(50);

  // Track active connections per IP
  const connsByIp = new Map<string, Set<WebSocket>>();

  function getClientIp(req: IncomingMessage): string {
    const fwd = req.headers["x-forwarded-for"];
    if (typeof fwd === "string") return fwd.split(",")[0].trim();
    return req.socket.remoteAddress ?? "unknown";
  }

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    // Origin validation
    if (allowedOrigins) {
      const origin = req.headers.origin ?? "";
      if (!allowedOrigins.has(origin)) {
        sendError(ws, "FORBIDDEN_ORIGIN", "Origin not allowed");
        ws.close(4403, "Forbidden origin");
        return;
      }
    }

    const ip = getClientIp(req);
    const ipConns = connsByIp.get(ip) ?? new Set<WebSocket>();
    if (ipConns.size >= maxConnsPerIp) {
      sendError(ws, "TOO_MANY_CONNECTIONS", `Max ${maxConnsPerIp} connections per IP`);
      ws.close(4029, "Too many connections");
      return;
    }
    ipConns.add(ws);
    connsByIp.set(ip, ipConns);

    const url = req.url ?? "";
    const tableId = parseTableId(url);

    if (!tableId) {
      sendError(ws, "INVALID_PATH", "Invalid WebSocket path. Use /ws/tables/:id");
      ws.close(4000, "Invalid path");
      ipConns.delete(ws);
      return;
    }

    const manager = getWsManager();
    manager.subscribe(tableId, ws);

    // Send connected confirmation
    sendConnected(ws, tableId);

    // Per-connection inbound rate limiter
    const rateLimiter = new MessageRateLimiter(msgRateLimitPerSec, msgRateBurst);

    // Heartbeat: ping every heartbeatMs, close if missed MISSED_PONGS_LIMIT pongs
    let missedPongs = 0;
    const heartbeat = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        clearInterval(heartbeat);
        return;
      }
      if (missedPongs >= MISSED_PONGS_LIMIT) {
        clearInterval(heartbeat);
        ws.terminate();
        return;
      }
      missedPongs++;
      ws.ping();
    }, heartbeatMs);

    ws.on("pong", () => {
      missedPongs = 0;
    });

    // Handle client messages (ping/pong, etc.)
    ws.on("message", (data) => {
      if (!rateLimiter.consume()) {
        logger.warn({ ip, tableId }, "WS rate limit exceeded, closing connection");
        sendError(ws, "RATE_LIMIT_EXCEEDED", "Message rate limit exceeded");
        ws.close(1008, "Policy Violation");
        return;
      }
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, tableId, message);
      } catch {
        // Ignore invalid JSON
      }
    });

    // Handle disconnect
    ws.on("close", () => {
      clearInterval(heartbeat);
      ipConns.delete(ws);
      if (ipConns.size === 0) connsByIp.delete(ip);
      manager.unsubscribe(tableId, ws);
    });

    // Handle errors
    ws.on("error", (error) => {
      logger.error({ ip, tableId, err: error }, "WS client error");
      clearInterval(heartbeat);
      ipConns.delete(ws);
      if (ipConns.size === 0) connsByIp.delete(ip);
      manager.unsubscribe(tableId, ws);
    });
  });

  logger.info({ path: config.path ?? "/ws" }, "WebSocket server initialized");
  return wss;
}

// Parse table ID from WebSocket URL path
// Expected format: /ws/tables/:id or /ws (with query param)
function parseTableId(url: string): string | null {
  // Try path format: /ws/tables/:id
  const pathMatch = url.match(/\/ws\/tables\/(\d+)/);
  if (pathMatch) {
    return pathMatch[1];
  }

  // Try query param format: /ws?tableId=:id
  const queryMatch = url.match(/[?&]tableId=(\d+)/);
  if (queryMatch) {
    return queryMatch[1];
  }

  return null;
}

function sendConnected(ws: WebSocket, tableId: string): void {
  const data: WsConnectedData = {
    message: `Subscribed to table ${tableId}`,
  };
  ws.send(
    JSON.stringify({
      type: "connected",
      tableId,
      timestamp: new Date().toISOString(),
      data,
    }),
  );
}

function sendError(ws: WebSocket, code: string, message: string): void {
  const data: WsErrorData = { code, message };
  ws.send(
    JSON.stringify({
      type: "error",
      tableId: "",
      timestamp: new Date().toISOString(),
      data,
    }),
  );
}

function handleClientMessage(ws: WebSocket, tableId: string, message: unknown): void {
  // Currently just ping/pong support
  if (typeof message === "object" && message !== null) {
    const msg = message as Record<string, unknown>;
    if (msg.type === "ping") {
      ws.send(
        JSON.stringify({
          type: "pong",
          tableId,
          timestamp: new Date().toISOString(),
          data: {},
        }),
      );
    }
  }
}
