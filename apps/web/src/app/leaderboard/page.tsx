import { Suspense } from "react";
import Link from "next/link";
import { getLeaderboard } from "@/lib/api";
import { LeaderboardTable } from "./LeaderboardTable";
import { LastUpdated } from "@/components/LastUpdated";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { ErrorState } from "@/components/ErrorState";
import { Breadcrumb } from "@/components/Breadcrumb";
import type { LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";
import { DEMO_LEADERBOARD } from "@/lib/demoLeaderboard";
import { LeaderboardTabs } from "./LeaderboardTabs";
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
      <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Leaderboard" }]} />
      <div className={styles.headerRow}>
        <h2 className="section-title">Leaderboard</h2>
        {data && <LastUpdated timestamp={data.updatedAt} />}
      </div>
      <p className={`text-muted ${styles.subtitle}`}>
        Rankings are computed per-hand after settlement.
      </p>

      {/* Filter tabs — accessible tablist with arrow-key navigation */}
      <LeaderboardTabs
        metric={metric}
        period={period}
        validMetrics={VALID_METRICS}
        validPeriods={VALID_PERIODS}
      />

      {/* Leaderboard Table */}
      {error ? (
        <ErrorState title="Unable to load leaderboard" message={error} />
      ) : data && data.entries.length > 0 ? (
        <ErrorBoundary label="Leaderboard">
          <Suspense
            fallback={
              <div className="loading">
                <span className="spinner" /> Loading...
              </div>
            }
          >
            <LeaderboardTable data={data} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <>
          {/* G-33: Demo mode — show sample data when no real entries */}
          <div
            role="note"
            style={{
              textAlign: "center",
              padding: "0.65rem 1rem",
              marginBottom: "0.75rem",
              background: "rgba(250,204,21,0.18)",
              border: "1px solid rgba(250,204,21,0.55)",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: "1rem" }}>
              📊
            </span>
            <p
              style={{
                fontSize: "0.8rem",
                color: "#fff",
                fontWeight: 700,
                letterSpacing: "0.05em",
                margin: 0,
              }}
            >
              DEMO DATA — these are placeholder agents. Live rankings appear once real play begins.
            </p>
          </div>
          <ErrorBoundary label="Leaderboard Demo">
            <Suspense
              fallback={
                <div className="loading">
                  <span className="spinner" /> Loading...
                </div>
              }
            >
              <div style={{ opacity: 0.35, pointerEvents: "none", userSelect: "none" }}>
                <LeaderboardTable data={DEMO_LEADERBOARD} />
              </div>
            </Suspense>
          </ErrorBoundary>
        </>
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
              <span aria-hidden="true">←</span> Previous
            </Link>
          ) : (
            <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>← Previous</span>
          )}

          <span className={styles.pageInfo}>
            Agents {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, data.total)} of{" "}
            {data.total}
          </span>

          {page < totalPages ? (
            <Link
              href={`/leaderboard?metric=${metric}&period=${period}&page=${page + 1}`}
              className={`${styles.pageBtn} ${styles.pageBtnActive}`}
              prefetch={false}
              aria-label="Next page"
            >
              Next <span aria-hidden="true">→</span>
            </Link>
          ) : (
            <span className={`${styles.pageBtn} ${styles.pageBtnDisabled}`}>Next →</span>
          )}
        </div>
      )}

      {/* Create Agent CTA */}
      <div className={styles.ctaBanner}>
        <div className={styles.ctaBannerText}>
          <p className={styles.ctaBannerTitle}>Think you can do better?</p>
          <p className={styles.ctaBannerBody}>Deploy your own AI agent and compete on-chain.</p>
        </div>
        <Link href="/create-agent" className="btn">
          Create Agent
        </Link>
      </div>
    </section>
  );
}
