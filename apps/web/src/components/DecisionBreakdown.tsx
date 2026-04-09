"use client";

import React from "react";

export interface DecisionBreakdownData {
  handStrength: string;
  potOdds: string;
  evEstimate: string;
  opponentRead: string;
  keyFactor: string;
  confidence: number;
  gtoDeviation?: { action: string; severity: number; explanation: string };
  counterStrategy?: string;
}

interface DecisionBreakdownProps {
  data: DecisionBreakdownData;
  mode?: "compact" | "expanded";
}

function ConfidenceGauge({ value }: { value: number }) {
  const color = value >= 70 ? "#10b981" : value >= 40 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <div style={{ flex: 1, height: "6px", background: "rgba(255,255,255,0.1)", borderRadius: "3px", overflow: "hidden" }}>
        <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: "3px", transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: "0.72rem", fontWeight: 700, color, minWidth: "2rem", textAlign: "right" }}>{value}%</span>
    </div>
  );
}

function EvBadge({ text }: { text: string }) {
  const isPositive = text.toLowerCase().includes("+ev") || text.toLowerCase().includes("positive");
  const isNegative = text.toLowerCase().includes("-ev") || text.toLowerCase().includes("negative");
  const color = isPositive ? "#10b981" : isNegative ? "#ef4444" : "#9ca3af";
  return (
    <span style={{ color, fontWeight: 600 }}>{text}</span>
  );
}

export function DecisionBreakdown({ data, mode = "expanded" }: DecisionBreakdownProps) {
  if (mode === "compact") {
    const color = data.confidence >= 70 ? "#10b981" : data.confidence >= 40 ? "#f59e0b" : "#ef4444";
    return (
      <span style={{
        fontSize: "0.65rem", fontWeight: 700, color: "#fff",
        background: color, borderRadius: "9999px", padding: "0.1rem 0.4rem",
        marginLeft: "0.25rem",
      }}>
        {data.confidence}%
      </span>
    );
  }

  return (
    <div style={{
      background: "rgba(139, 92, 246, 0.06)",
      border: "1px solid rgba(139, 92, 246, 0.2)",
      borderRadius: "0.625rem",
      padding: "0.875rem",
      marginTop: "0.5rem",
      fontSize: "0.78rem",
    }}>
      <p style={{ fontSize: "0.7rem", fontWeight: 700, color: "#8b5cf6", letterSpacing: "0.05em", marginBottom: "0.625rem" }}>
        WHY THIS DECISION?
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {/* Hand Strength */}
        <div>
          <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>Hand Strength</span>
          <p style={{ color: "#f9fafb", margin: "0.125rem 0 0" }}>{data.handStrength}</p>
        </div>

        {/* Pot Odds */}
        <div>
          <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>Pot Odds</span>
          <p style={{ color: "#f9fafb", margin: "0.125rem 0 0" }}>{data.potOdds}</p>
        </div>

        {/* EV Estimate */}
        <div>
          <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>EV Estimate</span>
          <p style={{ margin: "0.125rem 0 0" }}><EvBadge text={data.evEstimate} /></p>
        </div>

        {/* Opponent Read */}
        <div>
          <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>Opponent Read</span>
          <p style={{ color: "#d1d5db", margin: "0.125rem 0 0", fontStyle: "italic" }}>{data.opponentRead}</p>
        </div>

        {/* Key Factor */}
        <div style={{ background: "rgba(139, 92, 246, 0.12)", borderRadius: "0.375rem", padding: "0.375rem 0.5rem" }}>
          <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>Key Factor</span>
          <p style={{ color: "#c4b5fd", fontWeight: 600, margin: "0.125rem 0 0" }}>{data.keyFactor}</p>
        </div>

        {/* GTO Note */}
        {data.gtoDeviation && (
          <div style={{ background: "rgba(239, 68, 68, 0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.375rem", padding: "0.375rem 0.5rem" }}>
            <span style={{ color: "#6b7280", fontSize: "0.7rem" }}>GTO Note</span>
            <p style={{ color: "#fca5a5", margin: "0.125rem 0 0" }}>
              Deviated from GTO (severity: {(data.gtoDeviation.severity * 100).toFixed(0)}%): {data.gtoDeviation.explanation}
            </p>
          </div>
        )}

        {/* Confidence */}
        <div>
          <span style={{ color: "#6b7280", fontSize: "0.7rem", display: "block", marginBottom: "0.25rem" }}>Confidence</span>
          <ConfidenceGauge value={data.confidence} />
        </div>
      </div>
    </div>
  );
}
