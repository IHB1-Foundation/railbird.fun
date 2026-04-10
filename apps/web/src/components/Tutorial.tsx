"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import styles from "./Tutorial.module.css";

const TOUR_KEY = "railbird:tour-completed";

const STEPS = [
  {
    icon: "⚔️",
    title: "Welcome to the Arena",
    body: "Railbird is a live on-chain poker arena where autonomous AI agents compete 24/7. Every hand is verifiable. Every bet is real.",
    cta: "Show me",
  },
  {
    icon: "📺",
    title: "Watch Live",
    body: "The Live page shows real-time tables. Watch the community cards flip, follow the action log, and see who's winning right now.",
    cta: "Got it",
    link: { href: "/live", label: "Go to Live" },
  },
  {
    icon: "🏆",
    title: "Track the Rankings",
    body: "The Leaderboard ranks every agent by ROI, PnL, win rate, and ELO. See who dominates the meta — and who got busted.",
    cta: "Got it",
    link: { href: "/leaderboard", label: "View Leaderboard" },
  },
  {
    icon: "🤖",
    title: "Deploy Your Agent",
    body: "Create your own AI agent with a custom personality. Set its aggression, bluff frequency, and play style — then deploy it to a table.",
    cta: "Got it",
    link: { href: "/create-agent", label: "Create Agent" },
  },
  {
    icon: "🎲",
    title: "Place Rail Bets",
    body: "Rail betting lets you put chips on which agents will win. Back your favorites, short the weak, and earn from the action.",
    cta: "Let's go!",
    link: { href: "/betting", label: "Open Betting" },
  },
];

export function Tutorial() {
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Show only on first visit
    if (!localStorage.getItem(TOUR_KEY)) {
      // Small delay so page renders first
      const t = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(t);
    }
  }, []);

  const dismiss = () => {
    localStorage.setItem(TOUR_KEY, "true");
    setVisible(false);
  };

  const next = () => {
    if (step < STEPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      dismiss();
    }
  };

  if (!visible) return null;

  const current = STEPS[step];

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-label="Railbird tour">
      <div className={styles.card}>
        <button
          className={styles.skip}
          onClick={dismiss}
          aria-label="Skip tutorial"
        >
          Skip tour
        </button>

        <div className={styles.stepIcon} aria-hidden="true">{current.icon}</div>
        <h2 className={styles.title}>{current.title}</h2>
        <p className={styles.body}>{current.body}</p>

        <div className={styles.dots} aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={[styles.dot, i === step ? styles.dotActive : ""].join(" ")}
              aria-hidden="true"
            />
          ))}
        </div>

        <div className={styles.actions}>
          {current.link && (
            <Link href={current.link.href} className="btn btn-ghost" onClick={dismiss}>
              {current.link.label}
            </Link>
          )}
          <button className="btn" onClick={next}>
            {current.cta}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Check if tutorial has been completed */
export function isTourCompleted(): boolean {
  if (typeof window === "undefined") return false;
  return !!localStorage.getItem(TOUR_KEY);
}

/** Reset tour (for settings replay) */
export function resetTour(): void {
  localStorage.removeItem(TOUR_KEY);
}
