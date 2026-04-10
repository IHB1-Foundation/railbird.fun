"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isSoundEnabled } from "./useSound";

const AMBIENT_KEY = "railbird:ambient-enabled";

/** Check if ambient is enabled */
function isAmbientEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(AMBIENT_KEY) === "true";
}

/**
 * G-25: Ambient casino sound hook
 * Low-volume loop that auto-pauses when tab is hidden.
 * Defaults OFF — user must opt in.
 */
export function useAmbientSound(src = "/sounds/ambient-casino.mp3", volume = 0.08) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [enabled, setEnabled] = useState(false);

  // Sync with localStorage on mount
  useEffect(() => {
    setEnabled(isAmbientEnabled() && isSoundEnabled());
  }, []);

  // Pause when tab hidden, resume when visible
  useEffect(() => {
    const handleVisibility = () => {
      const audio = audioRef.current;
      if (!audio) return;
      if (document.hidden) {
        audio.pause();
      } else if (enabled) {
        audio.play().catch(() => {});
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [enabled]);

  // Start/stop based on enabled state
  useEffect(() => {
    if (!enabled) {
      audioRef.current?.pause();
      return;
    }

    if (!audioRef.current) {
      audioRef.current = new Audio(src);
      audioRef.current.loop = true;
      audioRef.current.volume = Math.max(0, Math.min(1, volume));
    }

    if (!document.hidden) {
      audioRef.current.play().catch(() => {});
    }

    return () => {
      audioRef.current?.pause();
    };
  }, [enabled, src, volume]);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    localStorage.setItem(AMBIENT_KEY, String(next));
  }, [enabled]);

  return { enabled, toggle };
}
