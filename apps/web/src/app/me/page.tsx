"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { shortenAddress, formatMon, formatNavPerShare } from "@/lib/utils";
import type { AgentResponse } from "@/lib/types";

import { getAgentsByOwner } from "@/lib/api";
import styles from "./page.module.css";

export default function MyAgentsPage() {
  const { isConnected, isAuthenticated, address, connect, authenticate } =
    useAuth();
  const [agents, setAgents] = useState<AgentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch agents owned by current wallet
  useEffect(() => {
    if (!address) {
      setAgents([]);
      return;
    }

    const fetchOwnedAgents = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const owned = await getAgentsByOwner(address);
        setAgents(owned);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load agents");
      } finally {
        setIsLoading(false);
      }
    };

    fetchOwnedAgents();
  }, [address]);

  // Not connected - Step 1
  if (!isConnected) {
    return (
      <div className={styles.authPrompt}>
        <h2>My Agents</h2>
        <div className={styles.authSteps}>
          <div className={`${styles.authStep} ${styles.authStepActive}`}>
            <span className={styles.authStepNum}>1</span>
            <div>
              <strong>Connect your wallet</strong>
              <p>Link your MetaMask or compatible wallet to identify your agents.</p>
            </div>
          </div>
          <div className={styles.authStep}>
            <span className={styles.authStepNum}>2</span>
            <div>
              <strong>Sign a message</strong>
              <p>Verify ownership without spending gas.</p>
            </div>
          </div>
        </div>
        <p className={styles.authProgress}>Step 1 of 2</p>
        <button onClick={connect} className="wallet-button">
          🦊 Connect Wallet
        </button>
      </div>
    );
  }

  // Connected but not authenticated - Step 2
  if (!isAuthenticated) {
    return (
      <div className={styles.authPrompt}>
        <h2>My Agents</h2>
        <div className={styles.authSteps}>
          <div className={styles.authStep}>
            <span className={`${styles.authStepNum} ${styles.authStepDone}`}>✓</span>
            <div>
              <strong>Wallet connected</strong>
              <p className="text-muted text-sm"><span className="text-mono">{shortenAddress(address || "")}</span></p>
            </div>
          </div>
          <div className={`${styles.authStep} ${styles.authStepActive}`}>
            <span className={styles.authStepNum}>2</span>
            <div>
              <strong>Sign a message to verify ownership</strong>
              <p>This lets us confirm you own your agents without any on-chain transaction.</p>
            </div>
          </div>
        </div>
        <p className={styles.authProgress}>Step 2 of 2</p>
        <button onClick={authenticate} className="wallet-button sign">
          ✍ Sign In
        </button>
      </div>
    );
  }

  const portfolioStats = useMemo(() => {
    if (!agents.length) return null;
    const agentsWithSnap = agents.filter((a) => a.latestSnapshot);
    const totalNav = agentsWithSnap.reduce((sum, a) => sum + BigInt(a.latestSnapshot!.externalAssets), 0n);
    const totalPnl = agentsWithSnap.reduce((sum, a) => sum + BigInt(a.latestSnapshot!.cumulativePnl), 0n);
    const activeAgents = agents.filter((a) => a.isRegistered).length;
    return { totalNav, totalPnl, activeAgents };
  }, [agents]);

  return (
    <section className="page-section">
      <div className={styles.pageHeadingRow}>
        <h2>My Agents</h2>
        <span className={styles.ownerPill}>
          Owner:{" "}
          <span className="text-mono">{shortenAddress(address || "")}</span>
        </span>
      </div>

      {portfolioStats && (
        <div className={styles.portfolioSummary}>
          <div className={styles.portfolioStat}>
            <div className="label">Total NAV</div>
            <div className={styles.portfolioStatValue}>{formatMon(portfolioStats.totalNav.toString())}</div>
          </div>
          <div className={styles.portfolioStat}>
            <div className="label">Cumulative PnL</div>
            <div className={`${styles.portfolioStatValue} ${portfolioStats.totalPnl >= 0n ? "value-positive" : "value-negative"}`}>
              {portfolioStats.totalPnl >= 0n ? "+" : ""}{formatMon(portfolioStats.totalPnl.toString())}
            </div>
          </div>
          <div className={styles.portfolioStat}>
            <div className="label">Active Agents</div>
            <div className={styles.portfolioStatValue}>{portfolioStats.activeAgents}</div>
          </div>
          <div className={styles.portfolioStat}>
            <div className="label">Total Agents</div>
            <div className={styles.portfolioStatValue}>{agents.length}</div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading">
          <div className="spinner" />
          Loading agents...
        </div>
      )}

      {error && (
        <div className="card error-card">{error}</div>
      )}

      {!isLoading && !error && agents.length === 0 && (
        <div className={`card ${styles.emptyState}`}>
          <p className={styles.emptyTitle}>No agents registered to this wallet</p>
          <p className="text-muted">Register your first agent to get started.</p>
          <div className={styles.registrationGuide}>
            <p className="label" style={{ marginBottom: "0.4rem" }}>How to register an agent:</p>
            <ol className={styles.registrationSteps}>
              <li>Deploy a PlayerVault contract for your agent</li>
              <li>Call <code>PlayerRegistry.register()</code> with your token, vault, and operator addresses</li>
              <li>Join an active table and start playing</li>
            </ol>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/" className="btn btn-ghost">Browse Active Tables</Link>
          </div>
        </div>
      )}

      {!isLoading && agents.length > 0 && (
        <div className={styles.agentList}>
          {agents.map((agent) => (
            <AgentCard key={agent.tokenAddress} agent={agent} />
          ))}
        </div>
      )}
    </section>
  );
}

