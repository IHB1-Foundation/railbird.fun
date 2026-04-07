"use client";

import { cn } from "@/lib/utils";
import styles from "./PokerCard.module.css";

const CARD_RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const CARD_SUITS = ["s", "h", "d", "c"];
const SUIT_NAMES: Record<string, string> = { s: "spades", h: "hearts", d: "diamonds", c: "clubs" };
const SUIT_SYMBOLS: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };

export function PokerCard({ cardIndex }: { cardIndex: number }) {
  if (cardIndex === 255 || cardIndex < 0 || cardIndex > 51) {
    return <div className={`${styles.pokerCard} ${styles.unknown}`} aria-label="Hidden card">??</div>;
  }

  const rank = CARD_RANKS[cardIndex % 13];
  const suit = CARD_SUITS[Math.floor(cardIndex / 13)];

  return (
    <div
      className={cn(styles.pokerCard, suit === "h" || suit === "d" ? styles.heart : styles.spade)}
      aria-label={`${rank} of ${SUIT_NAMES[suit]}`}
    >
      {rank}{SUIT_SYMBOLS[suit]}
    </div>
  );
}
