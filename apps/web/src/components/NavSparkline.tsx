"use client";

import { useState } from "react";

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
const LABEL_LEFT = 44; // space for Y-axis labels

export function NavSparkline({ data }: NavSparklineProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

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

  const chartW = WIDTH - LABEL_LEFT;

  const points = values.map((v, i) => {
    const x = LABEL_LEFT + PADDING + ((chartW - 2 * PADDING) * i) / (values.length - 1);
    const y = HEIGHT - PADDING - ((v - min) / range) * (HEIGHT - 2 * PADDING);
    return { x, y };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(" ");
  const areaPath = `M${points[0].x},${points[0].y} ${points.slice(1).map((p) => `L${p.x},${p.y}`).join(" ")} L${points[points.length - 1].x},${HEIGHT} L${points[0].x},${HEIGHT} Z`;

  const isPositive = values[values.length - 1] >= values[0];
  const strokeColor = isPositive ? "var(--success)" : "var(--danger)";
  const fillColor = isPositive ? "rgba(57, 217, 138, 0.12)" : "rgba(255, 98, 110, 0.12)";

  const firstVal = values[0].toFixed(4);
  const lastVal = values[values.length - 1].toFixed(4);
  const maxVal = max.toFixed(4);
  const minVal = min.toFixed(4);
  const pctChange = (((values[values.length - 1] - values[0]) / values[0]) * 100).toFixed(2);
  const trend = isPositive ? "up" : "down";
  const ariaLabel = `NAV performance chart: ${trend} ${Math.abs(Number(pctChange))}% over ${values.length} hands`;
  const summaryText = `NAV: ${firstVal} → ${lastVal}, ${isPositive ? "+" : ""}${pctChange}% over ${values.length} hands. High: ${maxVal}, Low: ${minVal}`;

  // Baseline Y (start value)
  const baselineY = HEIGHT - PADDING - ((values[0] - min) / range) * (HEIGHT - 2 * PADDING);

  const hoveredPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const hoveredValue = hoverIndex !== null ? values[hoverIndex] : null;

  return (
    <div style={{ position: "relative" }}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        width="100%"
        height={HEIGHT}
        preserveAspectRatio="none"
        style={{ display: "block" }}
        role="img"
        aria-label={ariaLabel}
        aria-describedby="nav-sparkline-desc"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <title>{ariaLabel}</title>
        <desc id="nav-sparkline-desc">{summaryText}</desc>

        {/* Baseline (start NAV) dashed line */}
        <line
          x1={LABEL_LEFT + PADDING}
          y1={baselineY}
          x2={WIDTH - PADDING}
          y2={baselineY}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="1"
          strokeDasharray="4 3"
        />

        {/* Y-axis labels */}
        <text x={LABEL_LEFT - 4} y={PADDING + 6} textAnchor="end" fill="var(--muted)" fontSize="9" fontFamily="var(--text-mono)">
          {maxVal}
        </text>
        <text x={LABEL_LEFT - 4} y={HEIGHT - PADDING} textAnchor="end" fill="var(--muted)" fontSize="9" fontFamily="var(--text-mono)">
          {minVal}
        </text>

        {/* Area fill */}
        <path d={areaPath} fill={fillColor} />
        {/* Line */}
        <polyline points={polyline} fill="none" stroke={strokeColor} strokeWidth="2" strokeLinejoin="round" />

        {/* X-axis labels */}
        <text x={LABEL_LEFT + PADDING} y={HEIGHT - 1} textAnchor="start" fill="var(--muted)" fontSize="9" fontFamily="var(--text-mono)">
          {values.length} hands ago
        </text>
        <text x={WIDTH - PADDING} y={HEIGHT - 1} textAnchor="end" fill="var(--muted)" fontSize="9" fontFamily="var(--text-mono)">
          Latest
        </text>

        {/* Hover detection */}
        {points.map((p, i) => (
          <rect
            key={i}
            x={p.x - (chartW / values.length) / 2}
            y={0}
            width={chartW / values.length}
            height={HEIGHT}
            fill="transparent"
            onMouseEnter={() => setHoverIndex(i)}
          />
        ))}

        {/* Hover dot */}
        {hoveredPoint && (
          <circle cx={hoveredPoint.x} cy={hoveredPoint.y} r="4" fill={strokeColor} stroke="rgba(255,255,255,0.8)" strokeWidth="1.5" />
        )}
      </svg>

      {/* Hover tooltip */}
      {hoveredPoint && hoveredValue !== null && hoverIndex !== null && (
        <div
          style={{
            position: "absolute",
            top: `${(hoveredPoint.y / HEIGHT) * 100}%`,
            left: `${(hoveredPoint.x / WIDTH) * 100}%`,
            transform: "translate(-50%, -130%)",
            background: "rgba(12, 13, 28, 0.97)",
            border: "1px solid var(--card-border)",
            borderRadius: "6px",
            padding: "0.25rem 0.5rem",
            fontSize: "0.72rem",
            color: "var(--foreground)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 10,
          }}
        >
          Hand #{data[hoverIndex].handId}: {hoveredValue.toFixed(4)}
        </div>
      )}

      {/* Screen reader summary */}
      <p className="sr-only">
        {summaryText}. Start: {firstVal}, End: {lastVal}.
      </p>
    </div>
  );
}
