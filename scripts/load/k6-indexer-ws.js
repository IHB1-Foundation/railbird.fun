/**
 * k6 Load Test — Indexer WebSocket
 *
 * Scenario: 500 concurrent WS connections, 5 minutes.
 * Target SLO: P99 message latency < 1s, no dropped messages.
 *
 * Usage:
 *   k6 run --env INDEXER_WS_URL=ws://localhost:3100/ws scripts/load/k6-indexer-ws.js
 *
 * Or with custom VUs:
 *   k6 run --vus 100 --duration 1m scripts/load/k6-indexer-ws.js
 */

import ws from "k6/ws";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

const messageLatency = new Trend("ws_message_latency", true);
const messagesReceived = new Counter("ws_messages_received");
const connectErrors = new Counter("ws_connect_errors");
const droppedRate = new Rate("ws_messages_dropped");

export const options = {
  stages: [
    { duration: "30s", target: 100 },   // ramp up to 100 VUs
    { duration: "1m",  target: 500 },   // ramp up to 500 VUs
    { duration: "3m",  target: 500 },   // sustain 500 VUs
    { duration: "30s", target: 0 },     // ramp down
  ],
  thresholds: {
    ws_message_latency: ["p(99)<1000"],  // P99 < 1s
    ws_connect_errors:  ["count<50"],    // < 50 connection failures
    ws_messages_dropped: ["rate<0.01"],  // < 1% drop rate
  },
};

const WS_URL = __ENV.INDEXER_WS_URL || "ws://localhost:3100/ws";

export default function () {
  const connectStart = Date.now();
  let connected = false;

  const res = ws.connect(WS_URL, {}, function (socket) {
    connected = true;

    socket.on("open", () => {
      // Subscribe to all tables
      socket.send(JSON.stringify({ type: "subscribe", tableId: "all" }));
    });

    socket.on("message", (data) => {
      const receivedAt = Date.now();
      messagesReceived.add(1);

      try {
        const msg = JSON.parse(data);
        if (msg.timestamp) {
          const latency = receivedAt - msg.timestamp;
          messageLatency.add(latency);
        }

        const dropped = check(msg, {
          "message has type": (m) => typeof m.type === "string",
        });
        droppedRate.add(!dropped ? 1 : 0);
      } catch {
        droppedRate.add(1);
      }
    });

    socket.on("error", (e) => {
      connectErrors.add(1);
    });

    socket.on("close", () => {
      connected = false;
    });

    // Keep connection alive for the VU duration
    socket.setTimeout(() => {
      socket.close();
    }, 30_000);
  });

  if (!connected || res.status !== 101) {
    connectErrors.add(1);
  }

  sleep(1);
}
