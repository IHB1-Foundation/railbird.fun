"use client";

import { useEffect, useRef } from "react";
import styles from "./ChipRain.module.css";

interface ChipRainProps {
  /** Duration in ms (default 9000 = 9s) */
  duration?: number;
  onComplete?: () => void;
}

/**
 * G-37: Konami Easter Egg — chip rain canvas animation.
 */
export function ChipRain({ duration = 9000, onComplete }: ChipRainProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);

    const CHIP_COLORS = [
      ["#ef4444", "#b91c1c"],
      ["#1d4ed8", "#1e40af"],
      ["#16a34a", "#15803d"],
      ["#d97706", "#b45309"],
      ["#a78bfa", "#7c3aed"],
      ["#facc15", "#ca8a04"],
    ];

    interface Chip {
      x: number;
      y: number;
      vx: number;
      vy: number;
      rotation: number;
      rotSpeed: number;
      colorPair: [string, string];
      size: number;
      opacity: number;
    }

    const chips: Chip[] = [];
    const CHIP_COUNT = 80;

    function spawnChip(): Chip {
      const pair = CHIP_COLORS[Math.floor(Math.random() * CHIP_COLORS.length)] as [string, string];
      return {
        x: Math.random() * canvas!.width,
        y: -20,
        vx: (Math.random() - 0.5) * 3,
        vy: Math.random() * 3 + 1.5,
        rotation: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.1,
        colorPair: pair,
        size: Math.random() * 16 + 10,
        opacity: 1,
      };
    }

    for (let i = 0; i < CHIP_COUNT; i++) {
      const chip = spawnChip();
      chip.y = Math.random() * canvas.height; // stagger initial positions
      chips.push(chip);
    }

    function drawChip(chip: Chip) {
      if (!ctx) return;
      ctx.save();
      ctx.globalAlpha = chip.opacity;
      ctx.translate(chip.x, chip.y);
      ctx.rotate(chip.rotation);

      const rx = chip.size;
      const ry = chip.size * 0.28;

      // Chip body (ellipse)
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = chip.colorPair[0];
      ctx.fill();

      // Edge highlight
      ctx.beginPath();
      ctx.ellipse(0, -ry * 0.3, rx * 0.9, ry * 0.4, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.fill();

      // Border
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = chip.colorPair[1];
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.restore();
    }

    let frame: number;
    const startTime = Date.now();
    let spawnTimer = 0;

    function tick() {
      if (!ctx || !canvas) return;
      const now = Date.now();
      const elapsed = now - startTime;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Spawn more chips periodically
      spawnTimer++;
      if (spawnTimer % 8 === 0 && chips.length < 200) {
        chips.push(spawnChip());
      }

      const fadeProgress = Math.max(0, (elapsed - duration * 0.7) / (duration * 0.3));

      for (const chip of chips) {
        chip.x += chip.vx;
        chip.y += chip.vy;
        chip.rotation += chip.rotSpeed;
        chip.vy += 0.05; // slight gravity
        chip.opacity = Math.max(0, 1 - fadeProgress);
        drawChip(chip);

        // Wrap off-screen chips
        if (chip.y > canvas.height + 20) {
          chip.y = -20;
          chip.x = Math.random() * canvas.width;
          chip.vy = Math.random() * 3 + 1.5;
        }
      }

      if (elapsed < duration) {
        frame = requestAnimationFrame(tick);
      } else {
        onComplete?.();
      }
    }

    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resizeCanvas);
    };
  }, [duration, onComplete]);

  return (
    <div className={styles.overlay}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />
      <div className={styles.message}>
        <p className={styles.code}>RAILBIRD://KONAMI</p>
        <h2 className={styles.title}>CHEAT CODE ACTIVATED</h2>
        <p className={styles.subtitle}>/credits unlocked 🎰</p>
      </div>
    </div>
  );
}
