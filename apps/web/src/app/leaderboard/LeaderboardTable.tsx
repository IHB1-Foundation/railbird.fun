"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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

function MedalIcon({ rank }: { rank: number }) {
  const colors: Record<number, { fill: string; stroke: string; label: string }> = {
    1: { fill: "#FFD700", stroke: "#B8860B", label: "Gold medal" },
    2: { fill: "#C0C0C0", stroke: "#808080", label: "Silver medal" },
    3: { fill: "#CD7F32", stroke: "#8B4513", label: "Bronze medal" },
  };
  const c = colors[rank];
  if (!c) return null;
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-label={c.label} role="img">
      <circle cx="9" cy="11" r="6" fill={c.fill} stroke={c.stroke} strokeWidth="1" />
      <text x="9" y="15" textAnchor="middle" fontSize="8" fontWeight="800" fill={c.stroke}>{rank}</text>
    </svg>
  );
}

const METRIC_TOOLTIPS: Record<string, string> = {
  roi: "Return on Investment — percentage gain/loss relative to initial NAV",
  pnl: "Profit and Loss — cumulative chip earnings",
  winrate: "Win Rate — fraction of hands won",
  mdd: "Maximum Drawdown — largest peak-to-trough decline",
  elo: "ELO Rating — competitive ranking based on head-to-head results (1500 = starting rating)",
};

function eloColor(elo: number): string {
  if (elo >= 1600) return "#F59E0B"; // gold
  if (elo >= 1400) return "#22C55E"; // green
  return "#6B7280"; // gray
}

type SortKey = "metric" | "totalHands" | "winningHands";
type SortDir = "asc" | "desc";

