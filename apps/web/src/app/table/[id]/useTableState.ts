"use client";

import { useState, useEffect, useCallback } from "react";
import { type Address } from "viem";
import { getPokerTableMaxSeats } from "@/lib/pokerTableClient";
import type { TableResponse } from "@/lib/types";
import { INDEXER_BASE } from "@/lib/api";
import { useWebSocket, type WsStatus } from "@/lib/useWebSocket";
import { formatTimeRemaining } from "@/lib/utils";

const TABLE_MAX_SEATS = Number(process.env.NEXT_PUBLIC_TABLE_MAX_SEATS || "9");

/** Lightweight structural guard against injected WebSocket payloads. */
function isValidTableResponse(data: unknown): data is TableResponse {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.id !== "string") return false;
  if (typeof d.contractAddress !== "string") return false;
  if (!Array.isArray(d.seats)) return false;
  if (Array.isArray(d.actions)) {
    for (const action of d.actions) {
      if (!action || typeof action !== "object") return false;
      const a = action as Record<string, unknown>;
      if (typeof a.seatIndex !== "number") return false;
      if (typeof a.actionType !== "string") return false;
      if (typeof a.amount !== "string") return false;
    }
  }
  return true;
}

interface UseTableStateResult {
  table: TableResponse;
  maxSeats: number;
  timeRemaining: string;
  wsStatus: WsStatus;
  reconnectAttempts: number;
  nextRetryIn: number;
  refreshError: string | null;
  refreshRetryCount: number;
  refreshTable: () => Promise<void>;
}

export function useTableState(
  tableId: string,
  initialData: TableResponse
): UseTableStateResult {
  const [table, setTable] = useState(initialData);
  const [maxSeats, setMaxSeats] = useState<number>(TABLE_MAX_SEATS);
  const [timeRemaining, setTimeRemaining] = useState<string>("--");
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshRetryCount, setRefreshRetryCount] = useState(0);

  // Fetch on-chain max seats once per table address
  useEffect(() => {
    void (async () => {
      try {
        const onchainMaxSeats = await getPokerTableMaxSeats(table.contractAddress as Address);
        if (onchainMaxSeats > 0) {
          setMaxSeats(onchainMaxSeats);
        }
      } catch (err) {
        console.error("[useTableState] Failed to fetch max seats from contract:", err);
      }
    })();
  }, [table.contractAddress]);

  const refreshTable = useCallback(async () => {
    try {
      const res = await fetch(`${INDEXER_BASE}/api/tables/${tableId}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as TableResponse;
      setTable(data);
      setRefreshError(null);
      setRefreshRetryCount(0);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("[useTableState] Table fetch failed:", err);
      setRefreshError(`Table data refresh failed (${msg}). Retrying…`);
      setRefreshRetryCount((n) => n + 1);
    }
  }, [tableId]);

  const handleWsMessage = useCallback(
    (msg: { type: string; tableId: string; timestamp: string; data: unknown }) => {
      if (msg.type === "poll_update" || msg.type === "table_update") {
        const data = msg.data;
        if (!isValidTableResponse(data)) {
          console.warn("[useTableState] Received malformed table data over WebSocket, ignoring");
          return;
        }
        setTable(data);
      }
    },
    []
  );

  const { status: wsStatus, reconnectAttempts, nextRetryIn } = useWebSocket({ tableId, onMessage: handleWsMessage });

  // Update countdown timer every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(formatTimeRemaining(table.actionDeadline));
    }, 1000);
    return () => clearInterval(interval);
  }, [table.actionDeadline]);

  // Auto-retry table refresh with exponential backoff when it fails
  useEffect(() => {
    if (refreshRetryCount === 0) return;
    const delay = Math.min(1000 * Math.pow(2, refreshRetryCount - 1), 30_000);
    const timer = setTimeout(() => void refreshTable(), delay);
    return () => clearTimeout(timer);
  }, [refreshRetryCount, refreshTable]);

  return { table, maxSeats, timeRemaining, wsStatus, reconnectAttempts, nextRetryIn, refreshError, refreshRetryCount, refreshTable };
}
