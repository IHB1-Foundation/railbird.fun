import Link from "next/link";
import { getAgent, getAgentSnapshots, getAgentRebalances, type RebalanceEventResponse } from "@/lib/api";
import {
  formatMon,
  shortenAddress,
  formatPercent,
  formatNavPerShare,
  formatTime,
} from "@/lib/utils";
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
  let error = null;

  try {
    agent = await getAgent(token);
    if (agent.vaultAddress) {
      [snapshots, rebalances] = await Promise.all([
        getAgentSnapshots(token, 50),
        getAgentRebalances(token, 50).catch(() => []),
      ]);
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

  return (
    <section className="page-section">
      {/* Header */}
      <div className="agent-header">
        <h2>Agent</h2>
        <div className="agent-token">
          {token}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">External Assets (A)</div>
          <div className="stat-value">
            {hasSnapshot ? formatMon(snapshot.externalAssets) : "--"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Treasury Shares (B)</div>
          <div className="stat-value">
            {hasSnapshot ? formatMon(snapshot.treasuryShares) : "--"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Outstanding (N)</div>
          <div className="stat-value">
            {hasSnapshot ? formatMon(snapshot.outstandingShares) : "--"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">NAV/Share (P)</div>
          <div className="stat-value">
            {hasSnapshot ? formatNavPerShare(snapshot.navPerShare) : "--"}
          </div>
        </div>
      </div>

      {/* PnL and ROI */}
      <div className="stats-grid spaced-top">
        <div className="stat-card">
          <div className="stat-label">Cumulative PnL</div>
          <div
            className={`stat-value ${
              hasSnapshot && BigInt(snapshot.cumulativePnl) >= 0n
                ? "positive"
                : "negative"
            }`}
          >
            {hasSnapshot ? formatMon(snapshot.cumulativePnl) : "--"}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">ROI</div>
          <div
            className={`stat-value ${
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
        <div className="info-grid">
          <div className="info-row">
            <span className="label">Owner:</span>{" "}
            <span className="text-mono">{shortenAddress(agent.ownerAddress)}</span>
          </div>
          <div className="info-row">
            <span className="label">Operator:</span>{" "}
            <span className="text-mono">{shortenAddress(agent.operatorAddress)}</span>
          </div>
          {agent.vaultAddress && (
            <div className="info-row">
              <span className="label">Vault:</span>{" "}
              <span className="text-mono">{shortenAddress(agent.vaultAddress)}</span>
            </div>
          )}
          {agent.tableAddress && (
            <div className="info-row">
              <span className="label">Table:</span>{" "}
              <Link href={`/table/${agent.tableAddress}`} className="text-mono">
                {shortenAddress(agent.tableAddress)}
              </Link>
            </div>
          )}
          {agent.metaUri && (
            <div className="info-row">
              <span className="label">Meta URI:</span>{" "}
              {agent.metaUri}
            </div>
          )}
        </div>
      </div>

      {/* Snapshot History */}
      <div className="card section-card">
        <h3 className="section-title-sm">NAV History</h3>
        {snapshots && snapshots.length > 0 ? (
          <div className="table-scroll">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th>Hand</th>
                  <th>Assets (A)</th>
                  <th>NAV/Share (P)</th>
                  <th>PnL</th>
                  <th>Block</th>
                </tr>
              </thead>
              <tbody>
                {[...snapshots].reverse().slice(0, 20).map((snap, i) => (
                  <tr key={i}>
                    <td>#{snap.handId}</td>
                    <td>{formatMon(snap.externalAssets)}</td>
                    <td>{formatNavPerShare(snap.navPerShare)}</td>
                    <td className={BigInt(snap.cumulativePnl) >= 0n ? "value-positive" : "value-negative"}>
                      {formatMon(snap.cumulativePnl)}
                    </td>
                    <td className="text-muted">{snap.blockNumber}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="chart-placeholder">
            No snapshot history available
          </div>
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

      {/* Token Trading — only shown when nad.fun addresses are configured */}
      {process.env.NEXT_PUBLIC_NADFUN_LENS_ADDRESS && (
        <div className="card section-card">
          <h3 className="section-title-sm">Token Trading</h3>
          <div className="chart-placeholder">Trading widget not available on this network</div>
        </div>
      )}

    </section>
  );
}
