import Link from "next/link";
import { getAgent, getAgentSnapshots } from "@/lib/api";
import {
  formatMon,
  shortenAddress,
  formatPercent,
  formatNavPerShare,
} from "@/lib/utils";
import TradingWidget from "@/components/TradingWidget";

export const dynamic = "force-dynamic";

export default async function AgentPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = await params;

  let agent;
  let snapshots;
  let error = null;

  try {
    agent = await getAgent(token);
    if (agent.vaultAddress) {
      snapshots = await getAgentSnapshots(token, 50);
    }
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load agent";
  }

  if (error) {
    return (
      <div className="empty">
        <p>Unable to load agent</p>
        <p style={{ fontSize: "0.875rem", marginTop: "0.5rem" }}>{error}</p>
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
    <div>
      {/* Header */}
      <div style={{ marginBottom: "1.5rem" }}>
        <h2>Agent</h2>
        <div
          style={{
            fontFamily: "monospace",
            fontSize: "0.875rem",
            color: "var(--muted)",
            marginTop: "0.25rem",
          }}
        >
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
      <div className="stats-grid" style={{ marginTop: "1rem" }}>
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
      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3 style={{ marginBottom: "0.75rem" }}>Agent Info</h3>
        <div style={{ display: "grid", gap: "0.5rem", fontSize: "0.875rem" }}>
          <div>
            <span style={{ color: "var(--muted)" }}>Owner:</span>{" "}
            <span style={{ fontFamily: "monospace" }}>
              {shortenAddress(agent.ownerAddress)}
            </span>
          </div>
          <div>
            <span style={{ color: "var(--muted)" }}>Operator:</span>{" "}
            <span style={{ fontFamily: "monospace" }}>
              {shortenAddress(agent.operatorAddress)}
            </span>
          </div>
          {agent.vaultAddress && (
            <div>
              <span style={{ color: "var(--muted)" }}>Vault:</span>{" "}
              <span style={{ fontFamily: "monospace" }}>
                {shortenAddress(agent.vaultAddress)}
              </span>
            </div>
          )}
          {agent.tableAddress && (
            <div>
              <span style={{ color: "var(--muted)" }}>Table:</span>{" "}
              <Link href={`/table/1`} style={{ fontFamily: "monospace" }}>
                {shortenAddress(agent.tableAddress)}
              </Link>
            </div>
          )}
          {agent.metaUri && (
            <div>
              <span style={{ color: "var(--muted)" }}>Meta URI:</span>{" "}
              {agent.metaUri}
            </div>
          )}
        </div>
      </div>

      {/* Snapshot History */}
      <div className="card" style={{ marginTop: "1rem" }}>
        <h3 style={{ marginBottom: "0.75rem" }}>NAV History</h3>
        {snapshots && snapshots.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
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
                    <td
                      style={{
                        color:
                          BigInt(snap.cumulativePnl) >= 0n
                            ? "var(--accent)"
                            : "var(--danger)",
                      }}
                    >
                      {formatMon(snap.cumulativePnl)}
                    </td>
                    <td style={{ color: "var(--muted)" }}>{snap.blockNumber}</td>
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

      {/* Trading Widget */}
      <div style={{ marginTop: "1rem" }}>
        <h3 style={{ marginBottom: "0.75rem" }}>Trade Token</h3>
        <TradingWidget tokenAddress={token} />
      </div>
    </div>
  );
}
