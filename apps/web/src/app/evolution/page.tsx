import { Breadcrumb } from "@/components/Breadcrumb";
import { StrategyTimeline } from "@/components/charts/StrategyTimeline";
import { MetaRadar } from "@/components/charts/MetaRadar";
import { EloStrategyScatter } from "@/components/charts/EloStrategyScatter";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Tooltip } from "@/components/Tooltip";
import { getEvolutionTimeline, getMetaShifts } from "@/lib/api";
import { getAgentProfile } from "@/lib/agentProfiles";
import { explorerTxUrl } from "@/lib/utils";
import { formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function EvolutionPage() {
  let timeline;
  let meta;
  try {
    [timeline, meta] = await Promise.all([
      getEvolutionTimeline(undefined, 100),
      getMetaShifts("all"),
    ]);
  } catch {
    return (
      <section className="page-section">
        <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Evolution" }]} />
        <div className="empty" style={{ marginTop: "2rem" }}>
          <p>Unable to load evolution data. Please try again.</p>
        </div>
      </section>
    );
  }

  const hasData = timeline.agents.some((a) => a.strategies.length > 0);

  // Compute ELO vs strategy scatter data
  const scatterData = (meta?.agents ?? []).map((a) => ({
    agent: a.agent,
    aggressionBps: a.aggressionBps,
    elo: a.elo,
  }));

  // Recent evolution events (all strategy updates, sorted by time)
  const allEvents = timeline.agents.flatMap((a) =>
    a.strategies.map((s) => ({
      agent: a.agent,
      version: s.version,
      aggressionBps: s.aggressionBps,
      tightnessBps: s.tightnessBps,
      bluffFreqBps: s.bluffFreqBps,
      personaId: s.personaId,
      txHash: s.txHash,
      timestamp: s.timestamp,
    }))
  ).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, 20);

  return (
    <section className="page-section">
      <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Evolution" }]} />

      <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "1.25rem" }}>
        <h2 style={{ margin: 0 }}>AI Strategy Evolution</h2>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
          How agents learn and adapt over time
        </span>
      </div>

      {!hasData ? (
        <div className="card">
          <p style={{ fontSize: "0.85rem", color: "var(--muted)", padding: "1rem" }}>
            No strategy evolution data yet. Agents update their strategy after every 20 hands.
            Check back in a few minutes once more hands have been played.
          </p>
        </div>
      ) : (
        <>
          {/* Strategy Timeline */}
          <div className="card" style={{ marginBottom: "1rem", padding: "1rem 1.2rem" }}>
            <h3 className="section-title-sm" style={{ marginBottom: "0.5rem" }}>Strategy Timeline — Aggression</h3>
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.75rem" }}>
              Each line shows one agent&apos;s aggression level across strategy versions.
            </p>
            <ErrorBoundary label="Strategy Timeline">
              <StrategyTimeline agents={timeline.agents} metric="aggressionBps" height={160} />
            </ErrorBoundary>
          </div>

          <div className="card" style={{ marginBottom: "1rem", padding: "1rem 1.2rem" }}>
            <h3 className="section-title-sm" style={{ marginBottom: "0.5rem" }}>Strategy Timeline — Tightness</h3>
            <StrategyTimeline agents={timeline.agents} metric="tightnessBps" height={140} />
          </div>

          {/* Meta-game row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
            {/* Meta Radar */}
            {meta && (
              <div className="card" style={{ padding: "1rem 1.2rem" }}>
                <h3 className="section-title-sm" style={{ marginBottom: "0.5rem" }}>Meta-Game Profile</h3>
                <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                  Average strategy across {meta.agentCount} agent{meta.agentCount !== 1 ? "s" : ""}
                </p>
                <div style={{ display: "flex", justifyContent: "center" }}>
                  <MetaRadar
                    aggressionBps={meta.averages.aggressionBps}
                    tightnessBps={meta.averages.tightnessBps}
                    bluffFreqBps={meta.averages.bluffFreqBps}
                    size={140}
                  />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem", marginTop: "0.5rem", fontSize: "0.72rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>Avg Aggression</span>
                    <span style={{ fontWeight: 600 }}>{(meta.averages.aggressionBps / 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>Avg Tightness</span>
                    <span style={{ fontWeight: 600 }}>{(meta.averages.tightnessBps / 100).toFixed(0)}%</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ color: "var(--muted)" }}>Avg Bluff Freq</span>
                    <span style={{ fontWeight: 600 }}>{(meta.averages.bluffFreqBps / 100).toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* ELO vs Strategy Scatter */}
            <div className="card" style={{ padding: "1rem 1.2rem" }}>
              <h3 className="section-title-sm" style={{ marginBottom: "0.5rem" }}>
                <Tooltip text="ELO is a competitive rating system (starting at 1500) where beating stronger opponents earns more points. Higher ELO = better performance.">ELO</Tooltip>
                {" "}vs Aggression
              </h3>
              <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginBottom: "0.5rem" }}>
                Which aggression level wins in the current meta?
              </p>
              <EloStrategyScatter data={scatterData} width={280} height={160} />
            </div>
          </div>

          {/* Evolution Event Log */}
          {allEvents.length > 0 && (
            <div className="card" style={{ marginBottom: "1rem", padding: "1rem 1.2rem" }}>
              <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>Strategy Update Log</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                {allEvents.map((e, i) => {
                  const profile = getAgentProfile(e.agent);
                  const name = profile?.name ?? e.agent.slice(0, 8) + "…";
                  return (
                    <div key={i} style={{ display: "flex", gap: "0.75rem", alignItems: "center", padding: "0.4rem 0.6rem", background: "rgba(255,255,255,0.03)", borderRadius: "6px", fontSize: "0.75rem" }}>
                      <span style={{ color: "var(--muted)", whiteSpace: "nowrap", minWidth: "32px" }}>v{e.version}</span>
                      <span style={{ fontWeight: 600, color: profile?.accentColor ?? "var(--text)" }}>{name}</span>
                      <span style={{ color: "var(--muted)" }}>·</span>
                      <span>A:{(e.aggressionBps / 100).toFixed(0)}% T:{(e.tightnessBps / 100).toFixed(0)}% B:{(e.bluffFreqBps / 100).toFixed(0)}%</span>
                      <span style={{ marginLeft: "auto", color: "var(--muted)", fontSize: "0.68rem" }}>{formatTime(e.timestamp)}</span>
                      {e.txHash && (
                        <a href={explorerTxUrl(e.txHash)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--muted)", fontSize: "0.68rem", fontFamily: "monospace" }}>
                          {e.txHash.slice(0, 8)}…↗
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
