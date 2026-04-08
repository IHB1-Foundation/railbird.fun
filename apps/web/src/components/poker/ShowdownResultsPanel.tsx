"use client";

import { useState, useEffect } from "react";
import { cn, formatChips, shortenAddress, CHIP_SYMBOL, ZERO_ADDRESS } from "@/lib/utils";
import { getAgentProfile } from "@/lib/agentProfiles";
import type { TableResponse } from "@/lib/types";
import type { RevealedHolecardResponse } from "@/lib/api";
import { PokerCard } from "./PokerCard";

// ─── Hand evaluator ───────────────────────────────────────────────────────────

const HAND_RANK_NAMES = [
  "High Card",
  "One Pair",
  "Two Pair",
  "Three of a Kind",
  "Straight",
  "Flush",
  "Full House",
  "Four of a Kind",
  "Straight Flush",
  "Royal Flush",
];

function getCardRank(cardIndex: number): number {
  return cardIndex % 13;
}

function getCardSuit(cardIndex: number): number {
  return Math.floor(cardIndex / 13);
}

export function evaluateHandRank(
  holeCards: [number, number],
  communityCards: number[]
): string {
  const allCards = [...holeCards, ...communityCards.filter((c) => c !== 255)];
  if (allCards.length < 5) return "Incomplete Hand";

  const ranks = allCards.map(getCardRank).sort((a, b) => b - a);
  const suits = allCards.map(getCardSuit);

  const rankCounts: Record<number, number> = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r] ?? 0) + 1;
  const counts = Object.values(rankCounts).sort((a, b) => b - a);

  const isFlush = suits.some((s) => suits.filter((x) => x === s).length >= 5);

  const uniqueRanks = [...new Set(ranks)].sort((a, b) => b - a);
  let isStraight = false;
  for (let i = 0; i <= uniqueRanks.length - 5; i++) {
    if (uniqueRanks[i] - uniqueRanks[i + 4] === 4) {
      isStraight = true;
      break;
    }
  }
  // Ace-low straight: A,2,3,4,5
  if (
    !isStraight &&
    uniqueRanks.includes(12) &&
    uniqueRanks.includes(0) &&
    uniqueRanks.includes(1) &&
    uniqueRanks.includes(2) &&
    uniqueRanks.includes(3)
  ) {
    isStraight = true;
  }

  if (isFlush && isStraight) {
    return uniqueRanks[0] === 12 && uniqueRanks[1] === 11
      ? HAND_RANK_NAMES[9]
      : HAND_RANK_NAMES[8];
  }
  if (counts[0] === 4) return HAND_RANK_NAMES[7];
  if (counts[0] === 3 && counts[1] === 2) return HAND_RANK_NAMES[6];
  if (isFlush) return HAND_RANK_NAMES[5];
  if (isStraight) return HAND_RANK_NAMES[4];
  if (counts[0] === 3) return HAND_RANK_NAMES[3];
  if (counts[0] === 2 && counts[1] === 2) return HAND_RANK_NAMES[2];
  if (counts[0] === 2) return HAND_RANK_NAMES[1];
  return HAND_RANK_NAMES[0];
}

// ─── ShowdownResultsPanel ─────────────────────────────────────────────────────

interface ShowdownResultsPanelProps {
  revealedHolecards: RevealedHolecardResponse[];
  communityCards: number[];
  winnerSeat: number | null;
  pot: string;
  seats: TableResponse["seats"];
}

export function ShowdownResultsPanel({
  revealedHolecards,
  communityCards,
  winnerSeat,
  pot,
  seats,
}: ShowdownResultsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const seatMap = new Map(seats.map((s) => [s.seatIndex, s]));

  // Auto-collapse after 30 seconds
  useEffect(() => {
    const timer = setTimeout(() => setCollapsed(true), 30_000);
    return () => clearTimeout(timer);
  }, []);

  const winnerAnnouncement = (() => {
    if (winnerSeat === null) return "";
    const winnerSeatData = seatMap.get(winnerSeat);
    const winnerProfile = winnerSeatData
      ? getAgentProfile(winnerSeatData.operatorAddress) || getAgentProfile(winnerSeatData.ownerAddress)
      : null;
    const name = winnerProfile ? winnerProfile.name : `Seat ${winnerSeat}`;
    const winnerHand = revealedHolecards.find((h) => h.seatIndex === winnerSeat);
    const handRank = winnerHand ? evaluateHandRank([winnerHand.card1, winnerHand.card2], communityCards) : "";
    return `${name} wins ${formatChips(pot)} chips${handRank ? ` with ${handRank}` : ""}`;
  })();

  return (
    <div className="card section-card">
      <div
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={{ position: "absolute", width: "1px", height: "1px", padding: 0, margin: "-1px", overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap", border: 0 }}
      >
        {winnerAnnouncement}
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
        <h3 className="section-title-sm">Showdown</h3>
        <button
          onClick={() => setCollapsed((v) => !v)}
          style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: "0.8rem", padding: "0.2rem 0.4rem" }}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand showdown results" : "Collapse showdown results"}
        >
          {collapsed ? "▼ Expand" : "▲ Collapse"}
        </button>
      </div>

      {collapsed ? (
        /* Collapsed summary */
        <div style={{ fontSize: "0.85rem", color: "var(--muted)", paddingTop: "0.25rem" }}>
          {winnerAnnouncement || "Showdown complete"}
        </div>
      ) : (
        <>
          {winnerSeat !== null && (() => {
            const winnerSeatData = seatMap.get(winnerSeat);
            const winnerProfile = winnerSeatData
              ? getAgentProfile(winnerSeatData.operatorAddress) || getAgentProfile(winnerSeatData.ownerAddress)
              : null;
            return (
              <div className="showdown-winner-banner">
                Winner: {winnerProfile ? winnerProfile.name : `Seat ${winnerSeat}`} — {formatChips(pot)} {CHIP_SYMBOL}
              </div>
            );
          })()}
          <div className="showdown-grid">
            {revealedHolecards.map((h) => {
              const isWinner = winnerSeat === h.seatIndex;
              const handRank = evaluateHandRank([h.card1, h.card2], communityCards);
              const seat = seatMap.get(h.seatIndex);
              const seatProfile = seat
                ? getAgentProfile(seat.operatorAddress) || getAgentProfile(seat.ownerAddress)
                : null;

              return (
                <div
                  key={h.seatIndex}
                  className={cn(
                    "showdown-seat-card",
                    isWinner && "showdown-winner"
                  )}
                >
                  <div className="showdown-seat-header">
                    <span className="showdown-seat-label">
                      {seatProfile ? seatProfile.name : `Seat ${h.seatIndex}`}
                    </span>
                    {isWinner && (
                      <span className="showdown-winner-badge">Winner</span>
                    )}
                  </div>
                  {seat &&
                    seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS &&
                    !seatProfile && (
                      <div className="showdown-owner">
                        {shortenAddress(seat.ownerAddress)}
                      </div>
                    )}
                  <div className="hole-cards">
                    <PokerCard cardIndex={h.card1} />
                    <PokerCard cardIndex={h.card2} />
                  </div>
                  <div className="showdown-hand-rank">{handRank}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
