// WebSocket server for table streaming

import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import type { IncomingMessage } from "http";
import { getWsManager } from "./manager.js";
import type { WsConnectedData, WsErrorData } from "./types.js";

export interface WsServerConfig {
  httpServer: Server;
  path?: string;
}

export function createWsServer(config: WsServerConfig): WebSocketServer {
  const wss = new WebSocketServer({
    server: config.httpServer,
    path: config.path ?? "/ws",
  });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = req.url ?? "";
    const tableId = parseTableId(url);

    if (!tableId) {
      sendError(ws, "INVALID_PATH", "Invalid WebSocket path. Use /ws/tables/:id");
      ws.close(4000, "Invalid path");
      return;
    }

    const manager = getWsManager();
    manager.subscribe(tableId, ws);

    // Send connected confirmation
    sendConnected(ws, tableId);

    // Handle client messages (ping/pong, etc.)
    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleClientMessage(ws, tableId, message);
      } catch (error) {
        // Ignore invalid JSON
      }
    });

    // Handle disconnect
    ws.on("close", () => {
      manager.unsubscribe(tableId, ws);
    });

    // Handle errors
    ws.on("error", (error) => {
      console.error(`[WS] Client error:`, error);
      manager.unsubscribe(tableId, ws);
    });
  });

  console.log(`[WS] WebSocket server initialized on path ${config.path ?? "/ws"}`);
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
  ws.send(JSON.stringify({
    type: "connected",
    tableId,
    timestamp: new Date().toISOString(),
    data,
  }));
}

function sendError(ws: WebSocket, code: string, message: string): void {
  const data: WsErrorData = { code, message };
  ws.send(JSON.stringify({
    type: "error",
    tableId: "",
    timestamp: new Date().toISOString(),
    data,
  }));
}

function handleClientMessage(ws: WebSocket, tableId: string, message: unknown): void {
  // Currently just ping/pong support
  if (typeof message === "object" && message !== null) {
    const msg = message as Record<string, unknown>;
    if (msg.type === "ping") {
      ws.send(JSON.stringify({
        type: "pong",
        tableId,
        timestamp: new Date().toISOString(),
        data: {},
      }));
    }
  }
}
