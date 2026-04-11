// WebSocket connection manager - tracks connections per table

import type { WebSocket } from "ws";
import type { WsMessage, WsMessageType } from "./types.js";
import { createLogger } from "@playerco/shared";

const logger = createLogger({ service: "indexer:ws" });

/** Max outbound buffer size per client before forceful disconnect (10 MB) */
const MAX_BUFFERED_BYTES = 10 * 1024 * 1024;

export class WsManager {
  // Map of tableId -> Set of connected WebSocket clients
  private connections: Map<string, Set<WebSocket>> = new Map();

  // Subscribe a client to a table
  subscribe(tableId: string, ws: WebSocket): void {
    if (!this.connections.has(tableId)) {
      this.connections.set(tableId, new Set());
    }
    this.connections.get(tableId)!.add(ws);
    logger.info({ tableId, total: this.getSubscriberCount(tableId) }, "WS client subscribed");
  }

  // Unsubscribe a client from a table
  unsubscribe(tableId: string, ws: WebSocket): void {
    const clients = this.connections.get(tableId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.connections.delete(tableId);
      }
      logger.info({ tableId, remaining: this.getSubscriberCount(tableId) }, "WS client unsubscribed");
    }
  }

  // Unsubscribe a client from all tables (on disconnect)
  unsubscribeAll(ws: WebSocket): void {
    for (const [tableId, clients] of this.connections.entries()) {
      if (clients.has(ws)) {
        clients.delete(ws);
        if (clients.size === 0) {
          this.connections.delete(tableId);
        }
        logger.info({ tableId, remaining: this.getSubscriberCount(tableId) }, "WS client disconnected from all tables");
      }
    }
  }

  // Get number of subscribers for a table
  getSubscriberCount(tableId: string): number {
    return this.connections.get(tableId)?.size ?? 0;
  }

  /**
   * Broadcast a message to all clients subscribed to a table.
   *
   * Backpressure: if a client's bufferedAmount exceeds MAX_BUFFERED_BYTES,
   * the client is forcefully terminated and removed (slow client protection).
   */
  broadcast(tableId: string, type: WsMessageType, data: unknown): void {
    const clients = this.connections.get(tableId);
    if (!clients || clients.size === 0) {
      return;
    }

    const message: WsMessage = {
      type,
      tableId,
      timestamp: new Date().toISOString(),
      data,
    };

    const payload = JSON.stringify(message);

    let sent = 0;
    let failed = 0;
    let dropped = 0;

    for (const ws of clients) {
      try {
        if (ws.readyState !== ws.OPEN) {
          // Clean up closed connections
          clients.delete(ws);
          failed++;
          continue;
        }

        // Backpressure check: drop slow clients exceeding buffer threshold
        if ((ws as unknown as { bufferedAmount?: number }).bufferedAmount ?? 0 > MAX_BUFFERED_BYTES) {
          logger.warn({ tableId }, "WS client backpressure exceeded — terminating slow client");
          ws.terminate();
          clients.delete(ws);
          dropped++;
          continue;
        }

        ws.send(payload);
        sent++;
      } catch (error) {
        logger.error({ tableId, error }, "WS failed to send message to client");
        clients.delete(ws);
        failed++;
      }
    }

    if (sent > 0) {
      logger.debug({ tableId, type, sent }, "WS broadcast sent");
    }
    if (failed > 0) {
      logger.warn({ tableId, failed }, "WS removed stale connections");
    }
    if (dropped > 0) {
      logger.warn({ tableId, dropped }, "WS terminated slow clients (backpressure)");
    }
  }

  // Get statistics
  getStats(): { tables: number; totalConnections: number } {
    let totalConnections = 0;
    for (const clients of this.connections.values()) {
      totalConnections += clients.size;
    }
    return {
      tables: this.connections.size,
      totalConnections,
    };
  }
}

// Singleton instance
let instance: WsManager | null = null;

export function getWsManager(): WsManager {
  if (!instance) {
    instance = new WsManager();
  }
  return instance;
}

// For testing - reset the singleton
export function resetWsManager(): void {
  instance = null;
}
