"use client";

import styles from "./PersonaRadar.module.css";

interface RadarAxis {
  label: string;
  value: number; // 0–1
}

interface PersonaRadarProps {
  /** Array of axes to render. Minimum 3, maximum 6. */
  axes: RadarAxis[];
  /** Accent colour for the data polygon. */
  colorAccent?: string;
  /** Descriptive name for aria-label. */
  name?: string;
  size?: "small" | "large";
}

/**
 * D-20: Unified SVG radar chart.
 * Replaces both the inline RadarPreview in create-agent/page.tsx
 * and the original MetaRadar-adjacent PersonaRadar.
 * No external libraries — pure SVG.
 */
export function PersonaRadar({
  axes,
  colorAccent = "#8B5CF6",
  name = "Persona",
  size = "large",
}: PersonaRadarProps) {
  const dim = size === "small" ? 80 : 160;
  const cx = dim / 2;
  const cy = dim / 2;
  const r = dim * 0.35;
  const labelOffset = size === "small" ? 10 : 18;

  const angleOffset = -Math.PI / 2;
  const n = axes.length;

  const points = axes.map((axis, i) => {
    const angle = angleOffset + (2 * Math.PI * i) / n;
    return {
      label: axis.label,
      x: cx + r * axis.value * Math.cos(angle),
      y: cy + r * axis.value * Math.sin(angle),
      lx: cx + (r + labelOffset) * Math.cos(angle),
      ly: cy + (r + labelOffset) * Math.sin(angle),
    };
  });

  const rings = [0.25, 0.5, 0.75, 1.0];
  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      width={dim}
      height={dim}
      className={`${styles.radar} ${size === "small" ? styles.radarSmall : styles.radarLarge}`}
      viewBox={`0 0 ${dim} ${dim}`}
      aria-label={`${name} radar chart`}
    >
      {/* Grid rings */}
      {rings.map((ring) => {
        const ringPts = axes.map((_, i) => {
          const angle = angleOffset + (2 * Math.PI * i) / n;
          return `${cx + r * ring * Math.cos(angle)},${cy + r * ring * Math.sin(angle)}`;
        }).join(" ");
        return <polygon key={ring} points={ringPts} className={styles.radarGrid} />;
      })}

      {/* Axis lines */}
      {axes.map((_, i) => {
        const angle = angleOffset + (2 * Math.PI * i) / n;
        return (
          <line
            key={i}
            x1={cx} y1={cy}
            x2={cx + r * Math.cos(angle)}
            y2={cy + r * Math.sin(angle)}
            className={styles.radarAxis}
          />
        );
      })}

      {/* Data polygon */}
      <polygon
        points={polygonPoints}
        className={styles.radarFill}
        style={{ fill: colorAccent + "40", stroke: colorAccent }}
      />

      {/* Labels */}
      {size === "large" && points.map((p, i) => (
        <text
          key={i}
          x={p.lx}
          y={p.ly}
          textAnchor="middle"
          dominantBaseline="middle"
          className={styles.radarLabel}
        >
          {p.label}
        </text>
      ))}
    </svg>
  );
}

// ── Convenience wrappers for existing callers ─────────────────────────────────

interface PersonaSummaryLike {
  name?: string;
  colorAccent?: string;
  aggression: number;
  tightness: number;
  bluffFrequency: number;
}

/**
 * Renders the standard 3-axis persona radar (aggression / tightness / bluff).
 * Drop-in replacement for the old PersonaRadar that accepted a PersonaSummary.
 */
export function PersonaSummaryRadar({
  persona,
  size = "large",
}: {
  persona: PersonaSummaryLike;
  size?: "small" | "large";
}) {
  return (
    <PersonaRadar
      axes={[
        { label: "Aggression", value: persona.aggression },
        { label: "Tightness", value: persona.tightness },
        { label: "Bluff", value: persona.bluffFrequency },
      ]}
      colorAccent={persona.colorAccent}
      name={persona.name ?? "Agent"}
      size={size}
    />
  );
}
