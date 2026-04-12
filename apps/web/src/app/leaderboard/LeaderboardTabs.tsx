"use client";

import { useRouter } from "next/navigation";
import { useRef } from "react";
import type { LeaderboardMetric, LeaderboardPeriod } from "@/lib/types";
import { Tooltip } from "@/components/Tooltip";
import styles from "./leaderboard.module.css";

const METRIC_GLOSSARY: Record<string, string> = {
  roi: "Return on Investment — profit as a % of total buy-in across all hands",
  pnl: "Profit and Loss — net chip gain or loss in absolute terms",
  mdd: "Maximum Drawdown — largest peak-to-trough chip loss. Lower is more stable",
  elo: "Elo rating — skill estimate based on win/loss vs opponents of known strength",
  hands: "Total number of poker hands played",
  winrate: "% of hands won at showdown",
};

interface LeaderboardTabsProps {
  metric: LeaderboardMetric;
  period: LeaderboardPeriod;
  validMetrics: LeaderboardMetric[];
  validPeriods: LeaderboardPeriod[];
}

export function LeaderboardTabs({
  metric,
  period,
  validMetrics,
  validPeriods,
}: LeaderboardTabsProps) {
  const router = useRouter();
  const metricRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const periodRefs = useRef<(HTMLAnchorElement | null)[]>([]);

  function handleTabKeyDown(
    e: React.KeyboardEvent,
    index: number,
    refs: React.MutableRefObject<(HTMLAnchorElement | null)[]>,
  ) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (index + 1) % refs.current.length;
      refs.current[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (index - 1 + refs.current.length) % refs.current.length;
      refs.current[prev]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      refs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      refs.current[refs.current.length - 1]?.focus();
    }
  }

  return (
    <div className={styles.filterStack}>
      {/* Metric Tabs */}
      <div className="filter-row">
        <span className="filter-label" id="metric-label">
          Metric:
        </span>
        <div
          className={`tabs ${styles.tabsScrollable}`}
          role="tablist"
          aria-labelledby="metric-label"
        >
          {validMetrics.map((m, i) => {
            const glossary = METRIC_GLOSSARY[m.toLowerCase()];
            return (
              <a
                key={m}
                ref={(el) => {
                  metricRefs.current[i] = el;
                }}
                href={`/leaderboard?metric=${m}&period=${period}`}
                className={`tab ${m === metric ? "active" : ""}`}
                role="tab"
                aria-selected={m === metric}
                tabIndex={m === metric ? 0 : -1}
                onKeyDown={(e) => handleTabKeyDown(e, i, metricRefs)}
                onClick={(e) => {
                  e.preventDefault();
                  router.push(`/leaderboard?metric=${m}&period=${period}`);
                }}
              >
                {glossary ? <Tooltip text={glossary}>{m.toUpperCase()}</Tooltip> : m.toUpperCase()}
              </a>
            );
          })}
        </div>
      </div>

      {/* Period Tabs */}
      <div className="filter-row filter-row-last">
        <span className="filter-label" id="period-label">
          Period:
        </span>
        <div
          className={`tabs ${styles.tabsScrollable}`}
          role="tablist"
          aria-labelledby="period-label"
        >
          {validPeriods.map((p, i) => (
            <a
              key={p}
              ref={(el) => {
                periodRefs.current[i] = el;
              }}
              href={`/leaderboard?metric=${metric}&period=${p}`}
              className={`tab ${p === period ? "active" : ""}`}
              role="tab"
              aria-selected={p === period}
              tabIndex={p === period ? 0 : -1}
              onKeyDown={(e) => handleTabKeyDown(e, i, periodRefs)}
              onClick={(e) => {
                e.preventDefault();
                router.push(`/leaderboard?metric=${metric}&period=${p}`);
              }}
            >
              {p}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
