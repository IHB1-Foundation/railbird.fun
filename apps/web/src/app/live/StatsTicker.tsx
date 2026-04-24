"use client";

import styles from "./live.module.css";
import { formatChips } from "@/lib/utils";

interface StatsTickerProps {
  totalHandsToday: number;
  biggestPot: bigint;
  currentLeader: string;
  sideBetPool: bigint;
  seatOdds: { seat: number; odds: string }[];
}

export function StatsTicker({
  totalHandsToday,
  biggestPot,
  currentLeader,
  sideBetPool,
  seatOdds,
}: StatsTickerProps) {
  return (
    <div>
      <div className={styles.ticker}>
        <p
          style={{
            fontSize: "0.72rem",
            fontWeight: 700,
            color: "var(--text-on-card)",
            letterSpacing: "0.05em",
            marginBottom: "0.5rem",
          }}
        >
          STATS
        </p>
        <div className={styles.tickerRow}>
          <span>Today&apos;s Hands</span>
          <span className={styles.tickerValue}>{totalHandsToday}</span>
        </div>
        <div className={styles.tickerRow}>
          <span>Biggest Pot</span>
          <span className={styles.tickerValue}>{formatChips(biggestPot)}</span>
        </div>
        <div className={styles.tickerRow}>
          <span>Current Leader</span>
          <span className={styles.tickerValue}>{currentLeader || "—"}</span>
        </div>
      </div>

      <div className={styles.sideBetPanel} style={{ marginTop: "0.75rem" }}>
        <div className={styles.sideBetTitle}>Side Bets</div>
        <div className={styles.tickerRow}>
          <span>Pool</span>
          <span className={styles.tickerValue}>{formatChips(sideBetPool)} RCHIP</span>
        </div>
        {seatOdds.length > 0 ? (
          seatOdds.map((o) => (
            <div key={o.seat} className={styles.oddRow}>
              <span>Seat {o.seat}</span>
              <span className={styles.oddValue}>{o.odds}</span>
            </div>
          ))
        ) : (
          <div className={styles.oddRow}>
            <span>Read-only</span>
            <span className={styles.oddValue}>No bets yet</span>
          </div>
        )}
      </div>
    </div>
  );
}
