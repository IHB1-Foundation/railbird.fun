"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { TableResponse } from "./types";

export type WsStatus = "connecting" | "connected" | "reconnecting" | "polling";

interface WsMessage {
  type: string;
  tableId: string;
  timestamp: string;
  data: unknown;
}

interface UseWebSocketOptions {
  tableId: string;
  onMessage: (msg: WsMessage) => void;
  /** Fallback polling interval when WebSocket is unavailable (ms, default 3000). */
  pollIntervalMs?: number;
  /** Max reconnect attempts before falling back to polling (default 5). */
  maxReconnectAttempts?: number;
  /** Base reconnect delay in ms (default 1000, doubles each attempt). */
  baseReconnectDelayMs?: number;
}

const WS_BASE =
  (typeof process !== "undefined" && process.env.NEXT_PUBLIC_INDEXER_WS_URL) ||
  "wss://indexer.railbird.fun";

export function useWebSocket({
  tableId,
  onMessage,
  pollIntervalMs = 3000,
  maxReconnectAttempts = 5,
  baseReconnectDelayMs = 1000,
}: UseWebSocketOptions): WsStatus {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearReconnectTimer();
    clearPoll();
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;
      wsRef.current.onmessage = null;
      wsRef.current.close();
      wsRef.current = null;
    }
  }, [clearPoll, clearReconnectTimer]);

  // Falls back to polling when WebSocket is unavailable
  const startPolling = useCallback(() => {
    clearPoll();
    setStatus("polling");
    const indexerBase =
      (typeof process !== "undefined" && process.env.NEXT_PUBLIC_INDEXER_URL) ||
      "https://indexer.railbird.fun";
    pollTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${indexerBase}/api/tables/${tableId}`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const data = (await res.json()) as TableResponse;
        onMessageRef.current({
          type: "poll_update",
          tableId,
          timestamp: new Date().toISOString(),
          data,
        });
      } catch {
        // ignore poll errors
      }
    }, pollIntervalMs);
  }, [tableId, pollIntervalMs, clearPoll]);

  const connect = useCallback(() => {
    disconnect();

    // Don't connect if page is hidden
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }

    const wsUrl = `${WS_BASE}/ws/tables/${tableId}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(wsUrl);
    } catch {
      // WebSocket not supported or URL invalid — fall back to polling
      startPolling();
      return;
    }

    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      reconnectCountRef.current = 0;
      setStatus("connected");
      clearPoll();
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as WsMessage;
        onMessageRef.current(msg);
      } catch {
        // Log malformed messages so production issues are debuggable.
        const preview =
          typeof event.data === "string"
            ? event.data.slice(0, 120)
            : "(non-string)";
        console.warn(`[useWebSocket] Malformed WS message for table ${tableId}:`, preview);
      }
    };

    ws.onclose = () => {
      if (reconnectCountRef.current >= maxReconnectAttempts) {
        startPolling();
        return;
      }
      const delay = baseReconnectDelayMs * Math.pow(2, reconnectCountRef.current);
      reconnectCountRef.current++;
      setStatus("reconnecting");
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      // onclose will handle reconnect/fallback
    };
  }, [
    tableId,
    disconnect,
    startPolling,
    maxReconnectAttempts,
    baseReconnectDelayMs,
    clearPoll,
  ]);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId]);

  // Pause on page hide, resume on page show
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        // Close WS and stop polling to save resources
        if (wsRef.current) {
          wsRef.current.onclose = null;
          wsRef.current.close();
          wsRef.current = null;
        }
        clearPoll();
        clearReconnectTimer();
      } else {
        // Page became visible again — reconnect
        reconnectCountRef.current = 0;
        connect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [connect, clearPoll, clearReconnectTimer]);

  return status;
}
