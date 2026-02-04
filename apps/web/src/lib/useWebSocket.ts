"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { WsMessage } from "./types";

const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002";

interface UseWebSocketOptions {
  tableId: string;
  onMessage?: (message: WsMessage) => void;
}

interface UseWebSocketReturn {
  connected: boolean;
  lastMessage: WsMessage | null;
  reconnect: () => void;
}

export function useWebSocket({
  tableId,
  onMessage,
}: UseWebSocketOptions): UseWebSocketReturn {
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WsMessage | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const ws = new WebSocket(`${WS_BASE}/ws/tables/${tableId}`);

      ws.onopen = () => {
        setConnected(true);
      };

      ws.onclose = () => {
        setConnected(false);
        // Auto-reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        ws.close();
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WsMessage;
          setLastMessage(message);
          onMessage?.(message);
        } catch {
          // Ignore parse errors
        }
      };

      wsRef.current = ws;
    } catch {
      // Connection failed, will retry
    }
  }, [tableId, onMessage]);

  const reconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    connect();
  }, [connect]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { connected, lastMessage, reconnect };
}
