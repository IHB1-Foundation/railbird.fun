"use client";

import { useState } from "react";
import { cn, formatChips, shortenAddress, CHIP_SYMBOL, ZERO_ADDRESS } from "@/lib/utils";
import { getAgentProfile } from "@/lib/agentProfiles";
import type { HoleCardsResponse } from "@/lib/auth";
import { PokerCard } from "./PokerCard";
import styles from "./SeatPanel.module.css";

/** Minimal seat shape required by SeatPanel — allows placeholder seats without tokenAddress. */
interface SeatShape {
  seatIndex: number;
  ownerAddress: string;
  operatorAddress?: string;
  stack: string;
  currentBet: string;
  isActive: boolean;
}

interface SeatPanelProps {
  seat: SeatShape;
  isActor: boolean;
  isButton: boolean;
  /** G-11: small blind marker */
  isSB?: boolean;
  /** G-11: big blind marker */
  isBB?: boolean;
  isOwner: boolean;
  isHandActive: boolean;
  isWinner?: boolean;
  holeCards: HoleCardsResponse | null;
  turnTimeRemaining: string;
  /** G-9: last action taken by this seat in the current hand ("CHECK", "FOLD", "BET", etc.) */
  lastAction?: string;
}

export function SeatPanel({
  seat,
  isActor,
  isButton,
  isSB,
  isBB,
  isOwner,
  isHandActive,
  isWinner,
  holeCards,
  turnTimeRemaining,
  lastAction,
}: SeatPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (seat.ownerAddress.toLowerCase() === ZERO_ADDRESS) {
    return (
      <div className={styles.seatPanel}>
        <div className={styles.seatLabel}>Seat {seat.seatIndex}</div>
        <div className="muted">Empty</div>
      </div>
    );
  }

  const profile = getAgentProfile(seat.operatorAddress ?? "") || getAgentProfile(seat.ownerAddress);
  const isFolded = isHandActive && !seat.isActive;
  // G-9: All-in = stack exhausted but seat still active in this hand
  const isAllIn = isHandActive && seat.isActive && seat.stack === "0";
  // G-9: Check pulse = last action was CHECK (not currently acting)
  const justChecked = !isActor && lastAction === "CHECK";

  return (
    <div
      className={cn(
        styles.seatPanel,
        isActor && styles.active,
        isOwner && styles.owner,
        isFolded && styles.folded,
        isAllIn && styles.allIn,
        justChecked && styles.justChecked
      )}
      style={profile ? { borderColor: profile.accentColor } : undefined}
      data-winner={isWinner ? "true" : undefined}
    >
      <div className={styles.seatLabel}>
        <span>Seat {seat.seatIndex}</span>
        {isButton && <span className={styles.dealerChip}>D</span>}
        {/* G-11: SB/BB blind markers */}
        {!isButton && isSB && <span className={styles.sbChip} aria-label="Small Blind">SB</span>}
        {!isButton && isBB && <span className={styles.bbChip} aria-label="Big Blind">BB</span>}
        {isOwner && <span className={styles.youPill}>YOU</span>}
      </div>

      {/* Mobile compact summary row */}
      <div className={styles.mobileSummaryRow}>
        <span className={styles.mobileName}>
          {profile ? profile.name : shortenAddress(seat.ownerAddress)}
        </span>
        <span className={styles.mobileStack}>{formatChips(seat.stack)} {CHIP_SYMBOL}</span>
        {isActor && (
          <span className={styles.mobileActingBadge}>ACTING</span>
        )}
        {isFolded && (
          <span className={styles.mobileFoldedBadge}>FOLDED</span>
        )}
        {isActor && turnTimeRemaining !== "--" && (
          <span className={cn(styles.mobileTurnTimer, turnTimeRemaining === "Expired" && styles.urgent)}>
            {turnTimeRemaining}
          </span>
        )}
        <button
          className={styles.mobileExpandBtn}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse seat details" : "Expand seat details"}
        >
          {expanded ? "▲" : "▼"}
        </button>
      </div>

      {/* Full details — always shown on desktop, collapsible on mobile */}
      <div className={cn(styles.desktopDetails, expanded && styles.mobileExpanded)}>
        <div className={styles.seatAddress} title={seat.ownerAddress}>
          {profile ? profile.name : shortenAddress(seat.ownerAddress)}
        </div>
        {profile && (
          <div
            className={styles.aggressionBadge}
            style={{ background: profile.accentColor, color: profile.colorHex }}
          >
            {profile.aggressionLabel}
          </div>
        )}
        <div className={styles.seatStack}>
          {formatChips(seat.stack)} {CHIP_SYMBOL}
        </div>
        {seat.currentBet !== "0" && (
          <div className={styles.seatBet}>
            <span className={styles.seatBetChip} />
            This Round: {formatChips(seat.currentBet)} {CHIP_SYMBOL}
          </div>
        )}
        {isFolded && <div className={styles.foldedBadge}>FOLDED</div>}
        {/* G-9: All-in badge */}
        {isAllIn && <div className={styles.allInBadgeLocal} aria-label="All in">ALL IN</div>}
        {isActor && <div className={styles.seatActionBadge}>ACTING</div>}
        {isActor && turnTimeRemaining !== "--" && (
          <div
            className={cn(
              styles.seatTurnTimer,
              turnTimeRemaining === "Expired" && styles.urgent
            )}
          >
            {turnTimeRemaining}
          </div>
        )}
      </div>

      {/* Owner's hole cards — always shown, never collapsed */}
      {isOwner && holeCards && (
        <div className={cn(styles.seatHolecards, isFolded && styles.foldedHolecards)}>
          <div className={styles.holeCardsLabel}>Your Hand</div>
          <div className={styles.holeCards}>
            <PokerCard cardIndex={holeCards.cards[0]} />
            <PokerCard cardIndex={holeCards.cards[1]} />
          </div>
          {isFolded && (
            <div className={styles.foldedCardsOverlay}>Folded</div>
          )}
        </div>
      )}
    </div>
  );
}
