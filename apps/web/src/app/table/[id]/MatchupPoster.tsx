"use client";

import type { TableResponse } from "@/lib/types";
import { getAgentProfile } from "@/lib/agentProfiles";
import { getDisplayName } from "@/lib/nicknames";
import { shortenAddress } from "@/lib/utils";
import styles from "./MatchupPoster.module.css";

interface MatchupPosterProps {
  table: TableResponse;
  handId?: string | null;
}

/**
 * G-19: Matchup Poster Header — VS-style fight card with HP bars.
 * Renders for tables with 2+ occupied seats.
 */
export function MatchupPoster({ table, handId }: MatchupPosterProps) {
  const occupied = table.seats.filter(
    (s) => s.ownerAddress !== "0x0000000000000000000000000000000000000000"
  );

  if (occupied.length < 2) return null;

  const [left, right] = occupied.slice(0, 2);

  const leftStack = BigInt(left.stack ?? "0");
  const rightStack = BigInt(right.stack ?? "0");
  const totalStack = leftStack + rightStack;
  const leftPct = totalStack > 0n ? Number((leftStack * 100n) / totalStack) : 50;
  const rightPct = totalStack > 0n ? Number((rightStack * 100n) / totalStack) : 50;

  const leftProfile = getAgentProfile(left.operatorAddress) || getAgentProfile(left.ownerAddress);
  const rightProfile = getAgentProfile(right.operatorAddress) || getAgentProfile(right.ownerAddress);

  const leftName = leftProfile?.name ?? getDisplayName(left.ownerAddress);
  const rightName = rightProfile?.name ?? getDisplayName(right.ownerAddress);

  const isActive = table.gameState !== "WAITING_FOR_SEATS" && table.gameState !== "SETTLED";
  const gameLabel = table.gameState.replace(/_/g, " ");

  return (
    <div className={styles.matchupPoster} role="region" aria-label="Match overview">
      {/* Left agent */}
      <div className={`${styles.side} ${styles.sideLeft}`}>
        <span className={styles.agentName}>{leftName}</span>
        <span className={styles.agentAddr}>{shortenAddress(left.ownerAddress)}</span>
        <div className={styles.hpBarWrap}>
          <span className={styles.hpLabel}>{left.stack} RCHIP</span>
          <div className={styles.hpTrack} role="meter" aria-valuenow={leftPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${leftName} stack`}>
            <div className={`${styles.hpBar} ${styles.hpBarLeft}`} style={{ width: `${leftPct}%` }} />
          </div>
        </div>
      </div>

      {/* Center: VS + round */}
      <div className={styles.vsCenter}>
        <span className={styles.vsText} aria-hidden="true">VS</span>
        {handId && (
          <span className={styles.roundBadge}>Round {handId}</span>
        )}
        <span className={`${styles.gameStateBadge}${isActive ? "" : ` ${styles.gameStateBadgeWaiting}`}`}>
          {isActive ? gameLabel : "WAITING"}
        </span>
      </div>

      {/* Right agent */}
      <div className={`${styles.side} ${styles.sideRight}`}>
        <span className={styles.agentName}>{rightName}</span>
        <span className={styles.agentAddr}>{shortenAddress(right.ownerAddress)}</span>
        <div className={styles.hpBarWrap}>
          <span className={styles.hpLabel}>{right.stack} RCHIP</span>
          <div className={styles.hpTrack} role="meter" aria-valuenow={rightPct} aria-valuemin={0} aria-valuemax={100} aria-label={`${rightName} stack`}>
            <div className={`${styles.hpBar} ${styles.hpBarRight}`} style={{ width: `${rightPct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