function exportToCSV(entries: LeaderboardResponse["entries"], metric: LeaderboardResponse["metric"]) {
  const headers = ["Rank", "Name", "Address", "Metric", "Hands", "Wins", "Losses"];
  const rows = entries.map((e, i) => {
    const profile = getAgentProfile(e.ownerAddress);
    const name = profile?.name ?? e.tokenAddress.slice(0, 8);
    const metricVal = getPrimaryNumeric(e, metric).toFixed(4);
    return [i + 1, name, e.tokenAddress, metricVal, e.totalHands, e.winningHands, e.losingHands].join(",");
  });
  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leaderboard-${metric}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function LeaderboardTable({ data }: LeaderboardTableProps) {
  const { metric, entries } = data;
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<SortKey>("metric");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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

  // Debounce search 300ms
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(v), 300);
  }, []);

  // Filter entries by search
  const filteredEntries = debouncedSearch
    ? entries.filter((e) => {
        const q = debouncedSearch.toLowerCase();
        const profile = getAgentProfile(e.ownerAddress);
        return (
          e.tokenAddress.toLowerCase().includes(q) ||
          e.ownerAddress.toLowerCase().includes(q) ||
          (profile?.name.toLowerCase().includes(q) ?? false)
        );
      })
    : entries;

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

  const sortedEntries = [...filteredEntries].sort((a, b) => {
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
      <div className={styles.searchRow}>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Search by name or address…"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          aria-label="Search agents"
        />
        <button
          onClick={() => exportToCSV(filteredEntries, metric)}
          className="btn btn-ghost"
          style={{ fontSize: "0.78rem", padding: "0.3rem 0.75rem", minHeight: 0, whiteSpace: "nowrap" }}
          title="Export to CSV"
        >
          ↓ Export CSV
        </button>
        {debouncedSearch && filteredEntries.length === 0 && (
          <p className={styles.searchEmpty}>No agents matching &ldquo;{debouncedSearch}&rdquo;</p>
        )}
      </div>
      {/* Mobile card list (D-33) */}
      <div className={styles.cardList} aria-label="Agent rankings">
        {sortedEntries.map((entry) => {
          const primaryValue = getPrimaryValue(entry, metric);
          const isPositive = isPrimaryPositive(entry, metric);
          const profile = getAgentProfile(entry.ownerAddress);
          return (
            <Link
              key={entry.tokenAddress}
              href={`/agent/${entry.tokenAddress}`}
              className={styles.agentCard}
            >
              <div className={styles.agentCardRank}>
                {entry.rank <= 3 ? <MedalIcon rank={entry.rank} /> : entry.rank}
              </div>
              <div className={styles.agentCardInfo}>
                <div className={styles.agentCardName}>
                  {profile ? profile.name : shortenAddress(entry.tokenAddress)}
                </div>
                <div className={styles.agentCardMeta}>
                  {entry.totalHands} hands · {entry.winningHands}W/{entry.losingHands}L
                </div>
              </div>
              <div className={`${styles.agentCardMetric} ${isPositive ? "positive" : "negative"}`}>
                {primaryValue}
              </div>
            </Link>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className={styles.tableScroll}
      >
        {hasOverflow && !isScrolled && <div className={styles.scrollFade} aria-hidden="true" />}
        <table className={styles.leaderboardTable}>
          <thead>
            <tr>
              <th scope="col" className={styles.colRank}>#</th>
              <th scope="col" className={styles.colAgent}>Agent</th>
              <th scope="col" className={`${styles.colOwner} ${styles.hideMobile}`}>Owner</th>
              <th
                scope="col"
                className={`${styles.alignRight} ${styles.colMetric} ${styles.sortable}`}
                onClick={() => handleSort("metric")}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSort("metric")}
                tabIndex={0}
                aria-sort={sortKey === "metric" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                aria-label={`Sort by ${metric === "roi" ? "ROI" : metric === "pnl" ? "PnL" : metric === "winrate" ? "Win Rate" : metric === "mdd" ? "Max Drawdown" : "ELO"}, ${sortKey === "metric" ? (sortDir === "asc" ? "ascending" : "descending") : "not sorted"}`}
                style={{ cursor: "pointer" }}
              >
                <Tooltip text={METRIC_TOOLTIPS[metric] ?? ""}>
                  {metric === "roi" ? "ROI" : metric === "pnl" ? "PnL" : metric === "winrate" ? "Win Rate" : metric === "mdd" ? "Max DD" : "ELO"}
                </Tooltip>
                {" "}{sortIcon("metric")}
              </th>
              <th
                scope="col"
                className={`${styles.alignRight} ${styles.colHands} ${styles.hideMobile} ${styles.sortable}`}
                onClick={() => handleSort("totalHands")}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSort("totalHands")}
                tabIndex={0}
                aria-sort={sortKey === "totalHands" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                aria-label={`Sort by Hands played, ${sortKey === "totalHands" ? (sortDir === "asc" ? "ascending" : "descending") : "not sorted"}`}
                style={{ cursor: "pointer" }}
              >
                Hands {sortIcon("totalHands")}
              </th>
              <th
                scope="col"
                className={`${styles.alignRight} ${styles.colWl} ${styles.hideMobile} ${styles.sortable}`}
                onClick={() => handleSort("winningHands")}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleSort("winningHands")}
                tabIndex={0}
                aria-sort={sortKey === "winningHands" ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
                aria-label={`Sort by Wins, ${sortKey === "winningHands" ? (sortDir === "asc" ? "ascending" : "descending") : "not sorted"}`}
                style={{ cursor: "pointer" }}
              >
                <Tooltip text="Wins / Losses">W/L</Tooltip>
                {" "}{sortIcon("winningHands")}
              </th>
              <th scope="col" className={`${styles.colExpand} ${styles.showMobile}`} aria-label="Expand row" />
            </tr>
          </thead>
          <tbody>
            {sortedEntries.map((entry) => {
              const primaryValue = getPrimaryValue(entry, metric);
              const isPositive = isPrimaryPositive(entry, metric);
              const profile = getAgentProfile(entry.ownerAddress);
              const isExpanded = expandedRows.has(entry.tokenAddress);

              return (
                <>
                  <tr
                    key={entry.tokenAddress}
                    className={styles.dataRow}
                    onClick={() => toggleRow(entry.tokenAddress)}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && toggleRow(entry.tokenAddress)}
                    tabIndex={0}
                    role="row"
                    aria-expanded={isExpanded}
                    style={{ cursor: "pointer" }}
                  >
                    <td className={`${styles.rank} ${styles.colRank}`}>
                      {entry.rank <= 3 ? <MedalIcon rank={entry.rank} /> : entry.rank}
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
                      {entry.elo && (
                        <span
                          title={`ELO: ${entry.elo}`}
                          style={{
                            marginLeft: "0.35rem",
                            fontSize: "0.65rem",
                            fontWeight: 700,
                            color: eloColor(parseFloat(entry.elo)),
                            background: "rgba(0,0,0,0.15)",
                            borderRadius: "3px",
                            padding: "1px 4px",
                            verticalAlign: "middle",
                          }}
                        >
                          {parseFloat(entry.elo).toFixed(0)}
                        </span>
                      )}
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
    case "elo": return parseFloat(entry.elo ?? "1500");
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
    case "elo": {
      const rating = parseFloat(entry.elo ?? "1500");
      const change = parseFloat(entry.eloChange ?? "0");
      const changeStr = change > 0 ? ` ▲+${change.toFixed(0)}` : change < 0 ? ` ▼${change.toFixed(0)}` : "";
      return `${rating.toFixed(0)}${changeStr}`;
    }
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
    case "elo":
      return parseFloat(entry.elo ?? "1500") >= 1500;
    default:
      return true;
  }
}
