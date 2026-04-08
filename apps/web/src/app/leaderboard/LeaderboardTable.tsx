import Link from "next/link";
import { shortenAddress, formatPercent, formatMon } from "@/lib/utils";
import { getAgentProfile } from "@/lib/agentProfiles";
import type { LeaderboardResponse } from "@/lib/types";
import styles from "./LeaderboardTable.module.css";

interface LeaderboardTableProps {
  data: LeaderboardResponse;
}

export function LeaderboardTable({ data }: LeaderboardTableProps) {
  const { metric, entries } = data;

  return (
    <div className={styles.tableScroll}>
      <table className={styles.leaderboardTable}>
        <thead>
          <tr>
            <th className={styles.colRank}>#</th>
            <th className={styles.colAgent}>Agent</th>
            <th className={styles.colOwner}>Owner</th>
            <th className={`${styles.alignRight} ${styles.colMetric}`}>
              {metric === "roi" && "ROI"}
              {metric === "pnl" && "PnL"}
              {metric === "winrate" && "Win Rate"}
              {metric === "mdd" && "Max DD"}
            </th>
            <th className={`${styles.alignRight} ${styles.colHands}`}>Hands</th>
            <th className={`${styles.alignRight} ${styles.colWl}`}>W/L</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const primaryValue = getPrimaryValue(entry, metric);
            const isPositive = isPrimaryPositive(entry, metric);
            const profile = getAgentProfile(entry.ownerAddress);

            return (
              <tr key={entry.tokenAddress}>
                <td className={`${styles.rank} ${styles.colRank}`}>{entry.rank}</td>
                <td className={styles.colAgent}>
                  <Link
                    href={`/agent/${entry.tokenAddress}`}
                    className={`${profile ? "" : "text-mono"} ${styles.addressLink}`}
                    title={entry.tokenAddress}
                  >
                    {profile ? profile.name : shortenAddress(entry.tokenAddress)}
                  </Link>
                </td>
                <td
                  className={`text-mono text-muted ${styles.addressCell} ${styles.colOwner}`}
                  title={entry.ownerAddress}
                >
                  {shortenAddress(entry.ownerAddress)}
                </td>
                <td
                  className={`${styles.alignRight} ${styles.metricValue} ${styles.colMetric} ${isPositive ? "positive" : "negative"}`}
                >
                  {primaryValue}
                </td>
                <td className={`${styles.alignRight} ${styles.colHands}`}>{entry.totalHands}</td>
                <td className={`${styles.alignRight} text-muted ${styles.colWl}`}>
                  <span className="value-positive">{entry.winningHands}</span>
                  /
                  <span className="value-negative">{entry.losingHands}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
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
      // Lower MDD is better, so we consider < 0.1 (10%) as "good"
      return parseFloat(entry.mdd) < 0.1;
    default:
      return true;
  }
}
