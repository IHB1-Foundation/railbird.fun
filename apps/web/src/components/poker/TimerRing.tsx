"use client";

import { useState, useEffect } from "react";

const FULL_PERIOD = Number(process.env.NEXT_PUBLIC_ACTION_DEADLINE_SECONDS || "1800");
const RADIUS = 36;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getColor(pct: number): string {
  if (pct > 0.6) return "#4ade80"; // green
  if (pct > 0.3) return "#facc15"; // yellow
  if (pct > 0.1) return "#fb923c"; // orange
  return "#ef4444"; // red
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
  const color = getColor(pct);
  const isPulsing = pct < 0.05 && pct > 0;
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
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
