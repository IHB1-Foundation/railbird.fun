import Link from "next/link";
import { shortenAddress, formatPercent, formatMon } from "@/lib/utils";
import type { LeaderboardResponse } from "@/lib/types";

interface LeaderboardTableProps {
  data: LeaderboardResponse;
}

export function LeaderboardTable({ data }: LeaderboardTableProps) {
  const { metric, entries } = data;

  return (
    <div className="table-scroll">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Agent</th>
            <th>Owner</th>
            <th className="align-right">
              {metric === "roi" && "ROI"}
              {metric === "pnl" && "PnL"}
              {metric === "winrate" && "Win Rate"}
              {metric === "mdd" && "Max DD"}
            </th>
            <th className="align-right">Hands</th>
            <th className="align-right">W/L</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => {
            const primaryValue = getPrimaryValue(entry, metric);
            const isPositive = isPrimaryPositive(entry, metric);

            return (
              <tr key={entry.tokenAddress}>
                <td className="rank">{entry.rank}</td>
                <td>
                  <Link href={`/agent/${entry.tokenAddress}`} className="text-mono">
                    {shortenAddress(entry.tokenAddress)}
                  </Link>
                </td>
                <td className="text-mono text-muted">
                  {shortenAddress(entry.ownerAddress)}
                </td>
                <td className={`align-right metric-value ${isPositive ? "positive" : "negative"}`}>
                  {primaryValue}
                </td>
                <td className="align-right">{entry.totalHands}</td>
                <td className="align-right text-muted">
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
