"use client";
// T-1105: Meta-game radar chart — shows average strategy profile across all agents.
// Pure SVG radar chart.

interface Props {
  aggressionBps: number;
  tightnessBps: number;
  bluffFreqBps: number;
  size?: number;
}

export function MetaRadar({ aggressionBps, tightnessBps, bluffFreqBps, size = 140 }: Props) {
  // Normalize to 0-1
  const aggr = Math.min(1, aggressionBps / 10000);
  const tight = Math.min(1, tightnessBps / 10000);
  const bluff = Math.min(1, bluffFreqBps / 8000); // bluff max is 80%

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;

  // 3-axis radar: top = aggression, bottom-right = tightness, bottom-left = bluff
  const axes = [
    { label: "Aggr", value: aggr, angle: -Math.PI / 2 },
    { label: "Tight", value: tight, angle: -Math.PI / 2 + (2 * Math.PI) / 3 },
    { label: "Bluff", value: bluff, angle: -Math.PI / 2 + (4 * Math.PI) / 3 },
  ];

  function axisEnd(angle: number, scale = 1) {
    return { x: cx + Math.cos(angle) * r * scale, y: cy + Math.sin(angle) * r * scale };
  }

  const dataPoints = axes.map(({ value, angle }) => axisEnd(angle, value));

  const dataPath =
    dataPoints
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(" ") + " Z";

  return (
    <svg
      width={size}
      height={size}
      aria-label="Strategy radar chart"
      style={{ overflow: "visible" }}
    >
      {/* Outer grid */}
      {[0.25, 0.5, 0.75, 1].map((scale) => {
        const pts = axes.map(({ angle }) => axisEnd(angle, scale));
        const path =
          pts
            .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
            .join(" ") + " Z";
        return (
          <path
            key={scale}
            d={path}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={0.8}
          />
        );
      })}
      {/* Axis lines */}
      {axes.map(({ angle, label }, i) => {
        const end = axisEnd(angle, 1);
        const labelPos = axisEnd(angle, 1.25);
        return (
          <g key={i}>
            <line
              x1={cx}
              y1={cy}
              x2={end.x}
              y2={end.y}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={0.8}
            />
            <text
              x={labelPos.x}
              y={labelPos.y + 3}
              textAnchor="middle"
              fontSize={9}
              fill="rgba(255,255,255,0.5)"
            >
              {label}
            </text>
          </g>
        );
      })}
      {/* Data polygon */}
      <path d={dataPath} fill="rgba(139,92,246,0.25)" stroke="#8B5CF6" strokeWidth={1.5} />
      {/* Data points */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={3} fill="#8B5CF6">
          <title>
            {axes[i].label}: {(axes[i].value * 100).toFixed(0)}%
          </title>
        </circle>
      ))}
    </svg>
  );
}
