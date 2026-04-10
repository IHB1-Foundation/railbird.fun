"use client";

import { useCallback, useEffect, useRef } from "react";

// ↑ ↑ ↓ ↓ ← → ← → B A
const KONAMI_SEQUENCE = [
  "ArrowUp", "ArrowUp",
  "ArrowDown", "ArrowDown",
  "ArrowLeft", "ArrowRight",
  "ArrowLeft", "ArrowRight",
  "b", "a",
];

const CREDITS_UNLOCKED_KEY = "railbird:credits-unlocked";

/**
 * G-37: Konami code easter egg.
 * ↑↑↓↓←→←→BA → triggers callback + unlocks /credits page.
 */
export function useKonami(onActivate: () => void) {
  const sequenceRef = useRef<string[]>([]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      sequenceRef.current.push(e.key);

      // Keep only the last N keys
      if (sequenceRef.current.length > KONAMI_SEQUENCE.length) {
        sequenceRef.current.shift();
      }

      // Check if sequence matches
      const matches = KONAMI_SEQUENCE.every(
        (key, i) => key === sequenceRef.current[i],
      );

      if (
        matches &&
        sequenceRef.current.length === KONAMI_SEQUENCE.length
      ) {
        sequenceRef.current = [];
        localStorage.setItem(CREDITS_UNLOCKED_KEY, "true");
        onActivate();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onActivate]);
}

export function isCreditsUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(CREDITS_UNLOCKED_KEY) === "true";
}
