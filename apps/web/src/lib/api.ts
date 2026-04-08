// API client for the indexer service

import type {
  TableResponse,
  AgentResponse,
  LeaderboardResponse,
  LeaderboardMetric,
  LeaderboardPeriod,
  VaultSnapshotResponse,
  HandResponse,
  PaginatedResponse,
} from "./types";

export const INDEXER_BASE = process.env.NEXT_PUBLIC_INDEXER_URL || "https://indexer.railbird.fun";

/** @deprecated Use INDEXER_BASE */
const API_BASE = INDEXER_BASE;

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_RETRIES = 2;

function generateRequestId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

async function fetchJson<T>(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  let lastError: Error | null = null;
  let retryAfterMs: number | null = null;
  const requestId = generateRequestId();

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${API_BASE}/api${path}`, {
        cache: "no-store",
        signal: controller.signal,
        headers: { "X-Request-ID": requestId },
      });

      if (!res.ok) {
        // Capture Retry-After for 429 before throwing
        if (res.status === 429) {
          const retryAfterHeader = res.headers.get("Retry-After");
          retryAfterMs = retryAfterHeader
            ? Math.min(parseInt(retryAfterHeader, 10) * 1000, 30_000)
            : null;
        }
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      return await res.json();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry on definitive errors (other 4xx, abort on last attempt)
      if (attempt === MAX_RETRIES || (err instanceof Error && !isRetryableError(err))) {
        break;
      }
      // Use Retry-After delay for 429, otherwise exponential back-off
      const delay = retryAfterMs ?? 200 * (attempt + 1);
      retryAfterMs = null;
      await new Promise((r) => setTimeout(r, delay));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error("Unknown fetch error");
}

function isRetryableError(err: Error): boolean {
  // Retry on network errors, timeouts, 429 (rate-limit, use Retry-After), and 5xx.
  // Do NOT retry on other 4xx (permanent client errors).
  if (err.name === "AbortError") return true;
  if (err.message.startsWith("API error: 429")) return true;
  return !err.message.startsWith("API error: 4");
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

export interface RevealedHolecardResponse {
  seatIndex: number;
  card1: number;
  card2: number;
  blockNumber: string;
  txHash: string;
}

export async function getRevealedHolecards(
  tableId: string,
  handId: string
): Promise<RevealedHolecardResponse[]> {
  return fetchJson<RevealedHolecardResponse[]>(
    `/tables/${tableId}/hands/${handId}/revealed-holecards`
  );
}

// Agents

export async function getAgents(
  page = 1,
  limit = 20
): Promise<PaginatedResponse<AgentResponse>> {
  return fetchJson<PaginatedResponse<AgentResponse>>(
    `/agents?page=${page}&limit=${limit}`
  );
}

export async function getAgentsByOwner(ownerAddress: string): Promise<AgentResponse[]> {
  return fetchJson<AgentResponse[]>(`/agents?owner=${encodeURIComponent(ownerAddress)}`);
}

export interface RebalanceEventResponse {
  id: number;
  vaultAddress: string;
  handId: string;
  direction: "buy" | "sell";
  amountIn: string;
  amountOut: string;
  navBefore: string;
  navAfter: string;
  blockNumber: string;
  txHash: string;
  timestamp: string;
}

export async function getAgentRebalances(token: string, limit = 50): Promise<RebalanceEventResponse[]> {
  return fetchJson<RebalanceEventResponse[]>(`/agents/${token}/rebalances?limit=${limit}`);
}

export interface TreasuryReasoningEntry {
  vaultAddress: string;
  handId: string;
  action: "buy" | "sell" | "skip";
  amountBps: number;
  reasoning: string;
  confidence: number;
  factors: {
    navVsMarket: string;
    pnlTrend: string;
    sizeJustification: string;
  };
  txHash?: string;
  timestamp: number;
}

/**
 * Fetch all treasury AI reasoning entries for a vault from OwnerView.
 * Server-side only (uses internal URL env var).
 */
export async function getTreasuryReasoningAll(vaultAddress: string): Promise<TreasuryReasoningEntry[]> {
  const base =
    process.env.OWNERVIEW_INTERNAL_URL ||
    process.env.NEXT_PUBLIC_OWNERVIEW_URL ||
    "https://ownerview.railbird.fun";
  try {
    const res = await fetch(
      `${base}/treasury-reasoning?vaultAddress=${encodeURIComponent(vaultAddress)}`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) return [];
    const data = await res.json() as { entries?: TreasuryReasoningEntry[] };
    return data.entries ?? [];
  } catch {
    return [];
  }
}

export async function getAgent(token: string): Promise<AgentResponse> {
  return fetchJson<AgentResponse>(`/agents/${token}`);
}

export async function getAgentHands(token: string, limit = 20): Promise<HandResponse[]> {
  return fetchJson<HandResponse[]>(`/agents/${token}/hands?limit=${limit}`);
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
  period: LeaderboardPeriod = "all",
  page = 1,
  limit = 20
): Promise<LeaderboardResponse> {
  return fetchJson<LeaderboardResponse>(
    `/leaderboard?metric=${metric}&period=${period}&page=${page}&limit=${limit}`
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
