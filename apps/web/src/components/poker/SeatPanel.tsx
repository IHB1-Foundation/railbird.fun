"use client";

import { cn, formatChips, shortenAddress, CHIP_SYMBOL, ZERO_ADDRESS } from "@/lib/utils";
import type { HoleCardsResponse } from "@/lib/auth";
import { PokerCard } from "./PokerCard";

/** Minimal seat shape required by SeatPanel — allows placeholder seats without tokenAddress. */
interface SeatShape {
  seatIndex: number;
  ownerAddress: string;
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
      <div className="seat-panel">
        <div className="seat-label">Seat {seat.seatIndex}</div>
        <div className="muted">Empty</div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "seat-panel",
        isActor && "active",
        isOwner && "owner",
        isHandActive && !seat.isActive && "folded"
      )}
    >
      <div className="seat-label">
        <span>Seat {seat.seatIndex}</span>
        {isButton && <span className="dealer-chip">D</span>}
        {isOwner && <span className="you-pill">YOU</span>}
      </div>
      <div className="seat-address" title={seat.ownerAddress}>
        {shortenAddress(seat.ownerAddress)}
      </div>
      <div className="seat-stack">
        {formatChips(seat.stack)} {CHIP_SYMBOL}
      </div>
      <div className={cn("seat-bet", seat.currentBet === "0" && "zero")}>
        <span className="seat-bet-chip" />
        This Round: {formatChips(seat.currentBet)} {CHIP_SYMBOL}
      </div>
      {isActor && <div className="seat-action-badge">ACTING</div>}
      {isActor && turnTimeRemaining !== "--" && (
        <div
          className={cn(
            "seat-turn-timer",
            turnTimeRemaining === "Expired" && "urgent"
          )}
        >
          {turnTimeRemaining}
        </div>
      )}
      {/* Owner's hole cards — only shown to the seat owner */}
      {isOwner && holeCards && (
        <div className="seat-holecards">
          <div className="hole-cards-label">Your Hand</div>
          <div className="hole-cards">
            <PokerCard cardIndex={holeCards.cards[0]} />
            <PokerCard cardIndex={holeCards.cards[1]} />
          </div>
        </div>
      )}
    </div>
  );
}
