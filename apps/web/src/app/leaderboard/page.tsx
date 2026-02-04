import { Suspense } from "react";
import { getLeaderboard } from "@/lib/api";
import { LeaderboardTable } from "./LeaderboardTable";
import type { LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    metric?: string;
    period?: string;
  }>;
}

const VALID_METRICS: LeaderboardMetric[] = ["roi", "pnl", "winrate", "mdd"];
const VALID_PERIODS: LeaderboardPeriod[] = ["24h", "7d", "30d", "all"];

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const metric = VALID_METRICS.includes(params.metric as LeaderboardMetric)
    ? (params.metric as LeaderboardMetric)
    : "roi";
  const period = VALID_PERIODS.includes(params.period as LeaderboardPeriod)
    ? (params.period as LeaderboardPeriod)
    : "all";

  let data;
  let error = null;

  try {
    data = await getLeaderboard(metric, period);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load leaderboard";
  }

  return (
    <div>
      <h2 style={{ marginBottom: "1rem" }}>Leaderboard</h2>

      {/* Metric Tabs */}
      <div style={{ marginBottom: "0.5rem" }}>
        <span style={{ color: "var(--muted)", fontSize: "0.875rem", marginRight: "0.5rem" }}>
          Metric:
        </span>
        <div className="tabs" style={{ display: "inline-flex" }}>
          {VALID_METRICS.map((m) => (
            <a
              key={m}
              href={`/leaderboard?metric=${m}&period=${period}`}
              className={`tab ${m === metric ? "active" : ""}`}
            >
              {m.toUpperCase()}
            </a>
          ))}
        </div>
      </div>

      {/* Period Tabs */}
      <div style={{ marginBottom: "1rem" }}>
        <span style={{ color: "var(--muted)", fontSize: "0.875rem", marginRight: "0.5rem" }}>
          Period:
        </span>
        <div className="tabs" style={{ display: "inline-flex" }}>
          {VALID_PERIODS.map((p) => (
            <a
              key={p}
              href={`/leaderboard?metric=${metric}&period=${p}`}
              className={`tab ${p === period ? "active" : ""}`}
            >
              {p}
            </a>
          ))}
        </div>
      </div>

      {/* Leaderboard Table */}
      {error ? (
        <div className="empty">
          <p>Unable to load leaderboard</p>
          <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>{error}</p>
        </div>
      ) : data && data.entries.length > 0 ? (
        <Suspense fallback={<div className="loading"><span className="spinner" /> Loading...</div>}>
          <LeaderboardTable data={data} />
        </Suspense>
      ) : (
        <div className="empty">
          <p>No agents with data for this period</p>
        </div>
      )}

      {data && (
        <div
          style={{
            marginTop: "1rem",
            fontSize: "0.75rem",
            color: "var(--muted)",
            textAlign: "right",
          }}
        >
          Last updated: {new Date(data.updatedAt).toLocaleString()}
        </div>
      )}
    </div>
  );
}
