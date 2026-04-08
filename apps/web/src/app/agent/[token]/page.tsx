import Link from "next/link";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Tooltip } from "@/components/Tooltip";
import { getAgent, getAgentSnapshots, getAgentRebalances, getAgentHands, type RebalanceEventResponse } from "@/lib/api";
import type { HandResponse } from "@/lib/types";
import { NadFunTradingWidget } from "@/components/NadFunTradingWidget";
import { NavSparkline } from "@/components/NavSparkline";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getAgentProfile } from "@/lib/agentProfiles";
import {
  formatMon,
  shortenAddress,
  formatPercent,
  formatNavPerShare,
  formatTime,
} from "@/lib/utils";
import styles from "./page.module.css";
export const dynamic = "force-dynamic";

export default async function AgentPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = await params;

  let agent;
  let snapshots;
  let rebalances: RebalanceEventResponse[] = [];
  let hands: HandResponse[] = [];
  let error = null;

  try {
    agent = await getAgent(token);
    const fetchHands = getAgentHands(token, 20).catch(() => [] as HandResponse[]);
    if (agent.vaultAddress) {
      const [s, r, h] = await Promise.all([
        getAgentSnapshots(token, 50),
        getAgentRebalances(token, 50).catch(() => []),
        fetchHands,
      ]);
      snapshots = s;
      rebalances = r;
      hands = h;
    } else {
      hands = await fetchHands;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load agent";
  }

  if (error) {
    return (
      <div className="empty">
        <p>Unable to load agent</p>
        <p className="error-detail">{error}</p>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="empty">
        <p>Agent not found</p>
      </div>
    );
  }

  const snapshot = agent.latestSnapshot;
  const hasSnapshot = snapshot !== null;
  const profile = getAgentProfile(agent.operatorAddress) || getAgentProfile(agent.ownerAddress);

  // Calculate ROI if we have snapshots
  let roi = "0";
  if (snapshots && snapshots.length >= 2) {
    const initial = BigInt(snapshots[0].navPerShare);
    const current = BigInt(snapshots[snapshots.length - 1].navPerShare);
    if (initial > 0n) {
      const roiNum = ((current - initial) * 10000n) / initial;
      roi = (Number(roiNum) / 10000).toString();
    }
  }

  const agentDisplayName = profile ? profile.name : shortenAddress(token);

  return (
    <section className="page-section">
      {/* Breadcrumb */}
      <Breadcrumb crumbs={[
        { label: "Home", href: "/" },
        { label: "Agents", href: "/" },
        { label: agentDisplayName },
      ]} />

      {/* Header */}
      <div className={styles.agentHeader}>
        {profile && (
          <div className={styles.agentColorBar} style={{ background: profile.accentColor }} />
        )}
        <h2>{profile ? profile.name : "Agent"}</h2>
        {profile && (
          <span
            className={styles.agentAggressionBadge}
            style={{ background: profile.accentColor, color: profile.colorHex }}
          >
            {profile.aggressionLabel}
          </span>
        )}
        <div className={styles.agentToken}>
          {token}
        </div>
      </div>

      {/* Stats Grid */}
      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>
            <Tooltip text="Total value of non-token assets in the agent's vault">External Assets (A)</Tooltip>
          </div>
          <div className={styles.statValue}>
            {hasSnapshot ? formatMon(snapshot.externalAssets) : "--"}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>
            <Tooltip text="Agent tokens held by the vault — reduces circulating supply">Treasury Shares (B)</Tooltip>
          </div>
          <div className={styles.statValue}>
            {hasSnapshot ? formatMon(snapshot.treasuryShares) : "--"}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>
            <Tooltip text="Tokens in circulation (Total Supply minus Treasury Shares)">Outstanding (N)</Tooltip>
          </div>
          <div className={styles.statValue}>
            {hasSnapshot ? formatMon(snapshot.outstandingShares) : "--"}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>
            <Tooltip text="Net Asset Value per token — vault assets divided by outstanding tokens">NAV/Share (P)</Tooltip>
          </div>
          <div className={styles.statValue}>
            {hasSnapshot ? formatNavPerShare(snapshot.navPerShare) : "--"}
          </div>
        </div>
      </div>

      {/* PnL and ROI */}
      <div className={`${styles.statsGrid} ${styles.spacedTop}`}>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>Cumulative PnL</div>
          <div
            className={`${styles.statValue} ${
              hasSnapshot && BigInt(snapshot.cumulativePnl) >= 0n
                ? "positive"
                : "negative"
            }`}
          >
            {hasSnapshot ? formatMon(snapshot.cumulativePnl) : "--"}
          </div>
        </div>
        <div className={styles.statCard}>
          <div className={styles.statLabel}>
            <Tooltip text="Return on Investment — cumulative profit as percentage of initial capital">ROI</Tooltip>
          </div>
          <div
            className={`${styles.statValue} ${
              parseFloat(roi) >= 0 ? "positive" : "negative"
            }`}
          >
            {formatPercent(roi)}
          </div>
        </div>
      </div>

      {/* Agent Info */}
      <div className="card section-card-lg">
        <h3 className="section-title-sm">Agent Info</h3>
        <div className={styles.infoGrid}>
          <div className={styles.infoRow}>
            <span className="label">Owner:</span>{" "}
            <span className="text-mono">{shortenAddress(agent.ownerAddress)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className="label">Operator:</span>{" "}
            <span className="text-mono">{shortenAddress(agent.operatorAddress)}</span>
          </div>
          {agent.vaultAddress && (
            <div className={styles.infoRow}>
              <span className="label">Vault:</span>{" "}
              <span className="text-mono">{shortenAddress(agent.vaultAddress)}</span>
            </div>
          )}
          {agent.tableAddress && (
            <div className={styles.infoRow}>
              <span className="label">Table:</span>{" "}
              <Link href={`/table/${agent.tableAddress}`} className="text-mono">
                {shortenAddress(agent.tableAddress)}
              </Link>
            </div>
          )}
          {agent.metaUri && (
            <div className={styles.infoRow}>
              <span className="label">Meta URI:</span>{" "}
              {agent.metaUri}
            </div>
          )}
        </div>
      </div>

      {/* NAV Chart */}
      {snapshots && snapshots.length > 0 && (
        <div className="card section-card">
          <h3 className="section-title-sm">NAV Performance</h3>
          <NavSparkline data={snapshots.slice(-50)} />
        </div>
      )}

      {/* Snapshot History */}
      <div className="card section-card">
        <h3 className="section-title-sm">NAV History</h3>
        {snapshots && snapshots.length > 0 ? (
          (() => {
            const baseNav = BigInt(snapshots[0].navPerShare);
            return (
          <div className="table-scroll">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Hand</th>
                  <th>Assets (A)</th>
                  <th>NAV/Share (P)</th>
                  <th>Change</th>
                  <th>PnL</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshots].reverse().slice(0, 20).map((snap, i) => {
                  const nav = BigInt(snap.navPerShare);
                  const changeBps = baseNav > 0n ? Number((nav - baseNav) * 10000n / baseNav) / 100 : 0;
                  return (
                  <tr key={i}>
                    <td>#{snap.handId}</td>
                    <td>{formatMon(snap.externalAssets)}</td>
                    <td>{formatNavPerShare(snap.navPerShare)}</td>
                    <td className={changeBps >= 0 ? "value-positive" : "value-negative"}>
                      {changeBps >= 0 ? "+" : ""}{changeBps.toFixed(2)}%
                    </td>
                    <td className={BigInt(snap.cumulativePnl) >= 0n ? "value-positive" : "value-negative"}>
                      {BigInt(snap.cumulativePnl) >= 0n ? "+" : ""}{formatMon(snap.cumulativePnl)}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
            );
          })()
        ) : (
          <div className="chart-placeholder">
            This agent hasn&apos;t completed a hand yet &mdash; vault snapshots appear after the first settlement.
          </div>
        )}
      </div>

      {/* Recent Hands */}
      <div className="card section-card">
        <h3 className="section-title-sm">Recent Hands</h3>
        {hands.length > 0 ? (
          <div className="table-scroll">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Hand</th>
                  <th>Table</th>
                  <th>Result</th>
                  <th>Pot</th>
                  <th>Community</th>
                </tr>
              </thead>
              <tbody>
                {hands.map((h) => {
                  const isWinner = h.winnerSeat !== null;
                  const isFold = h.gameState === "SETTLED" && h.winnerSeat !== null;
                  return (
                    <tr key={`${h.tableId}-${h.handId}`}>
                      <td>#{h.handId}</td>
                      <td>
                        <Link href={`/table/${h.tableId}`} className="text-mono">
                          {h.tableId.slice(0, 8)}
                        </Link>
                      </td>
                      <td className={isWinner ? "value-positive" : "value-negative"}>
                        {isWinner ? "Win" : isFold ? "Fold" : "Loss"}
                      </td>
                      <td>{formatMon(h.pot)}</td>
                      <td>
                        {h.communityCards.filter((c) => c !== 255).length > 0
                          ? `${h.communityCards.filter((c) => c !== 255).length} cards`
                          : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="chart-placeholder">No hands played yet</div>
        )}
      </div>

      {/* Rebalancing History */}
      <div className="card section-card">
        <h3 className="section-title-sm">Rebalancing History</h3>
        {rebalances.length > 0 ? (
          <div className="table-scroll">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Hand</th>
                  <th>Direction</th>
                  <th>Amount In</th>
                  <th>Amount Out</th>
                  <th>NAV Before</th>
                  <th>NAV After</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {rebalances.map((r) => (
                  <tr key={r.id}>
                    <td>#{r.handId}</td>
                    <td>
                      <span className={r.direction === "buy" ? "value-positive" : "value-negative"}>
                        {r.direction === "buy" ? "Buy" : "Sell"}
                      </span>
                    </td>
                    <td>{formatMon(r.amountIn)}</td>
                    <td>{formatMon(r.amountOut)}</td>
                    <td>{formatNavPerShare(r.navBefore)}</td>
                    <td className={BigInt(r.navAfter) >= BigInt(r.navBefore) ? "value-positive" : "value-negative"}>
                      {formatNavPerShare(r.navAfter)}
                    </td>
                    <td className="text-muted">{formatTime(r.timestamp)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="chart-placeholder">No rebalancing events yet</div>
        )}
      </div>

      {/* Token Trading — widget falls back to "Open on nad.fun" when not configured */}
      <div className="card section-card">
        <h3 className="section-title-sm">Token Trading</h3>
        <ErrorBoundary label="Trading Widget">
          <NadFunTradingWidget tokenAddress={token} />
        </ErrorBoundary>
      </div>

    </section>
  );
}
