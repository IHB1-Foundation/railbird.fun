// Utility functions for the web app

import type { CardInfo } from "./types";

export const CHIP_SYMBOL = process.env.NEXT_PUBLIC_CHIP_SYMBOL || "rCHIP";

// Card conversion (0-51 to display)
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const SUITS = ["s", "h", "d", "c"]; // spades, hearts, diamonds, clubs
const SUIT_SYMBOLS: Record<string, string> = {
  s: "♠",
  h: "♥",
  d: "♦",
  c: "♣",
};

export function cardToInfo(cardIndex: number): CardInfo | null {
  if (cardIndex < 0 || cardIndex > 51 || cardIndex === 255) {
    return null;
  }

  const rank = RANKS[cardIndex % 13];
  const suit = SUITS[Math.floor(cardIndex / 13)];

  return {
    rank,
    suit,
    display: `${rank}${SUIT_SYMBOLS[suit]}`,
  };
}

export function formatCard(cardIndex: number): string {
  const info = cardToInfo(cardIndex);
  return info ? info.display : "??";
}

export function formatCards(cards: number[]): string {
  return cards
    .filter((c) => c !== 255)
    .map(formatCard)
    .join(" ");
}

// Format MON amount (wei to display)
export function formatMon(wei: string | bigint): string {
  const value = typeof wei === "string" ? BigInt(wei) : wei;
  const formatted = Number(value) / 1e18;

  if (formatted >= 1000) {
    return `${(formatted / 1000).toFixed(2)}K`;
  }
  if (formatted >= 1) {
    return formatted.toFixed(2);
  }
  if (formatted >= 0.001) {
    return formatted.toFixed(4);
  }
  return formatted.toFixed(8);
}

export function formatChips(amount: string | bigint): string {
  return formatMon(amount);
}

// Format address for display
export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// Format percentage
export function formatPercent(value: string | number): string {
  const num = typeof value === "string" ? parseFloat(value) : value;
  return `${(num * 100).toFixed(2)}%`;
}

// Format NAV per share
export function formatNavPerShare(value: string): string {
  const num = BigInt(value);
  const formatted = Number(num) / 1e18;
  return formatted.toFixed(6);
}

// Format date/time
export function formatTime(timestamp: string): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatTimeRemaining(deadline: string | null): string {
  if (!deadline) return "--";

  const remaining = new Date(deadline).getTime() - Date.now();
  if (remaining <= 0) return "Expired";

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// Class name helper
export function cn(...classes: (string | undefined | false)[]): string {
  return classes.filter(Boolean).join(" ");
}
