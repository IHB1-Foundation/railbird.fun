"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { shortenAddress, formatMon, formatNavPerShare } from "@/lib/utils";
import type { AgentResponse } from "@/lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:3002";

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
        // Fetch all agents and filter by owner
        // In production, the API should support ?owner= query param
        const res = await fetch(`${API_BASE}/api/agents`);
        if (!res.ok) {
          throw new Error(`Failed to fetch agents: ${res.status}`);
        }
        const allAgents: AgentResponse[] = await res.json();

        // Filter by owner address (case-insensitive)
        const owned = allAgents.filter(
          (agent) =>
            agent.ownerAddress.toLowerCase() === address.toLowerCase()
        );
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
      <div className="auth-prompt">
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
      <div className="auth-prompt">
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
      <div className="page-heading-row">
        <h2>My Agents</h2>
        <span className="owner-pill">
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
        <div className="agent-list">
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
    <div className="agent-card">
      <div className="agent-card-header">
        <div className="agent-card-title">
          <span className="text-mono">{shortenAddress(agent.tokenAddress)}</span>
        </div>
        {agent.tableAddress && (
          <Link href={`/table/${agent.tableAddress}`} className="inline-link">
            View Table
          </Link>
        )}
      </div>

      <div className="agent-card-stats">
        <div>
          <div className="agent-card-stat-label">External Assets (A)</div>
          <div className="agent-card-stat-value">
            {snapshot ? formatMon(snapshot.externalAssets) : "-"}
          </div>
        </div>
        <div>
          <div className="agent-card-stat-label">Treasury Shares (B)</div>
          <div className="agent-card-stat-value">
            {snapshot ? formatMon(snapshot.treasuryShares) : "-"}
          </div>
        </div>
        <div>
          <div className="agent-card-stat-label">Outstanding (N)</div>
          <div className="agent-card-stat-value">
            {snapshot ? formatMon(snapshot.outstandingShares) : "-"}
          </div>
        </div>
        <div>
          <div className="agent-card-stat-label">NAV/Share (P)</div>
          <div className="agent-card-stat-value">
            {snapshot ? formatNavPerShare(snapshot.navPerShare) : "-"}
          </div>
        </div>
      </div>

      <div className="agent-card-stats agent-card-stats-spaced">
        <div>
          <div className="agent-card-stat-label">Vault</div>
          <div className="agent-card-stat-value text-mono text-sm">
            {agent.vaultAddress ? shortenAddress(agent.vaultAddress) : "-"}
          </div>
        </div>
        <div>
          <div className="agent-card-stat-label">Operator</div>
          <div className="agent-card-stat-value text-mono text-sm">
            {shortenAddress(agent.operatorAddress)}
          </div>
        </div>
        <div>
          <div className="agent-card-stat-label">Cumulative PnL</div>
          <div className={`agent-card-stat-value ${snapshot && BigInt(snapshot.cumulativePnl) >= 0 ? "value-positive" : "value-negative"}`}>
            {snapshot ? formatMon(snapshot.cumulativePnl) : "-"}
          </div>
        </div>
        <div>
          <div className="agent-card-stat-label">Status</div>
          <div className="agent-card-stat-value">
            {agent.isRegistered ? "Active" : "Inactive"}
          </div>
        </div>
      </div>

      <div className="agent-card-actions">
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
