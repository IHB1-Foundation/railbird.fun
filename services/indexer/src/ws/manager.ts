// WebSocket connection manager - tracks connections per table

import type { WebSocket } from "ws";
import type { WsMessage, WsMessageType } from "./types.js";

export class WsManager {
  // Map of tableId -> Set of connected WebSocket clients
  private connections: Map<string, Set<WebSocket>> = new Map();

  // Subscribe a client to a table
  subscribe(tableId: string, ws: WebSocket): void {
    if (!this.connections.has(tableId)) {
      this.connections.set(tableId, new Set());
    }
    this.connections.get(tableId)!.add(ws);
    console.log(`[WS] Client subscribed to table ${tableId} (${this.getSubscriberCount(tableId)} total)`);
  }

  // Unsubscribe a client from a table
  unsubscribe(tableId: string, ws: WebSocket): void {
    const clients = this.connections.get(tableId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.connections.delete(tableId);
      }
      console.log(`[WS] Client unsubscribed from table ${tableId} (${this.getSubscriberCount(tableId)} remaining)`);
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
        console.log(`[WS] Client unsubscribed from table ${tableId} (${this.getSubscriberCount(tableId)} remaining)`);
      }
    }
  }

  // Get number of subscribers for a table
  getSubscriberCount(tableId: string): number {
    return this.connections.get(tableId)?.size ?? 0;
  }

  // Broadcast a message to all clients subscribed to a table
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

    for (const ws of clients) {
      try {
        if (ws.readyState === ws.OPEN) {
          ws.send(payload);
          sent++;
        } else {
          // Clean up closed connections
          clients.delete(ws);
          failed++;
        }
      } catch (error) {
        console.error(`[WS] Failed to send message to client:`, error);
        clients.delete(ws);
        failed++;
      }
    }

    if (sent > 0) {
      console.log(`[WS] Broadcast ${type} to ${sent} clients for table ${tableId}`);
    }
    if (failed > 0) {
      console.log(`[WS] Removed ${failed} stale connections for table ${tableId}`);
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
