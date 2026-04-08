"use client";

interface DataPoint {
  handId: string;
  navPerShare: string;
}

interface NavSparklineProps {
  data: DataPoint[];
}

const WIDTH = 600;
const HEIGHT = 120;
const PADDING = 4;

export function NavSparkline({ data }: NavSparklineProps) {
  if (data.length < 2) {
    return (
      <div style={{ height: HEIGHT, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)", fontSize: "0.82rem" }}>
        {data.length === 0 ? "No data" : "Waiting for more snapshots\u2026"}
      </div>
    );
  }

  const values = data.map((d) => Number(BigInt(d.navPerShare)) / 1e18);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = values.map((v, i) => {
    const x = PADDING + ((WIDTH - 2 * PADDING) * i) / (values.length - 1);
    const y = HEIGHT - PADDING - ((v - min) / range) * (HEIGHT - 2 * PADDING);
    return `${x},${y}`;
  });

  const polyline = points.join(" ");
  const areaPath = `M${points[0]} ${points.slice(1).map((p) => `L${p}`).join(" ")} L${WIDTH - PADDING},${HEIGHT} L${PADDING},${HEIGHT} Z`;

  const isPositive = values[values.length - 1] >= values[0];
  const strokeColor = isPositive ? "#4ade80" : "#ef4444";
  const fillColor = isPositive ? "rgba(74, 222, 128, 0.12)" : "rgba(239, 68, 68, 0.12)";

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} preserveAspectRatio="none" style={{ display: "block" }}>
      <path d={areaPath} fill={fillColor} />
      <polyline points={polyline} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />
      {values.map((v, i) => {
        const x = PADDING + ((WIDTH - 2 * PADDING) * i) / (values.length - 1);
        const y = HEIGHT - PADDING - ((v - min) / range) * (HEIGHT - 2 * PADDING);
        return <circle key={i} cx={x} cy={y} r="0" fill="transparent"><title>Hand #{data[i].handId}: {v.toFixed(4)}</title></circle>;
      })}
    </svg>
  );
}
