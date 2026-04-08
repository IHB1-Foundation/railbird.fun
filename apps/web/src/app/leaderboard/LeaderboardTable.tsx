"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { shortenAddress, formatPercent, formatMon } from "@/lib/utils";
import { getAgentProfile } from "@/lib/agentProfiles";
import type { LeaderboardResponse } from "@/lib/types";
import { Tooltip } from "@/components/Tooltip";
import { AgentAvatar } from "@/components/AgentAvatar";
import styles from "./LeaderboardTable.module.css";

interface LeaderboardTableProps {
  data: LeaderboardResponse;
}

const RANK_MEDALS: Record<number, string> = { 1: "\uD83E\uDD47", 2: "\uD83E\uDD48", 3: "\uD83E\uDD49" };

const METRIC_TOOLTIPS: Record<string, string> = {
  roi: "Return on Investment — percentage gain/loss relative to initial NAV",
  pnl: "Profit and Loss — cumulative chip earnings",
  winrate: "Win Rate — fraction of hands won",
  mdd: "Maximum Drawdown — largest peak-to-trough decline",
};

type SortKey = "metric" | "totalHands" | "winningHands";
type SortDir = "asc" | "desc";

export function LeaderboardTable({ data }: LeaderboardTableProps) {
  const { metric, entries } = data;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("metric");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setHasOverflow(el.scrollWidth > el.clientWidth);
      setIsScrolled(el.scrollLeft > 0);
    };
    check();
    el.addEventListener("scroll", check);
    window.addEventListener("resize", check);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("resize", check);
    };
  }, []);

  const toggleRow = (tokenAddress: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(tokenAddress)) next.delete(tokenAddress);
      else next.add(tokenAddress);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sortedEntries = [...entries].sort((a, b) => {
    let av = 0;
    let bv = 0;
    if (sortKey === "metric") {
      av = getPrimaryNumeric(a, metric);
      bv = getPrimaryNumeric(b, metric);
    } else if (sortKey === "totalHands") {
      av = a.totalHands;
      bv = b.totalHands;
    } else if (sortKey === "winningHands") {
      av = a.winningHands;
      bv = b.winningHands;
    }
    return sortDir === "desc" ? bv - av : av - bv;
  });

  const sortIcon = (key: SortKey) => {
    if (sortKey !== key) return <span aria-hidden="true" style={{ opacity: 0.3 }}>↕</span>;
    return <span aria-hidden="true">{sortDir === "desc" ? "▼" : "▲"}</span>;
  };

  return (
    <div className={styles.tableWrapper}>
      <div
        ref={scrollRef}
        className={styles.tableScroll}
      >
        {hasOverflow && !isScrolled && <div className={styles.scrollFade} aria-hidden="true" />}
        <table className={styles.leaderboardTable}>
          <thead>
            <tr>
              <th className={styles.colRank}>#</th>
              <th className={styles.colAgent}>Agent</th>
              <th className={`${styles.colOwner} ${styles.hideMobile}`}>Owner</th>
              <th
                className={`${styles.alignRight} ${styles.colMetric} ${styles.sortable}`}
                onClick={() => handleSort("metric")}
                aria-sort={sortKey === "metric" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                style={{ cursor: "pointer" }}
              >
                <Tooltip text={METRIC_TOOLTIPS[metric] ?? ""}>
                  {metric === "roi" ? "ROI" : metric === "pnl" ? "PnL" : metric === "winrate" ? "Win Rate" : "Max DD"}
                </Tooltip>
                {" "}{sortIcon("metric")}
              </th>
              <th
                className={`${styles.alignRight} ${styles.colHands} ${styles.hideMobile} ${styles.sortable}`}
                onClick={() => handleSort("totalHands")}
                aria-sort={sortKey === "totalHands" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                style={{ cursor: "pointer" }}
              >
                Hands {sortIcon("totalHands")}
              </th>
              <th
                className={`${styles.alignRight} ${styles.colWl} ${styles.hideMobile} ${styles.sortable}`}
                onClick={() => handleSort("winningHands")}
                aria-sort={sortKey === "winningHands" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                style={{ cursor: "pointer" }}
              >
                <Tooltip text="Wins / Losses">W/L</Tooltip>
                {" "}{sortIcon("winningHands")}
              </th>
              <th className={`${styles.colExpand} ${styles.showMobile}`} aria-label="Expand row" />
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry) => {
              const primaryValue = getPrimaryValue(entry, metric);
              const isPositive = isPrimaryPositive(entry, metric);
              const profile = getAgentProfile(entry.ownerAddress);
              const medal = RANK_MEDALS[entry.rank];
              const isExpanded = expandedRows.has(entry.tokenAddress);

              return (
                <>
                  <tr
                    key={entry.tokenAddress}
                    className={styles.dataRow}
                    onClick={() => toggleRow(entry.tokenAddress)}
                    style={{ cursor: "pointer" }}
                  >
                    <td className={`${styles.rank} ${styles.colRank}`}>
                      {medal ? <span className={styles.medal}>{medal}</span> : entry.rank}
                    </td>
                    <td className={styles.colAgent}>
                      <Link
                        href={`/agent/${entry.tokenAddress}`}
                        className={`${profile ? "" : "text-mono"} ${styles.addressLink}`}
                        title={entry.tokenAddress}
                        style={{ display: "inline-flex", alignItems: "center", gap: "0.45rem" }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <AgentAvatar
                          name={profile?.name}
                          accentColor={profile?.accentColor}
                          colorHex={profile?.colorHex}
                          size={24}
                        />
                        {profile ? profile.name : shortenAddress(entry.tokenAddress)}
                      </Link>
                    </td>
                    <td
                      className={`text-mono text-muted ${styles.addressCell} ${styles.colOwner} ${styles.hideMobile}`}
                      title={entry.ownerAddress}
                    >
                      {shortenAddress(entry.ownerAddress)}
                    </td>
                    <td
                      className={`${styles.alignRight} ${styles.metricValue} ${styles.colMetric} ${isPositive ? "positive" : "negative"}`}
                    >
                      {primaryValue}
                    </td>
                    <td className={`${styles.alignRight} ${styles.colHands} ${styles.hideMobile}`}>{entry.totalHands}</td>
                    <td className={`${styles.alignRight} text-muted ${styles.colWl} ${styles.hideMobile}`}>
                      <span className="value-positive">▲{entry.winningHands}</span>
                      /
                      <span className="value-negative">▼{entry.losingHands}</span>
                    </td>
                    <td className={`${styles.colExpand} ${styles.showMobile}`}>
                      <span aria-expanded={isExpanded}>{isExpanded ? "▲" : "▼"}</span>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${entry.tokenAddress}-expanded`} className={`${styles.expandedRow} ${styles.showMobile}`}>
                      <td colSpan={3}>
                        <div className={styles.expandedDetails}>
                          <div>
                            <span className={styles.expandedLabel}>Owner</span>
                            <span className="text-mono text-muted">{shortenAddress(entry.ownerAddress)}</span>
                          </div>
                          <div>
                            <span className={styles.expandedLabel}>Hands</span>
                            <span>{entry.totalHands}</span>
                          </div>
                          <div>
                            <span className={styles.expandedLabel}>W/L</span>
                            <span>
                              <span className="value-positive">▲{entry.winningHands}</span>
                              /
                              <span className="value-negative">▼{entry.losingHands}</span>
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getPrimaryNumeric(
  entry: LeaderboardResponse["entries"][0],
  metric: LeaderboardResponse["metric"]
): number {
  switch (metric) {
    case "roi": return parseFloat(entry.roi);
    case "pnl": return Number(BigInt(entry.cumulativePnl)) / 1e18;
    case "winrate": return parseFloat(entry.winrate);
    case "mdd": return parseFloat(entry.mdd);
    default: return 0;
  }
}

function getPrimaryValue(
  entry: LeaderboardResponse["entries"][0],
  metric: LeaderboardResponse["metric"]
): string {
  switch (metric) {
    case "roi":
      return formatPercent(entry.roi);
    case "pnl":
      return formatMon(entry.cumulativePnl);
    case "winrate":
      return formatPercent(entry.winrate);
    case "mdd":
      return formatPercent(entry.mdd);
    default:
      return "--";
  }
}

function isPrimaryPositive(
  entry: LeaderboardResponse["entries"][0],
  metric: LeaderboardResponse["metric"]
): boolean {
  switch (metric) {
    case "roi":
      return parseFloat(entry.roi) >= 0;
    case "pnl":
      return BigInt(entry.cumulativePnl) >= 0n;
    case "winrate":
      return parseFloat(entry.winrate) >= 0.5;
    case "mdd":
      return parseFloat(entry.mdd) < 0.1;
    default:
      return true;
  }
}
