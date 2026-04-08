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

function deriveWsBase(): string {
  // Explicit WS URL takes highest priority
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_WS_URL) {
    return process.env.NEXT_PUBLIC_WS_URL;
  }
  // Derive from NEXT_PUBLIC_INDEXER_URL by converting http(s) protocol to ws(s)
  const indexerUrl =
    typeof process !== "undefined" ? process.env.NEXT_PUBLIC_INDEXER_URL : undefined;
  if (indexerUrl) {
    return indexerUrl.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
  }
  return "wss://indexer.railbird.fun";
}

const WS_BASE = deriveWsBase();

interface UseWebSocketResult {
  status: WsStatus;
  reconnectAttempts: number;
  nextRetryIn: number;
}

const MAX_BACKOFF_MS = 30000;

export function useWebSocket({
  tableId,
  onMessage,
  pollIntervalMs = 3000,
  maxReconnectAttempts = 10,
  baseReconnectDelayMs = 1000,
}: UseWebSocketOptions): UseWebSocketResult {
  const [status, setStatus] = useState<WsStatus>("connecting");
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [nextRetryIn, setNextRetryIn] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onMessageRef = useRef(onMessage);
  const wasPollRef = useRef(false);
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
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
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
    wasPollRef.current = true;
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
      const wasPolling = wasPollRef.current;
      reconnectCountRef.current = 0;
      setReconnectAttempts(0);
      setNextRetryIn(0);
      setStatus("connected");
      clearPoll();
      wasPollRef.current = false;
      if (wasPolling) {
        // Notify via a special message that the connection was restored
        onMessageRef.current({
          type: "ws_reconnected",
          tableId,
          timestamp: new Date().toISOString(),
          data: null,
        });
      }
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
      const delay = Math.min(baseReconnectDelayMs * Math.pow(2, reconnectCountRef.current), MAX_BACKOFF_MS);
      reconnectCountRef.current++;
      setReconnectAttempts(reconnectCountRef.current);
      setNextRetryIn(Math.ceil(delay / 1000));
      setStatus("reconnecting");
      // Countdown timer
      let remaining = Math.ceil(delay / 1000);
      countdownRef.current = setInterval(() => {
        remaining--;
        setNextRetryIn(Math.max(0, remaining));
      }, 1000);
      reconnectTimerRef.current = setTimeout(() => {
        if (countdownRef.current) {
          clearInterval(countdownRef.current);
          countdownRef.current = null;
        }
        connect();
      }, delay);
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

  return { status, reconnectAttempts, nextRetryIn };
}
