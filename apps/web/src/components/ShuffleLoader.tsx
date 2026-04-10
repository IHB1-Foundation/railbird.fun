"use client";

import styles from "./ShuffleLoader.module.css";

interface ShuffleLoaderProps {
  message?: string;
}

/**
 * G-36: Card shuffle loader — CSS-only deck riffle animation.
 * Used at top-level page loading (loading.tsx routes).
 */
export function ShuffleLoader({ message = "Dealing the cards..." }: ShuffleLoaderProps) {
  const CARDS = ["A♠", "K♥", "Q♦", "J♣", "10♠"];

  return (
    <div className={styles.root} role="status" aria-label={message}>
      <div className={styles.deck} aria-hidden="true">
        {CARDS.map((label, i) => (
          <div
            key={i}
            className={styles.card}
            style={{ "--card-index": i } as React.CSSProperties}
          >
            <span className={styles.cardLabel}>{label}</span>
          </div>
        ))}
      </div>
      <p className={styles.message}>{message}</p>
    </div>
  );
}
