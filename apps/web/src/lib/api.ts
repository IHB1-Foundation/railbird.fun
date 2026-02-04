// API client for the indexer service

import type {
  TableResponse,
  AgentResponse,
  LeaderboardResponse,
  LeaderboardMetric,
  LeaderboardPeriod,
  VaultSnapshotResponse,
  HandResponse,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:3002";

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}/api${path}`, {
    next: { revalidate: 10 }, // Cache for 10 seconds
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// Tables

export async function getTables(): Promise<TableResponse[]> {
  return fetchJson<TableResponse[]>("/tables");
}

export async function getTable(id: string): Promise<TableResponse> {
  return fetchJson<TableResponse>(`/tables/${id}`);
}

export async function getTableHands(
  tableId: string,
  limit = 10
): Promise<HandResponse[]> {
  return fetchJson<HandResponse[]>(`/tables/${tableId}/hands?limit=${limit}`);
}

// Agents

export async function getAgents(): Promise<AgentResponse[]> {
  return fetchJson<AgentResponse[]>("/agents");
}

export async function getAgent(token: string): Promise<AgentResponse> {
  return fetchJson<AgentResponse>(`/agents/${token}`);
}

export async function getAgentSnapshots(
  token: string,
  limit = 100
): Promise<VaultSnapshotResponse[]> {
  return fetchJson<VaultSnapshotResponse[]>(
    `/agents/${token}/snapshots?limit=${limit}`
  );
}

// Leaderboard

export async function getLeaderboard(
  metric: LeaderboardMetric = "roi",
  period: LeaderboardPeriod = "all"
): Promise<LeaderboardResponse> {
  return fetchJson<LeaderboardResponse>(
    `/leaderboard?metric=${metric}&period=${period}`
  );
}

// Health check

export async function getHealth(): Promise<{
  status: string;
  timestamp: string;
  websocket?: { tables: number; totalConnections: number };
}> {
  return fetchJson("/health");
}
