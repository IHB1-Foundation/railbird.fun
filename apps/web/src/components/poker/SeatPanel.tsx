"use client";

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
  isOwner: boolean;
  isHandActive: boolean;
  holeCards: HoleCardsResponse | null;
  turnTimeRemaining: string;
}

export function SeatPanel({
  seat,
  isActor,
  isButton,
  isOwner,
  isHandActive,
  holeCards,
  turnTimeRemaining,
}: SeatPanelProps) {
  if (seat.ownerAddress.toLowerCase() === ZERO_ADDRESS) {
    return (
      <div className={styles.seatPanel}>
        <div className={styles.seatLabel}>Seat {seat.seatIndex}</div>
        <div className="muted">Empty</div>
      </div>
    );
  }

  const profile = getAgentProfile(seat.operatorAddress ?? "") || getAgentProfile(seat.ownerAddress);

  return (
    <div
      className={cn(
        styles.seatPanel,
        isActor && styles.active,
        isOwner && styles.owner,
        isHandActive && !seat.isActive && styles.folded
      )}
      style={profile ? { borderColor: profile.accentColor } : undefined}
    >
      <div className={styles.seatLabel}>
        <span>Seat {seat.seatIndex}</span>
        {isButton && <span className={styles.dealerChip}>D</span>}
        {isOwner && <span className={styles.youPill}>YOU</span>}
      </div>
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
      <div className={cn(styles.seatBet, seat.currentBet === "0" && styles.zero)}>
        <span className={styles.seatBetChip} />
        This Round: {formatChips(seat.currentBet)} {CHIP_SYMBOL}
      </div>
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
      {/* Owner's hole cards — only shown to the seat owner */}
      {isOwner && holeCards && (
        <div className={styles.seatHolecards}>
          <div className={styles.holeCardsLabel}>Your Hand</div>
          <div className={styles.holeCards}>
            <PokerCard cardIndex={holeCards.cards[0]} />
            <PokerCard cardIndex={holeCards.cards[1]} />
          </div>
        </div>
      )}
    </div>
  );
}
