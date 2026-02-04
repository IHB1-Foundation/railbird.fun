// WebSocket tests

import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { WsManager, resetWsManager, getWsManager } from "./manager.js";
import type { WebSocket } from "ws";

// Mock WebSocket for testing
function createMockWs(readyState: number = 1): WebSocket {
  const sentMessages: string[] = [];
  const ws = {
    readyState,
    OPEN: 1,
    CLOSED: 3,
    send: (data: string) => {
      if (ws.readyState === 1) {
        sentMessages.push(data);
      }
    },
    sentMessages,
  } as unknown as WebSocket & { sentMessages: string[] };
  return ws;
}

describe("WsManager", () => {
  beforeEach(() => {
    resetWsManager();
  });

  afterEach(() => {
    resetWsManager();
  });

  test("should subscribe client to table", () => {
    const manager = new WsManager();
    const ws = createMockWs();

    manager.subscribe("1", ws);

    assert.strictEqual(manager.getSubscriberCount("1"), 1);
  });

  test("should unsubscribe client from table", () => {
    const manager = new WsManager();
    const ws = createMockWs();

    manager.subscribe("1", ws);
    manager.unsubscribe("1", ws);

    assert.strictEqual(manager.getSubscriberCount("1"), 0);
  });

  test("should handle multiple clients for same table", () => {
    const manager = new WsManager();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    manager.subscribe("1", ws1);
    manager.subscribe("1", ws2);

    assert.strictEqual(manager.getSubscriberCount("1"), 2);
  });

  test("should handle clients for different tables", () => {
    const manager = new WsManager();
    const ws1 = createMockWs();
    const ws2 = createMockWs();

    manager.subscribe("1", ws1);
    manager.subscribe("2", ws2);

    assert.strictEqual(manager.getSubscriberCount("1"), 1);
    assert.strictEqual(manager.getSubscriberCount("2"), 1);
  });

  test("should unsubscribe client from all tables", () => {
    const manager = new WsManager();
    const ws = createMockWs();

    manager.subscribe("1", ws);
    manager.subscribe("2", ws);
    manager.unsubscribeAll(ws);

    assert.strictEqual(manager.getSubscriberCount("1"), 0);
    assert.strictEqual(manager.getSubscriberCount("2"), 0);
  });

  test("should broadcast message to all clients for a table", () => {
    const manager = new WsManager();
    const ws1 = createMockWs() as WebSocket & { sentMessages: string[] };
    const ws2 = createMockWs() as WebSocket & { sentMessages: string[] };

    manager.subscribe("1", ws1);
    manager.subscribe("1", ws2);

    manager.broadcast("1", "action", { test: "data" });

    assert.strictEqual(ws1.sentMessages.length, 1);
    assert.strictEqual(ws2.sentMessages.length, 1);

    const msg1 = JSON.parse(ws1.sentMessages[0]);
    assert.strictEqual(msg1.type, "action");
    assert.strictEqual(msg1.tableId, "1");
    assert.deepStrictEqual(msg1.data, { test: "data" });
  });

  test("should not broadcast to clients on different tables", () => {
    const manager = new WsManager();
    const ws1 = createMockWs() as WebSocket & { sentMessages: string[] };
    const ws2 = createMockWs() as WebSocket & { sentMessages: string[] };

    manager.subscribe("1", ws1);
    manager.subscribe("2", ws2);

    manager.broadcast("1", "action", { test: "data" });

    assert.strictEqual(ws1.sentMessages.length, 1);
    assert.strictEqual(ws2.sentMessages.length, 0);
  });

  test("should remove closed connections on broadcast", () => {
    const manager = new WsManager();
    const wsOpen = createMockWs(1);
    const wsClosed = createMockWs(3); // CLOSED state

    manager.subscribe("1", wsOpen);
    manager.subscribe("1", wsClosed);

    assert.strictEqual(manager.getSubscriberCount("1"), 2);

    manager.broadcast("1", "action", { test: "data" });

    // Closed connection should be removed
    assert.strictEqual(manager.getSubscriberCount("1"), 1);
  });

  test("should return correct stats", () => {
    const manager = new WsManager();
    const ws1 = createMockWs();
    const ws2 = createMockWs();
    const ws3 = createMockWs();

    manager.subscribe("1", ws1);
    manager.subscribe("1", ws2);
    manager.subscribe("2", ws3);

    const stats = manager.getStats();
    assert.strictEqual(stats.tables, 2);
    assert.strictEqual(stats.totalConnections, 3);
  });

  test("should handle broadcast to empty table", () => {
    const manager = new WsManager();

    // Should not throw
    manager.broadcast("999", "action", { test: "data" });

    assert.strictEqual(manager.getSubscriberCount("999"), 0);
  });

  test("singleton getWsManager returns same instance", () => {
    const manager1 = getWsManager();
    const manager2 = getWsManager();

    assert.strictEqual(manager1, manager2);
  });

  test("resetWsManager creates fresh instance", () => {
    const manager1 = getWsManager();
    manager1.subscribe("1", createMockWs());

    resetWsManager();

    const manager2 = getWsManager();
    assert.strictEqual(manager2.getSubscriberCount("1"), 0);
  });
});

describe("WsMessage format", () => {
  test("broadcast message has correct structure", () => {
    const manager = new WsManager();
    const ws = createMockWs() as WebSocket & { sentMessages: string[] };

    manager.subscribe("42", ws);
    manager.broadcast("42", "hand_settled", { winnerSeat: 1 });

    const msg = JSON.parse(ws.sentMessages[0]);
    assert.strictEqual(msg.type, "hand_settled");
    assert.strictEqual(msg.tableId, "42");
    assert.ok(msg.timestamp);
    assert.deepStrictEqual(msg.data, { winnerSeat: 1 });
  });
});
