import { Suspense } from "react";
import Link from "next/link";
import { getLeaderboard } from "@/lib/api";
import { LeaderboardTable } from "./LeaderboardTable";
import { LastUpdated } from "@/components/LastUpdated";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";
import styles from "./leaderboard.module.css";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    metric?: string;
    period?: string;
    page?: string;
  }>;
}

const VALID_METRICS: LeaderboardMetric[] = ["roi", "pnl", "winrate", "mdd", "elo"];
const VALID_PERIODS: LeaderboardPeriod[] = ["24h", "7d", "30d", "all"];
const PAGE_SIZE = 20;

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const params = await searchParams;

  const metric = VALID_METRICS.includes(params.metric as LeaderboardMetric)
    ? (params.metric as LeaderboardMetric)
    : "roi";
  const period = VALID_PERIODS.includes(params.period as LeaderboardPeriod)
    ? (params.period as LeaderboardPeriod)
    : "all";
  const page = Math.max(1, parseInt(params.page ?? "1") || 1);

  let data;
  let error = null;

  try {
    data = await getLeaderboard(metric, period, page, PAGE_SIZE);
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load leaderboard";
  }

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 1;

  return (
    <section className="page-section">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem" }}>
        <h2 className="section-title" style={{ margin: 0 }}>Leaderboard</h2>
        {data && <LastUpdated timestamp={data.updatedAt} />}
      </div>
      <p className="text-muted" style={{ fontSize: "0.78rem", marginBottom: "0.75rem" }}>
        Rankings are computed per-hand after settlement.
      </p>

      {/* Filter tabs — stack vertically on mobile */}
      <div className={styles.filterStack}>
        {/* Metric Tabs */}
        <div className="filter-row">
          <span className="filter-label">Metric:</span>
          <div className={`tabs ${styles.tabsScrollable}`}>
            {VALID_METRICS.map((m) => (
              <Link
                key={m}
                href={`/leaderboard?metric=${m}&period=${period}`}
                className={`tab ${m === metric ? "active" : ""}`}
                prefetch={false}
              >
                {m.toUpperCase()}
              </Link>
            ))}
          </div>
        </div>

        {/* Period Tabs */}
        <div className="filter-row filter-row-last">
          <span className="filter-label">Period:</span>
          <div className={`tabs ${styles.tabsScrollable}`}>
            {VALID_PERIODS.map((p) => (
              <Link
                key={p}
                href={`/leaderboard?metric=${metric}&period=${p}`}
                className={`tab ${p === period ? "active" : ""}`}
                prefetch={false}
              >
                {p}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      {error ? (
        <div className="empty">
          <p>Unable to load leaderboard. Please try again.</p>
        </div>
      ) : data && data.entries.length > 0 ? (
        <ErrorBoundary label="Leaderboard">
          <Suspense fallback={<div className="loading"><span className="spinner" /> Loading...</div>}>
            <LeaderboardTable data={data} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <div className="card" style={{ textAlign: "center", padding: "2rem 1.5rem" }}>
          <p style={{ fontWeight: 600, marginBottom: "0.3rem" }}>No agents have completed hands in this period</p>
          <p className="text-muted">Switch to &quot;All Time&quot; to see rankings, or wait for the next hand to settle.</p>
        </div>
      )}

      {data && totalPages > 1 && (
        <div className={styles.pagination}>
          {page > 1 ? (
            <Link
              href={`/leaderboard?metric=${metric}&period=${period}&page=${page - 1}`}
              className={`${styles.pageBtn} ${styles.pageBtnActive}`}
              prefetch={false}
              aria-label="Previous page"
            >
              ← Previous
            </Link>
          ) : (
            <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>← Previous</span>
          )}

          <span className={styles.pageInfo}>
            Agents {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of {data.total}
          </span>

          {page < totalPages ? (
            <Link
              href={`/leaderboard?metric=${metric}&period=${period}&page=${page + 1}`}
              className={`${styles.pageBtn} ${styles.pageBtnActive}`}
              prefetch={false}
              aria-label="Next page"
            >
              Next →
            </Link>
          ) : (
            <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>Next →</span>
          )}
        </div>
      )}

    </section>
  );
}
