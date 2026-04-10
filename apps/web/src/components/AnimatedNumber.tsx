"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./AnimatedNumber.module.css";

interface AnimatedNumberProps {
  /** Target value to animate to */
  value: number;
  /** Animation duration in ms (default 600) */
  duration?: number;
  /** Number of decimal places to display (default 0) */
  decimals?: number;
  /** Prefix string (e.g. "$") */
  prefix?: string;
  /** Suffix string (e.g. " RCHIP") */
  suffix?: string;
  /** CSS class name for the container */
  className?: string;
}

/**
 * G-22: AnimatedNumber — counts up/down with lime/crimson flash on change.
 * Uses requestAnimationFrame, no external library.
 * Respects prefers-reduced-motion.
 */
export function AnimatedNumber({
  value,
  duration = 600,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: AnimatedNumberProps) {
  const prevRef = useRef<number>(value);
  const frameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  const [displayValue, setDisplayValue] = useState(value);
  const [flashClass, setFlashClass] = useState<string>("");

  const prefersReduced =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  useEffect(() => {
    const from = prevRef.current;
    const to = value;

    if (from === to) return;

    // Flash color
    const delta = to - from;
    const pct = Math.abs(delta) / (Math.abs(from) || 1);
    setFlashClass(delta > 0 ? styles.flashUp : styles.flashDown);
    const flashTimeout = setTimeout(() => setFlashClass(""), 500);

    if (prefersReduced) {
      setDisplayValue(to);
      prevRef.current = to;
      return () => clearTimeout(flashTimeout);
    }

    // Animate
    startTimeRef.current = null;
    const largeDelta = pct >= 0.2;

    function tick(timestamp: number) {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const t = Math.min(elapsed / duration, 1);
      // easeOutQuart
      const eased = 1 - Math.pow(1 - t, 4);
      const current = from + (to - from) * eased;

      setDisplayValue(current);

      if (largeDelta && t >= 0.5 && t < 0.55) {
        // brief scale bounce at midpoint handled by CSS
      }

      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplayValue(to);
        prevRef.current = to;
      }
    }

    frameRef.current = requestAnimationFrame(tick);
    prevRef.current = to;

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      clearTimeout(flashTimeout);
    };
  }, [value, duration, prefersReduced]);

  const formatted = displayValue.toFixed(decimals);
  const isLargeDelta = Math.abs(value - prevRef.current) / (Math.abs(prevRef.current) || 1) >= 0.2;

  return (
    <span
      className={[styles.root, flashClass, isLargeDelta ? styles.bounce : "", className]
        .filter(Boolean)
        .join(" ")}
      aria-live="polite"
      aria-atomic="true"
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