function AgentCard({ agent }: { agent: AgentResponse }) {
  const snapshot = agent.latestSnapshot;

  return (
    <div className={styles.agentCard}>
      <div className={styles.agentCardHeader}>
        <div className={styles.agentCardTitle}>
          <span className="text-mono">{shortenAddress(agent.tokenAddress)}</span>
        </div>
        {agent.tableAddress && (
          <Link href={`/table/${agent.tableAddress}`} className="inline-link">
            View Table
          </Link>
        )}
      </div>

      <div className={styles.agentCardStats}>
        <div>
          <div className={styles.agentCardStatLabel}>External Assets (A)</div>
          <div className={styles.agentCardStatValue}>
            {snapshot ? formatMon(snapshot.externalAssets) : "-"}
          </div>
        </div>
        <div>
          <div className={styles.agentCardStatLabel}>Treasury Shares (B)</div>
          <div className={styles.agentCardStatValue}>
            {snapshot ? formatMon(snapshot.treasuryShares) : "-"}
          </div>
        </div>
        <div>
          <div className={styles.agentCardStatLabel}>Outstanding (N)</div>
          <div className={styles.agentCardStatValue}>
            {snapshot ? formatMon(snapshot.outstandingShares) : "-"}
          </div>
        </div>
        <div>
          <div className={styles.agentCardStatLabel}>NAV/Share (P)</div>
          <div className={styles.agentCardStatValue}>
            {snapshot ? formatNavPerShare(snapshot.navPerShare) : "-"}
          </div>
        </div>
      </div>

      <div className={`${styles.agentCardStats} ${styles.agentCardStatsSpaced}`}>
        <div>
          <div className={styles.agentCardStatLabel}>Vault</div>
          <div className={`${styles.agentCardStatValue} text-mono text-sm`}>
            {agent.vaultAddress ? shortenAddress(agent.vaultAddress) : "-"}
          </div>
        </div>
        <div>
          <div className={styles.agentCardStatLabel}>Operator</div>
          <div className={`${styles.agentCardStatValue} text-mono text-sm`}>
            {shortenAddress(agent.operatorAddress)}
          </div>
        </div>
        <div>
          <div className={styles.agentCardStatLabel}>Cumulative PnL</div>
          <div className={`${styles.agentCardStatValue} ${snapshot && BigInt(snapshot.cumulativePnl) >= 0 ? "value-positive" : "value-negative"}`}>
            {snapshot ? formatMon(snapshot.cumulativePnl) : "-"}
          </div>
        </div>
        <div>
          <div className={styles.agentCardStatLabel}>Status</div>
          <div className={styles.agentCardStatValue}>
            {agent.isRegistered ? "Active" : "Inactive"}
          </div>
        </div>
      </div>

      <div className={styles.agentCardActions}>
        <Link href={`/agent/${agent.tokenAddress}`}>
          <button className="wallet-button">View Details</button>
        </Link>
        {agent.tableAddress && (
          <Link href={`/table/${agent.tableAddress}?owner=true`}>
            <button className="wallet-button sign">
              Table
            </button>
          </Link>
        )}
      </div>
    </div>
  );
}
