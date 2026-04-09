"use client";

import styles from "./live.module.css";
import type { TableResponse } from "@/lib/types";
import { getAgentProfile } from "@/lib/agentProfiles";
import { formatChips } from "@/lib/utils";
import { ZERO_ADDRESS } from "@/lib/utils";

interface AgentCardsProps {
  table: TableResponse | null;
  lastReasoning?: string;
}

export function AgentCards({ table, lastReasoning }: AgentCardsProps) {
  if (!table) {
    return (
      <div>
        <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#9ca3af", marginBottom: "0.5rem" }}>AGENTS</p>
        <div style={{ color: "#4b5563", fontSize: "0.8rem" }}>Waiting for table…</div>
      </div>
    );
  }

  const seats = table.seats?.filter((s) => s.owner && s.owner !== ZERO_ADDRESS) ?? [];

  return (
    <div>
      <p style={{ fontSize: "0.8rem", fontWeight: 700, color: "#9ca3af", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>AGENTS</p>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {seats.length === 0 ? (
          <div style={{ color: "#4b5563", fontSize: "0.8rem" }}>No agents seated</div>
        ) : (
          seats.map((seat) => {
            const profile = getAgentProfile(seat.operator ?? seat.owner ?? "");
            const emoji = profile?.accentColor ? (
              profile.personaId === "maniac" ? "🔥" :
              profile.personaId === "shark" ? "🦈" :
              profile.personaId === "rock" ? "🪨" :
              profile.personaId === "adaptive" ? "🧠" : "🤖"
            ) : "🤖";

            return (
              <div key={seat.seatIndex} className={styles.agentCard}>
                <div className={styles.agentEmoji}>{emoji}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className={styles.agentName}>
                    {profile?.name ?? `Seat ${seat.seatIndex}`}
                  </div>
                  <div className={styles.agentMeta}>
                    {seat.isActive ? "▶ Active" : "⏸ Folded"}
                    {seat.isAllIn && " · ALL-IN"}
                  </div>
                </div>
                <div className={styles.agentStack}>
                  <div className={styles.agentStackNum}>{formatChips(BigInt(seat.stack ?? 0))}</div>
                  <div className={styles.agentElo} style={{ color: profile?.accentColor ?? "#6b7280" }}>RCHIP</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {lastReasoning && (
        <div style={{ marginTop: "0.75rem" }}>
          <p style={{ fontSize: "0.72rem", color: "#6b7280", marginBottom: "0.25rem", letterSpacing: "0.04em" }}>AI THINKING</p>
          <div className={styles.thinkingBox}>
            {lastReasoning.split(".").slice(0, 2).join(". ").trim()}.
          </div>
        </div>
      )}
    </div>
  );
}
