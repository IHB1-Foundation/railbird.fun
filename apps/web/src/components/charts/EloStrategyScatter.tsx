"use client";
// T-1105: ELO vs Strategy scatter plot — shows which aggression level correlates with ELO.
// Pure SVG scatter plot.

interface DataPoint {
  agent: string;
  aggressionBps: number;
  elo: number;
}

interface Props {
  data: DataPoint[];
  width?: number;
  height?: number;
}

export function EloStrategyScatter({ data, width = 320, height = 180 }: Props) {
  if (data.length === 0) {
    return <p style={{ fontSize: "0.78rem", color: "var(--muted)" }}>No data available yet.</p>;
  }

  const PAD = { top: 10, right: 10, bottom: 24, left: 40 };
  const chartW = width - PAD.left - PAD.right;
  const chartH = height - PAD.top - PAD.bottom;

  const aggrs = data.map((d) => d.aggressionBps);
  const elos = data.map((d) => d.elo);
  const minAggr = Math.min(...aggrs, 0);
  const maxAggr = Math.max(...aggrs, 10000);
  const minElo = Math.min(...elos) - 50;
  const maxElo = Math.max(...elos) + 50;
  const aggrRange = maxAggr - minAggr || 1;
  const eloRange = maxElo - minElo || 1;

  function xPos(aggr: number) { return PAD.left + ((aggr - minAggr) / aggrRange) * chartW; }
  function yPos(elo: number) { return PAD.top + (1 - (elo - minElo) / eloRange) * chartH; }

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={width} height={height} style={{ display: "block" }} aria-label="ELO vs Aggression scatter plot">
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const y = PAD.top + t * chartH;
          const eloVal = Math.round(minElo + (1 - t) * eloRange);
          return (
            <g key={t}>
              <line x1={PAD.left} x2={PAD.left + chartW} y1={y} y2={y} stroke="rgba(255,255,255,0.06)" />
              <text x={PAD.left - 4} y={y + 4} textAnchor="end" fontSize={8} fill="rgba(255,255,255,0.35)">{eloVal}</text>
            </g>
          );
        })}
        {/* X-axis labels */}
        {[0, 0.5, 1].map((t) => {
          const x = PAD.left + t * chartW;
          const pct = Math.round((minAggr + t * aggrRange) / 100);
          return <text key={t} x={x} y={height - 4} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.35)">{pct}%</text>;
        })}
        {/* Axis labels */}
        <text x={width / 2} y={height - 0} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.4)">Aggression</text>
        <text x={8} y={PAD.top + chartH / 2} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.4)" transform={`rotate(-90,8,${PAD.top + chartH / 2})`}>ELO</text>
        {/* Data points */}
        {data.map((d, i) => (
          <circle
            key={i}
            cx={xPos(d.aggressionBps)}
            cy={yPos(d.elo)}
            r={5}
            fill="#8B5CF6"
            opacity={0.75}
          >
            <title>{d.agent.slice(0, 8)}… | Aggr: {(d.aggressionBps / 100).toFixed(0)}% | ELO: {d.elo.toFixed(0)}</title>
          </circle>
        ))}
      </svg>
      <p style={{ fontSize: "0.68rem", color: "var(--muted)", marginTop: "0.25rem", textAlign: "center" }}>
        X: Aggression level · Y: ELO rating
      </p>
    </div>
  );
}
