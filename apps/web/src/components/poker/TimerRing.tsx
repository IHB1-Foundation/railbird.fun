"use client";

import { useState, useEffect } from "react";

const FULL_PERIOD = Number(process.env.NEXT_PUBLIC_ACTION_DEADLINE_SECONDS || "1800");
const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Hybrid color: absolute seconds + ratio fallback so short deadlines still feel urgent */
function getColor(remaining: number, pct: number): string {
  if (remaining > 300) return "#4ade80"; // > 5 min: green
  if (remaining > 120) return "#facc15"; // 2-5 min: yellow
  if (remaining > 60) return "#fb923c"; // 1-2 min: orange
  if (remaining > 0) return "#ef4444"; // < 1 min: red
  // pct-based minimum: always at least yellow if <= 10%
  if (pct <= 0.1) return "#facc15";
  return "#4ade80";
}

interface TimerRingProps {
  deadline: string | null;
}

export function TimerRing({ deadline }: TimerRingProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!deadline) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline) return null;

  const deadlineMs = Number(deadline) * 1000;
  const remaining = Math.max(0, Math.floor((deadlineMs - now) / 1000));
  const pct = Math.min(1, remaining / FULL_PERIOD);
  const offset = CIRCUMFERENCE * (1 - pct);
  const color = getColor(remaining, pct);
  const isPulsing = remaining < 60 && remaining > 0;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  const srStyle: React.CSSProperties = {
    position: "absolute",
    width: "1px",
    height: "1px",
    padding: 0,
    margin: "-1px",
    overflow: "hidden",
    clip: "rect(0,0,0,0)",
    whiteSpace: "nowrap",
    border: 0,
  };

  // UX-5.3: Only show the full ring when < 5 minutes remain — saves visual space at 30-min deadline
  if (remaining > 300) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          fontSize: "0.72rem",
          color: "var(--muted)",
        }}
        aria-label={`${minutes}m ${String(seconds).padStart(2, "0")}s remaining`}
      >
        <span style={{ color: "#4ade80", fontSize: "0.6rem" }}>●</span>
        {minutes}m
      </div>
    );
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
      }}
    >
      <div aria-live="assertive" aria-atomic="true" style={srStyle}>
        {remaining === 0 ? "Time expired" : ""}
      </div>
      <svg
        width="88"
        height="88"
        viewBox="0 0 88 88"
        style={isPulsing ? { animation: "timer-pulse 0.8s ease-in-out infinite" } : undefined}
      >
        {/* Background circle */}
        <circle
          cx="44"
          cy="44"
          r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="5"
        />
        {/* Progress circle */}
        <circle
          cx="44"
          cy="44"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
          transform="rotate(-90 44 44)"
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
        />
        {/* Time text */}
        <text
          x="44"
          y="46"
          textAnchor="middle"
          dominantBaseline="middle"
          fill="#fff"
          fontSize="14"
          fontWeight="700"
          fontFamily="var(--text-mono), monospace"
        >
          {remaining > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : "0:00"}
        </text>
      </svg>
    </div>
  );
}
