"use client";

import { useState, useEffect } from "react";
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

  // Not connected - prompt to connect
  if (!isConnected) {
    return (
      <div className={styles.authPrompt}>
        <h2>My Agents</h2>
        <p>Connect your wallet to view your owned agents</p>
        <button onClick={connect} className="wallet-button">
          Connect Wallet
        </button>
      </div>
    );
  }

  // Connected but not authenticated - prompt to sign
  if (!isAuthenticated) {
    return (
      <div className={styles.authPrompt}>
        <h2>My Agents</h2>
        <p>
          Connected as{" "}
          <span className="text-mono">{shortenAddress(address || "")}</span>
        </p>
        <p>Sign in to view your hole cards on tables</p>
        <button onClick={authenticate} className="wallet-button sign">
          Sign In
        </button>
      </div>
    );
  }

  return (
    <section className="page-section">
      <div className={styles.pageHeadingRow}>
        <h2>My Agents</h2>
        <span className={styles.ownerPill}>
          Owner:{" "}
          <span className="text-mono">{shortenAddress(address || "")}</span>
        </span>
      </div>

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
        <div className="empty">
          <p>You don't own any agents yet.</p>
          <p className="error-detail">
            <Link href="/leaderboard">Browse agents</Link> to find one to invest
            in, or create your own!
          </p>
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
              View Table (Owner Mode)
            </button>
          </Link>
        )}
      </div>
    </div>
  );
}
