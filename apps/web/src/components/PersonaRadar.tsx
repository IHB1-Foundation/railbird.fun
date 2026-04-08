"use client";

import type { PersonaSummary } from "@/lib/agentProfiles";
import styles from "./PersonaRadar.module.css";

interface PersonaRadarProps {
  persona: PersonaSummary;
  size?: "small" | "large";
}

type Axis = { key: keyof Pick<PersonaSummary, "aggression" | "tightness" | "bluffFrequency">; label: string };

const AXES: Axis[] = [
  { key: "aggression", label: "Aggression" },
  { key: "tightness", label: "Tightness" },
  { key: "bluffFrequency", label: "Bluff" },
];

/**
 * CSS-only radar chart (SVG polygon) for 3-axis persona visualization.
 * No external libraries required.
 */
export function PersonaRadar({ persona, size = "large" }: PersonaRadarProps) {
  const dim = size === "small" ? 80 : 160;
  const cx = dim / 2;
  const cy = dim / 2;
  const r = dim * 0.38;

  // 3 axes equally spaced (120° apart), starting from top
  const angleOffset = -Math.PI / 2;
  const points = AXES.map((axis, i) => {
    const angle = angleOffset + (2 * Math.PI * i) / AXES.length;
    const val = persona[axis.key] as number;
    return {
      label: axis.label,
      x: cx + r * val * Math.cos(angle),
      y: cy + r * val * Math.sin(angle),
      lx: cx + (r + (size === "small" ? 10 : 20)) * Math.cos(angle),
      ly: cy + (r + (size === "small" ? 10 : 20)) * Math.sin(angle),
    };
  });

  // Grid rings
  const rings = [0.25, 0.5, 0.75, 1.0];
  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg
      width={dim}
      height={dim}
      className={`${styles.radar} ${size === "small" ? styles.radarSmall : styles.radarLarge}`}
      viewBox={`0 0 ${dim} ${dim}`}
      aria-label={`Persona radar chart for ${persona.name}`}
    >
      {/* Grid rings */}
      {rings.map((ring) => {
        const ringPts = AXES.map((_, i) => {
          const angle = angleOffset + (2 * Math.PI * i) / AXES.length;
          return `${cx + r * ring * Math.cos(angle)},${cy + r * ring * Math.sin(angle)}`;
        }).join(" ");
        return (
          <polygon
            key={ring}
            points={ringPts}
            className={styles.radarGrid}
          />
        );
      })}

      {/* Axis lines */}
      {points.map((p, i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + r * Math.cos(angleOffset + (2 * Math.PI * i) / AXES.length)}
          y2={cy + r * Math.sin(angleOffset + (2 * Math.PI * i) / AXES.length)}
          className={styles.radarAxis}
        />
      ))}

      {/* Data polygon */}
      <polygon
        points={polygonPoints}
        className={styles.radarFill}
        style={{ fill: persona.colorAccent + "40", stroke: persona.colorAccent }}
      />

      {/* Labels (only for large) */}
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
