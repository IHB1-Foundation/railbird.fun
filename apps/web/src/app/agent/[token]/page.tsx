import Link from "next/link";
import { Breadcrumb } from "@/components/Breadcrumb";
import { Tooltip } from "@/components/Tooltip";
import { AgentAvatar } from "@/components/AgentAvatar";
import { ShareButton } from "@/components/ShareButton";
import { getAgent, getAgentSnapshots, getAgentRebalances, getAgentHands, getTreasuryReasoningAll, getAgentStrategies, getAgentGtoStats, type RebalanceEventResponse, type TreasuryReasoningEntry, type StrategyHistoryEntry, type GTOStatsResponse, type EvolutionAgentTimeline } from "@/lib/api";
import { StrategyTimeline } from "@/components/charts/StrategyTimeline";
import type { HandResponse } from "@/lib/types";

interface AgentHealthRag {
  totalHands: number;
  lastUpdated: string | null;
}

async function fetchAgentHealth(url: string): Promise<AgentHealthRag | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 30 }, signal: AbortSignal.timeout(2000) });
    if (!res.ok) return null;
    const data = await res.json() as { rag?: AgentHealthRag };
    return data.rag ?? null;
  } catch {
    return null;
  }
}
import { NadFunTradingWidget } from "@/components/NadFunTradingWidget";
import { NavSparkline } from "@/components/NavSparkline";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { getAgentProfile, getPersonaSummary } from "@/lib/agentProfiles";
import { PersonaRadar } from "@/components/PersonaRadar";
import {
  formatMon,
  shortenAddress,
  formatPercent,
  formatNavPerShare,
  formatTime,
  explorerAddressUrl,
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
  let treasuryReasonings: Map<string, TreasuryReasoningEntry> = new Map();
  let strategyHistory: StrategyHistoryEntry[] = [];
  let gtoStats: GTOStatsResponse | null = null;
  let ragStats: AgentHealthRag | null = null;
  let error = null;

  try {
    agent = await getAgent(token);
    const fetchHands = getAgentHands(token, 20).catch(() => [] as HandResponse[]);
    if (agent.vaultAddress) {
      const [s, r, h, tr, strats, gto] = await Promise.all([
        getAgentSnapshots(token, 50),
        getAgentRebalances(token, 50).catch(() => []),
        fetchHands,
        getTreasuryReasoningAll(agent.vaultAddress).catch(() => []),
        getAgentStrategies(token, 20).catch(() => []),
        getAgentGtoStats(token).catch(() => null),
      ]);
      snapshots = s;
      rebalances = r;
      hands = h;
      treasuryReasonings = new Map(tr.map((e) => [e.handId, e]));
      strategyHistory = strats;
      gtoStats = gto;
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

  // Fetch RAG stats from agent health endpoint (non-blocking, server-side only)
  if (profile?.healthUrl) {
    ragStats = await fetchAgentHealth(profile.healthUrl);
  }

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
  const persona = getPersonaSummary(profile?.personaId);

  // Performance summary for header
  const wins = hands.filter((h) => h.winnerSeat !== null && h.winnerSeat !== undefined).length;
  const losses = hands.length - wins;

  // AI Decision Pattern — compute from recent hands
  const allActions = hands.flatMap((h) => h.actions);
  const actionCounts = { fold: 0, check: 0, call: 0, raise: 0 };
  for (const a of allActions) {
    const t = a.actionType?.toLowerCase();
    if (t === "fold") actionCounts.fold++;
    else if (t === "check") actionCounts.check++;
    else if (t === "call") actionCounts.call++;
    else if (t === "raise" || t === "bet") actionCounts.raise++;
  }
  const totalActions = allActions.length;
  // Recent reasonings: last 3 hands that have at least one action with reasoning
  const handsWithReasoning = hands
    .filter((h) => h.actions.some((a) => a.reasoning))
    .slice(0, 3);
  const recentReasonings = handsWithReasoning
    .map((h) => ({
      handId: h.handId,
      reasoning: h.actions.find((a) => a.reasoning)?.reasoning ?? "",
    }))
    .filter((r) => r.reasoning);
  const roiPct = parseFloat(roi) * 100;
  const roiPositive = roiPct >= 0;
  // Streak: count consecutive wins/losses from most recent
  let streak = 0;
  let streakType = "";
  for (const h of [...hands].reverse()) {
    const won = h.winnerSeat !== null && h.winnerSeat !== undefined;
    if (streak === 0) { streakType = won ? "W" : "L"; streak = 1; }
    else if ((won && streakType === "W") || (!won && streakType === "L")) streak++;
    else break;
  }

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
        <AgentAvatar
          name={profile?.name}
          accentColor={profile?.accentColor}
          colorHex={profile?.colorHex}
          size={48}
        />
        {profile && (
          <div className={styles.agentColorBar} style={{ background: profile.accentColor }} />
        )}
        <h2>{profile ? profile.name : "Agent"}</h2>
        {persona ? (
          <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
            <span style={{ fontSize: "1.2rem" }}>{persona.emoji}</span>
            <span
              className={styles.agentAggressionBadge}
              style={{ background: persona.colorAccent + "22", color: persona.colorAccent, border: `1px solid ${persona.colorAccent}55` }}
              title={persona.description}
            >
              {persona.name}
            </span>
          </div>
        ) : profile ? (
          <span
            className={styles.agentAggressionBadge}
            style={{ background: profile.accentColor, color: profile.colorHex }}
          >
            {profile.aggressionLabel}
          </span>
        ) : null}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <span className={styles.agentToken}>{token}</span>
          <ShareButton />
          <Link
            href={`/betting?agent=${token}`}
            className="btn"
            style={{ padding: "0.35rem 0.8rem", fontSize: "0.8rem" }}
          >
            Bet on this Agent
          </Link>
        </div>
        {hands.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem", marginTop: "0.4rem" }}>
            <span style={{ borderRadius: "999px", padding: "0.1rem 0.5rem", fontSize: "0.72rem", fontWeight: 600, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(157,166,207,0.3)" }}>
              W/L: {wins}/{losses}
            </span>
            <span style={{ borderRadius: "999px", padding: "0.1rem 0.5rem", fontSize: "0.72rem", fontWeight: 600, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(157,166,207,0.3)", color: roiPositive ? "var(--success)" : "var(--danger)" }}>
              ROI: {roiPositive ? "+" : ""}{(roiPct).toFixed(1)}%
            </span>
            {streak > 0 && (
              <span style={{ borderRadius: "999px", padding: "0.1rem 0.5rem", fontSize: "0.72rem", fontWeight: 600, background: "rgba(255,255,255,0.06)", border: "1px solid rgba(157,166,207,0.3)", color: streakType === "W" ? "var(--success)" : "var(--danger)" }}>
                Streak: {streak}{streakType}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Persona Section */}
      {persona && (
        <div className="card" style={{ marginBottom: "1rem", padding: "1rem 1.2rem" }}>
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>AI Strategy Profile</h3>
          <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
            <PersonaRadar persona={persona} size="large" />
            <div style={{ flex: 1, minWidth: "180px" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.25rem" }}>{persona.emoji} <strong>{persona.name}</strong></div>
              <p style={{ fontSize: "0.82rem", color: "var(--muted)", marginBottom: "0.75rem" }}>{persona.description}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.8rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)" }}>Aggression</span>
                  <span style={{ color: persona.colorAccent, fontWeight: 600 }}>{Math.round(persona.aggression * 100)}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)" }}>Tightness</span>
                  <span style={{ fontWeight: 600 }}>{Math.round(persona.tightness * 100)}%</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ color: "var(--muted)" }}>Bluff Frequency</span>
                  <span style={{ fontWeight: 600 }}>{Math.round(persona.bluffFrequency * 100)}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AI Decision Pattern */}
      {(totalActions > 0 || recentReasonings.length > 0) && (
        <div className="card" style={{ marginBottom: "1rem", padding: "1rem 1.2rem" }}>
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>AI Decision Pattern</h3>
          {totalActions > 0 && (
            <div style={{ marginBottom: "0.75rem" }}>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                Action distribution across recent {hands.length} hands ({totalActions} total actions)
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {(["raise", "call", "check", "fold"] as const).map((type) => {
                  const count = actionCounts[type];
                  const pct = totalActions > 0 ? Math.round((count / totalActions) * 100) : 0;
                  const colors: Record<string, string> = { raise: "#EF4444", call: "#3B82F6", check: "#22C55E", fold: "#6B7280" };
                  return (
                    <div key={type} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ fontSize: "0.72rem", color: "var(--muted)", width: "2.5rem", textTransform: "capitalize" }}>{type}</span>
                      <div style={{ flex: 1, height: "8px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: colors[type], borderRadius: "4px", transition: "width 0.3s" }} />
                      </div>
                      <span style={{ fontSize: "0.72rem", fontWeight: 600, width: "2.5rem", textAlign: "right" }}>{pct}%</span>
                      <span style={{ fontSize: "0.72rem", color: "var(--muted)", width: "1.5rem" }}>×{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {recentReasonings.length > 0 && (
            <div>
              <p style={{ fontSize: "0.78rem", color: "var(--muted)", marginBottom: "0.4rem" }}>Recent AI reasoning:</p>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {recentReasonings.map(({ handId, reasoning }) => {
                  const firstSentence = reasoning.split(/[.!?]/)[0].trim();
                  return (
                    <div key={handId} style={{ fontSize: "0.78rem", fontStyle: "italic", color: "var(--text-secondary)", borderLeft: "2px solid var(--accent, #8B5CF6)", paddingLeft: "0.6rem" }}>
                      <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>Hand #{handId}: </span>
                      {firstSentence}.
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {totalActions === 0 && recentReasonings.length === 0 && (
            <p style={{ fontSize: "0.78rem", color: "var(--muted)" }}>No AI decision data yet.</p>
          )}
        </div>
      )}

      {/* AI Learning */}
      {(ragStats !== null || allActions.some((a) => a.reasoning?.toLowerCase().includes("past hand"))) && (
        <div className="card" style={{ marginBottom: "1rem", padding: "1rem 1.2rem" }}>
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>AI Learning</h3>
          {ragStats !== null && (
            <div style={{ marginBottom: "0.75rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>Knowledge Base</span>
                <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>
                  {ragStats.totalHands} / 500 hands
                </span>
              </div>
              <div style={{ height: "8px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.min(100, Math.round((ragStats.totalHands / 500) * 100))}%`,
                    height: "100%",
                    background: "linear-gradient(90deg, #8B5CF6, #3B82F6)",
                    borderRadius: "4px",
                    transition: "width 0.3s",
                  }}
                />
              </div>
              {ragStats.lastUpdated && (
                <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.3rem" }}>
                  Last updated: {new Date(ragStats.lastUpdated).toLocaleString()}
                </p>
              )}
            </div>
          )}
          {(() => {
            const withReasoning = allActions.filter((a) => a.reasoning);
            const withRagRef = withReasoning.filter((a) =>
              a.reasoning?.toLowerCase().includes("past hand") ||
              a.reasoning?.toLowerCase().includes("similar") ||
              a.reasoning?.toLowerCase().includes("hand #")
            );
            if (withReasoning.length === 0) return null;
            const ragPct = Math.round((withRagRef.length / withReasoning.length) * 100);
            return (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>RAG-informed decisions</span>
                  <span style={{ fontSize: "0.78rem", fontWeight: 600 }}>{ragPct}%</span>
                </div>
                <div style={{ height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${ragPct}%`, height: "100%", background: "#22C55E", borderRadius: "4px" }} />
                </div>
                <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.3rem" }}>
                  {withRagRef.length} of {withReasoning.length} recent actions reference past experience
                </p>
              </div>
            );
          })()}
        </div>
      )}

      {/* Strategy History (T-1102) + Evolution mini chart (T-1105) */}
      {strategyHistory.length > 0 && (
        <div className="card" style={{ marginBottom: "1rem", padding: "1rem 1.2rem" }}>
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>Strategy Version History</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {strategyHistory.map((s, i) => {
              const prev = strategyHistory[i + 1];
              const aggrDiff = prev ? s.aggressionBps - prev.aggressionBps : 0;
              const tightDiff = prev ? s.tightnessBps - prev.tightnessBps : 0;
              return (
                <div key={s.version} style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start", padding: "0.5rem", background: "rgba(255,255,255,0.04)", borderRadius: "6px" }}>
                  <span style={{ fontSize: "0.7rem", color: "var(--muted)", whiteSpace: "nowrap", paddingTop: "0.15rem", minWidth: "32px" }}>v{s.version}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.2rem" }}>
                      <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>{s.personaId}</span>
                      <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                        Aggr: {(s.aggressionBps / 100).toFixed(0)}%{aggrDiff !== 0 && <span style={{ color: aggrDiff > 0 ? "#22C55E" : "#EF4444" }}> ({aggrDiff > 0 ? "+" : ""}{(aggrDiff / 100).toFixed(0)}%)</span>}
                        {" · "}Tight: {(s.tightnessBps / 100).toFixed(0)}%{tightDiff !== 0 && <span style={{ color: tightDiff > 0 ? "#22C55E" : "#EF4444" }}> ({tightDiff > 0 ? "+" : ""}{(tightDiff / 100).toFixed(0)}%)</span>}
                        {" · "}Bluff: {(s.bluffFreqBps / 100).toFixed(0)}%
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                      <a href={explorerAddressUrl(s.txHash)} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.68rem", color: "var(--muted)", fontFamily: "monospace" }}>
                        {s.txHash.slice(0, 10)}…
                      </a>
                      <span style={{ fontSize: "0.68rem", color: "var(--muted)" }}>{new Date(s.timestamp).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* T-1105: Mini strategy evolution chart */}
          {strategyHistory.length >= 2 && (() => {
            const agentTimeline: EvolutionAgentTimeline = {
              agent: token,
              eloRating: 1500,
              strategies: strategyHistory.map((s) => ({
                version: parseInt(s.version, 10),
                aggressionBps: s.aggressionBps,
                tightnessBps: s.tightnessBps,
                bluffFreqBps: s.bluffFreqBps,
                personaId: s.personaId,
                configHash: s.configHash,
                blockNumber: parseInt(s.blockNumber, 10) || 0,
                txHash: s.txHash,
                timestamp: s.timestamp,
              })),
            };
            return (
              <div style={{ marginTop: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: "0.75rem" }}>
                <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.4rem" }}>Aggression evolution</p>
                <StrategyTimeline agents={[agentTimeline]} metric="aggressionBps" height={80} />
              </div>
            );
          })()}
        </div>
      )}

      {/* GTO Analysis (T-1104) */}
      {gtoStats && gtoStats.totalDecisions > 0 && (
        <div className="card" style={{ marginBottom: "1rem", padding: "1rem 1.2rem" }}>
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>GTO Analysis</h3>
          {gtoStats.conformance !== null ? (
            <>
              <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", flexWrap: "wrap", marginBottom: "0.75rem" }}>
                {/* Conformance Gauge */}
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    width: "72px", height: "72px", borderRadius: "50%",
                    background: `conic-gradient(${gtoStats.conformance >= 70 ? "#22C55E" : gtoStats.conformance >= 40 ? "#F59E0B" : "#EF4444"} ${gtoStats.conformance * 3.6}deg, rgba(255,255,255,0.08) 0deg)`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    position: "relative",
                  }}>
                    <div style={{ width: "52px", height: "52px", borderRadius: "50%", background: "var(--card-bg, #1a1b23)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: "1rem", fontWeight: 700, color: gtoStats.conformance >= 70 ? "#22C55E" : gtoStats.conformance >= 40 ? "#F59E0B" : "#EF4444" }}>
                        {gtoStats.conformance}%
                      </span>
                    </div>
                  </div>
                  <p style={{ fontSize: "0.7rem", color: "var(--muted)", marginTop: "0.3rem" }}>GTO Conformance</p>
                </div>
                {/* Deviation Breakdown */}
                {gtoStats.deviationsByType && (
                  <div style={{ flex: 1, minWidth: "160px" }}>
                    <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.4rem" }}>Deviation breakdown</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      {(["tighter", "looser", "passive", "aggressive"] as const).map((type) => {
                        const count = gtoStats?.deviationsByType?.[type] ?? 0;
                        const total = gtoStats?.totalDecisions ?? 1;
                        const pct = Math.round((count / total) * 100);
                        const colors: Record<string, string> = { tighter: "#6B7280", looser: "#EF4444", passive: "#3B82F6", aggressive: "#F59E0B" };
                        return count > 0 ? (
                          <div key={type} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                            <span style={{ fontSize: "0.68rem", color: "var(--muted)", width: "4.5rem", textTransform: "capitalize" }}>{type}</span>
                            <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.08)", borderRadius: "3px", overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: colors[type], borderRadius: "3px" }} />
                            </div>
                            <span style={{ fontSize: "0.68rem", color: "var(--muted)", width: "1.5rem" }}>{pct}%</span>
                          </div>
                        ) : null;
                      })}
                    </div>
                    <p style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.3rem" }}>
                      {gtoStats.totalDecisions} preflop decisions analyzed
                    </p>
                  </div>
                )}
              </div>
              {/* Recent Deviations */}
              {gtoStats.recentDeviations.length > 0 && (
                <div>
                  <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.4rem" }}>Recent deviations:</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    {gtoStats.recentDeviations.slice(0, 5).map((d, i) => (
                      <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center", fontSize: "0.72rem", padding: "0.3rem 0.5rem", background: "rgba(255,255,255,0.04)", borderRadius: "4px" }}>
                        <span style={{ color: "var(--muted)" }}>Hand #{d.handId}:</span>
                        <span>AI chose <strong>{d.aiAction}</strong></span>
                        <span style={{ color: "var(--muted)" }}>·</span>
                        <span>GTO suggests <strong style={{ color: "#3B82F6" }}>{d.gtoAction}</strong></span>
                        <span style={{ marginLeft: "auto", fontSize: "0.68rem", color: "var(--muted)", textTransform: "capitalize" }}>({d.deviationType})</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p style={{ fontSize: "0.78rem", color: "var(--muted)" }}>No GTO data yet — preflop decisions will appear here after hands are played.</p>
          )}
        </div>
      )}

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
            <a href={explorerAddressUrl(agent.ownerAddress)} target="_blank" rel="noopener noreferrer" className="text-mono" title={agent.ownerAddress}>
              {shortenAddress(agent.ownerAddress)} ↗
            </a>
          </div>
          <div className={styles.infoRow}>
            <span className="label">Operator:</span>{" "}
            <a href={explorerAddressUrl(agent.operatorAddress)} target="_blank" rel="noopener noreferrer" className="text-mono" title={agent.operatorAddress}>
              {shortenAddress(agent.operatorAddress)} ↗
            </a>
          </div>
          {agent.vaultAddress && (
            <div className={styles.infoRow}>
              <span className="label">Vault:</span>{" "}
              <a href={explorerAddressUrl(agent.vaultAddress)} target="_blank" rel="noopener noreferrer" className="text-mono" title={agent.vaultAddress}>
                {shortenAddress(agent.vaultAddress)} ↗
              </a>
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
                {rebalances.map((r) => {
                  const tReasoning = treasuryReasonings.get(r.handId);
                  return (
                    <>
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
                      {tReasoning && (
                        <tr key={`${r.id}-reasoning`}>
                          <td colSpan={7} style={{ padding: 0 }}>
                            <details className={styles.treasuryReasoningRow}>
                              <summary className={styles.treasuryReasoningSummary}>
                                💡 AI Analysis
                                <span className={styles.treasuryConfidence}>
                                  Confidence: {Math.round(tReasoning.confidence * 100)}%
                                  <span
                                    className={styles.treasuryConfidenceBar}
                                    style={{ width: `${Math.round(tReasoning.confidence * 60)}px` }}
                                  />
                                </span>
                              </summary>
                              <div className={styles.treasuryReasoningBody}>
                                <p className={styles.treasuryReasoningText}>{tReasoning.reasoning}</p>
                                {tReasoning.factors && (
                                  <div className={styles.treasuryFactors}>
                                    {tReasoning.factors.navVsMarket && (
                                      <span className={styles.treasuryFactor}><b>NAV vs Market:</b> {tReasoning.factors.navVsMarket}</span>
                                    )}
                                    {tReasoning.factors.pnlTrend && (
                                      <span className={styles.treasuryFactor}><b>PnL Trend:</b> {tReasoning.factors.pnlTrend}</span>
                                    )}
                                    {tReasoning.factors.sizeJustification && (
                                      <span className={styles.treasuryFactor}><b>Size:</b> {tReasoning.factors.sizeJustification}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </details>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
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
