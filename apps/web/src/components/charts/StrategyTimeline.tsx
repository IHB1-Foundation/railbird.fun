"use client";
// T-1105: Strategy timeline chart — shows aggression/tightness per agent over versions.
// Pure CSS/SVG, no external charting library required.

import type { EvolutionAgentTimeline } from "@/lib/api";

const AGENT_COLORS = ["#8B5CF6", "#3B82F6", "#22C55E", "#F59E0B", "#EF4444", "#EC4899"];

interface Props {
  agents: EvolutionAgentTimeline[];
  metric?: "aggressionBps" | "tightnessBps" | "bluffFreqBps";
  height?: number;
}

export function StrategyTimeline({ agents, metric = "aggressionBps", height = 160 }: Props) {
  if (agents.length === 0 || agents.every((a) => a.strategies.length === 0)) {
    return <p style={{ fontSize: "0.78rem", color: "var(--muted)" }}>No evolution data yet.</p>;
  }

  // Find global min/max version numbers and metric values
  const allVersions = agents.flatMap((a) => a.strategies.map((s) => s.version));
  const allValues = agents.flatMap((a) => a.strategies.map((s) => s[metric]));

  if (allVersions.length === 0) return null;

  const minV = Math.min(...allVersions);
  const maxV = Math.max(...allVersions);
  const minVal = Math.min(...allValues, 0);
  const maxVal = Math.max(...allValues, 10000);
  const vRange = maxV - minV || 1;
  const valRange = maxVal - minVal || 1;

  const W = 320;
  const H = height;
  const PAD = { top: 10, right: 10, bottom: 20, left: 30 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  function xPos(v: number) { return PAD.left + ((v - minV) / vRange) * chartW; }
  function yPos(val: number) { return PAD.top + (1 - (val - minVal) / valRange) * chartH; }

  const labels = ["0%", "25%", "50%", "75%", "100%"];

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H} style={{ display: "block" }} aria-label="Strategy timeline chart">
        {/* Y-axis labels */}
        {labels.map((label, i) => {
          const y = PAD.top + (i / 4) * chartH;
          return (
            <g key={label}>
              <line x1={PAD.left} x2={PAD.left + chartW} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={8} fill="rgba(255,255,255,0.35)">{labels[4 - i]}</text>
            </g>
          );
        })}
        {/* Lines per agent */}
        {agents.map((agent, ai) => {
          const color = AGENT_COLORS[ai % AGENT_COLORS.length];
          const sorted = [...agent.strategies].sort((a, b) => a.version - b.version);
          if (sorted.length < 2) {
            // Single point
            if (sorted.length === 1) {
              const cx = xPos(sorted[0].version);
              const cy = yPos(sorted[0][metric]);
              return <circle key={agent.agent} cx={cx} cy={cy} r={3} fill={color} opacity={0.85} />;
            }
            return null;
          }
          const points = sorted.map((s) => `${xPos(s.version).toFixed(1)},${yPos(s[metric]).toFixed(1)}`).join(" ");
          return (
            <g key={agent.agent}>
              <polyline points={points} fill="none" stroke={color} strokeWidth={1.5} opacity={0.85} />
              {sorted.map((s, si) => (
                <circle key={si} cx={xPos(s.version)} cy={yPos(s[metric])} r={2} fill={color} opacity={0.7}>
                  <title>{`v${s.version}: ${(s[metric] / 100).toFixed(0)}%`}</title>
                </circle>
              ))}
            </g>
          );
        })}
        {/* X-axis: version labels */}
        {[minV, Math.round((minV + maxV) / 2), maxV].map((v) => (
          <text key={v} x={xPos(v)} y={H - 4} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.35)">v{v}</text>
        ))}
      </svg>
      {/* Legend */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.3rem" }}>
        {agents.map((agent, ai) => (
          <div key={agent.agent} style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.68rem" }}>
            <div style={{ width: "10px", height: "3px", background: AGENT_COLORS[ai % AGENT_COLORS.length], borderRadius: "2px" }} />
            <span style={{ color: "var(--muted)", fontFamily: "monospace" }}>{agent.agent.slice(0, 6)}…</span>
          </div>
        ))}
      </div>
    </div>
  );
}
