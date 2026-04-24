"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * G-24: Sound design hook
 * All sounds default OFF (opt-in). User toggle stored in localStorage.
 * Sound files expected at /sounds/{name}.mp3
 */

export type SoundName =
  | "chip-place"
  | "chip-stack"
  | "card-flip"
  | "card-deal"
  | "fold"
  | "raise"
  | "check"
  | "win-small"
  | "win-big"
  | "jackpot"
  | "lose"
  | "bell"
  | "notification"
  | "ui-click";

const SOUND_FILES: Record<SoundName, string> = {
  "chip-place": "/sounds/chip-place.mp3",
  "chip-stack": "/sounds/chip-stack.mp3",
  "card-flip": "/sounds/card-flip.mp3",
  "card-deal": "/sounds/card-deal.mp3",
  fold: "/sounds/fold.mp3",
  raise: "/sounds/raise.mp3",
  check: "/sounds/check.mp3",
  "win-small": "/sounds/win-small.mp3",
  "win-big": "/sounds/win-big.mp3",
  jackpot: "/sounds/jackpot.mp3",
  lose: "/sounds/lose.mp3",
  bell: "/sounds/bell.mp3",
  notification: "/sounds/notification.mp3",
  "ui-click": "/sounds/ui-click.mp3",
};

const STORAGE_KEY = "railbird:sound-enabled";

/** Check if sound is currently enabled */
export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "true";
}

/** Toggle sound on/off */
export function toggleSound(enabled?: boolean): boolean {
  const next = enabled !== undefined ? enabled : !isSoundEnabled();
  localStorage.setItem(STORAGE_KEY, String(next));
  window.dispatchEvent(new CustomEvent("railbird:sound-toggle", { detail: { enabled: next } }));
  return next;
}

/**
 * useSound — returns a play() function for a given sound.
 * Sounds are only loaded on first play (lazy).
 */
export function useSound(name: SoundName, volume = 0.6) {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const play = useCallback(() => {
    if (!isSoundEnabled()) return;

    const url = SOUND_FILES[name];
    if (!url) return;

    // Lazy-create audio element
    if (!audioRef.current) {
      audioRef.current = new Audio(url);
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
      audioRef.current.preload = "auto";
    }

    // Reset and play
    const audio = audioRef.current;
    audio.currentTime = 0;
    audio.play().catch(() => {
      // Autoplay policy — silently ignore
    });
  }, [name, volume]);

  return { play };
}

/**
 * useSoundMulti — returns a play() function that picks from multiple sounds
 * randomly (avoids repetitive sound).
 */
export function useSoundMulti(names: SoundName[], volume = 0.6) {
  const play = useCallback(() => {
    if (!isSoundEnabled()) return;
    const name = names[Math.floor(Math.random() * names.length)];
    const url = SOUND_FILES[name];
    if (!url) return;
    const audio = new Audio(url);
    audio.volume = Math.max(0, Math.min(1, volume));
    audio.play().catch(() => {});
  }, [names, volume]);

  return { play };
}
