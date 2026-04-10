"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CelebrationOverlay.module.css";

interface CelebrationOverlayProps {
  /** Winner display name */
  winnerName: string;
  /** Pot amount */
  potAmount?: number;
  /** Format pot amount */
  formatAmount?: (n: number) => string;
  /** Is this a "jackpot" win (all-in, big pot)? */
  isJackpot?: boolean;
  /** Consecutive wins for combo counter */
  streak?: number;
  /** Called when animation ends */
  onComplete?: () => void;
}

/**
 * G-23: Full-screen winner celebration overlay with canvas confetti.
 */
export function CelebrationOverlay({
  winnerName,
  potAmount,
  formatAmount,
  isJackpot = false,
  streak = 0,
  onComplete,
}: CelebrationOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Respect reduced motion
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) {
      const timer = setTimeout(() => {
        setVisible(false);
        onComplete?.();
      }, 1800);
      return () => clearTimeout(timer);
    }

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const COLORS = isJackpot
      ? ["#facc15", "#fbbf24", "#f59e0b", "#ef4444", "#a78bfa", "#22d3ee"]
      : ["#facc15", "#a78bfa", "#22d3ee", "#a3e635", "#f472b6"];

    interface Particle {
      x: number;
      y: number;
      vx: number;
      vy: number;
      color: string;
      size: number;
      rotation: number;
      rotationSpeed: number;
      shape: "rect" | "circle";
      opacity: number;
    }

    const particles: Particle[] = [];
    const count = isJackpot ? 160 : 80;

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: canvas.height * 0.3 * Math.random() - 40,
        vx: (Math.random() - 0.5) * 6,
        vy: Math.random() * 4 + 2,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        size: Math.random() * 8 + 4,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.2,
        shape: Math.random() > 0.5 ? "rect" : "circle",
        opacity: 1,
      });
    }

    let startTime: number | null = null;
    const duration = isJackpot ? 3500 : 2500;
    let frame: number;

    function draw(timestamp: number) {
      if (!ctx || !canvas) return;
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = elapsed / duration;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.12; // gravity
        p.rotation += p.rotationSpeed;
        p.opacity = Math.max(0, 1 - (progress - 0.5) * 2);

        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);

        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        }
        ctx.restore();
      }

      if (elapsed < duration) {
        frame = requestAnimationFrame(draw);
      } else {
        setVisible(false);
        onComplete?.();
      }
    }

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [isJackpot, onComplete]);

  if (!visible) return null;

  const potDisplay = potAmount
    ? formatAmount
      ? formatAmount(potAmount)
      : potAmount.toLocaleString()
    : null;

  return (
    <div className={styles.overlay} aria-live="assertive" role="alert">
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <div className={[styles.content, isJackpot ? styles.jackpot : ""].filter(Boolean).join(" ")}>
        <p className={styles.winnerLabel}>WINNER</p>
        <h2 className={styles.winnerName}>{winnerName}</h2>
        {potDisplay && (
          <p className={styles.potAmount}>
            {potDisplay} <span className={styles.chipLabel}>RCHIP</span>
          </p>
        )}
        {streak >= 2 && (
          <div className={styles.streak}>
            <span className={styles.streakFire}>🔥</span>
            <span className={styles.streakCount}>{streak}x Streak</span>
          </div>
        )}
        {isJackpot && (
          <div className={styles.jackpotBanner}>🎰 JACKPOT 🎰</div>
        )}
      </div>
    </div>
  );
}
