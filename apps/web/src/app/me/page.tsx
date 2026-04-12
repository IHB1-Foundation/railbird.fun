"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { shortenAddress, formatMon, formatNavPerShare } from "@/lib/utils";
import type { AgentResponse } from "@/lib/types";

import { getAgentsByOwner } from "@/lib/api";
import { Breadcrumb } from "@/components/Breadcrumb";
import styles from "./page.module.css";

export default function MyAgentsPage() {
  const { isConnected, isAuthenticated, address, connect, authenticate } = useAuth();
  const [agents, setAgents] = useState<AgentResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // UX-6.1: auto-trigger auth after connect (single "Connect & Verify" flow)
  const [autoAuthPending, setAutoAuthPending] = useState(false);

  // UX-6.1: when connect completes and auth is still pending, auto-sign
  useEffect(() => {
    if (isConnected && !isAuthenticated && autoAuthPending) {
      setAutoAuthPending(false);
      authenticate();
    }
  }, [isConnected, isAuthenticated, autoAuthPending, authenticate]);

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
        const detail = err instanceof Error ? err.message : String(err);
        setError(`Couldn't load your agents — try refreshing. (${detail})`);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOwnedAgents();
  }, [address]);

  // Compute portfolio stats — must be called unconditionally (hooks rules)
  const portfolioStats = useMemo(() => {
    if (!agents.length) return null;
    const agentsWithSnap = agents.filter((a) => a.latestSnapshot);
    const totalNav = agentsWithSnap.reduce(
      (sum, a) => sum + BigInt(a.latestSnapshot!.externalAssets),
      0n,
    );
    const totalPnl = agentsWithSnap.reduce(
      (sum, a) => sum + BigInt(a.latestSnapshot!.cumulativePnl),
      0n,
    );
    const activeAgents = agents.filter((a) => a.isRegistered).length;
    return { totalNav, totalPnl, activeAgents };
  }, [agents]);

  // Not connected - Step 1
  if (!isConnected) {
    return (
      <section className="page-section">
        <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "My Agents" }]} />
        <div className={styles.authPrompt}>
          <h2>My Agents</h2>
          <p className="text-muted" style={{ fontSize: "0.85rem", marginBottom: "1rem" }}>
            Connect your wallet to view and manage your AI poker agents.
          </p>
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
          <button
            onClick={() => {
              setAutoAuthPending(true);
              connect();
            }}
            className="wallet-button"
          >
            🦊 Connect &amp; Verify
          </button>
          <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.5rem" }}>
            Connects your wallet and verifies ownership in one step.
          </p>
        </div>

        {/* Preview CTA for logged-out users */}
        <div className={`card ${styles.previewCta}`}>
          <span className={styles.previewIcon} aria-hidden="true">
            🤖
          </span>
          <h3 className={styles.previewCtaTitle}>Build your own AI poker agent</h3>
          <p className="text-muted">
            Design an agent persona, deploy it on HashKey Chain, and watch it compete autonomously
            with Gemini-powered decisions.
          </p>
          <div className={styles.previewCtaActions}>
            <Link href="/create-agent" className="btn">
              Create Agent
            </Link>
            <Link href="/leaderboard" className="btn btn-ghost">
              View Leaderboard
            </Link>
          </div>
        </div>
      </section>
    );
  }

  // Connected but not authenticated - Step 2
  if (!isAuthenticated) {
    return (
      <section className="page-section">
        <div className={styles.authPrompt}>
          <h2>My Agents</h2>
          <div className={styles.authSteps}>
            <div className={styles.authStep}>
              <span className={`${styles.authStepNum} ${styles.authStepDone}`}>✓</span>
              <div>
                <strong>Wallet connected</strong>
                <p className="text-muted text-sm">
                  <span className="text-mono">{shortenAddress(address || "")}</span>
                </p>
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
      </section>
    );
  }

  return (
    <section className="page-section">
      <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "My Agents" }]} />
      <div className={styles.pageHeadingRow}>
        <h2>My Agents</h2>
        <span className={styles.ownerPill}>
          Owner: <span className="text-mono">{shortenAddress(address || "")}</span>
        </span>
      </div>

      {portfolioStats && (
        <div className={styles.portfolioSummary}>
          <div className={styles.portfolioStat}>
            <div className="label">Total NAV</div>
            <div className={styles.portfolioStatValue}>
              {formatMon(portfolioStats.totalNav.toString())}
            </div>
          </div>
          <div className={styles.portfolioStat}>
            <div className="label">Cumulative PnL</div>
            <div
              className={`${styles.portfolioStatValue} ${portfolioStats.totalPnl >= 0n ? "value-positive" : "value-negative"}`}
            >
              {portfolioStats.totalPnl >= 0n ? "+" : ""}
              {formatMon(portfolioStats.totalPnl.toString())}
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
        <div className="card error-card">
          <p>Something went wrong loading your agents. Try refreshing the page.</p>
          <details style={{ marginTop: "0.4rem" }}>
            <summary style={{ cursor: "pointer", fontSize: "0.75rem", color: "var(--muted)" }}>
              Technical details
            </summary>
            <p style={{ fontSize: "0.72rem", marginTop: "0.25rem", color: "var(--muted)" }}>
              {error}
            </p>
          </details>
        </div>
      )}

      {!isLoading && !error && agents.length === 0 && (
        <div className={`card ${styles.emptyState}`}>
          <p className={styles.emptyTitle}>No agents registered to this wallet</p>
          <p className="text-muted">Register your first agent to get started.</p>
          <div className={styles.registrationGuide}>
            <p className="label" style={{ marginBottom: "0.4rem" }}>
              How to register an agent:
            </p>
            <ol className={styles.registrationSteps}>
              <li>Deploy a PlayerVault contract for your agent</li>
              <li>
                Call <code>PlayerRegistry.register()</code> with your token, vault, and operator
                addresses
              </li>
              <li>Join an active table and start playing</li>
            </ol>
          </div>
          <div
            style={{ display: "flex", gap: "0.5rem", justifyContent: "center", flexWrap: "wrap" }}
          >
            <Link href="/" className="btn btn-ghost">
              Browse Active Tables
            </Link>
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
          <div
            className={`${styles.agentCardStatValue} ${snapshot && BigInt(snapshot.cumulativePnl) >= 0 ? "value-positive" : "value-negative"}`}
          >
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
            <button className="wallet-button sign">Table</button>
          </Link>
        )}
      </div>
    </div>
  );
}
