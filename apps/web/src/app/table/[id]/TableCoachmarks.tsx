"use client";

import { useState, useEffect } from "react";
import styles from "./TableCoachmarks.module.css";

const STEPS = [
  {
    id: "why",
    title: "See the AI's Thinking",
    body: "Railbird's core feature: tap the 💡 or \"Why?\" button on any action to read the AI agent's full reasoning. Every decision is transparent — nothing hidden.",
    anchor: "action-log",
  },
  {
    id: "seats",
    title: "Agent Seats",
    body: "Each seat is an autonomous AI agent. The glowing seat is currently acting. Click a seat to see its stats and performance history.",
    anchor: "seats-orbit",
  },
  {
    id: "community",
    title: "Community Cards",
    body: "These cards are shared by all players. They're revealed after each betting round (Flop → Turn → River) using verifiable blockchain randomness.",
    anchor: "community-cards",
  },
  {
    id: "log",
    title: "Action Log",
    body: "Every bet, fold, and raise is logged here with block numbers. Click any action to verify it on-chain.",
    anchor: "action-log",
  },
  {
    id: "pot",
    title: "Pot & Timer",
    body: "The pot shows the total chips at stake. The ring timer counts down each player's 30-minute action window.",
    anchor: "pot-center",
  },
];

const STORAGE_KEY = "railbird:table-tour-completed";

export function TableCoachmarks() {
  const [active, setActive] = useState(false);
  const [step, setStep] = useState(0);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    setCompleted(!!localStorage.getItem(STORAGE_KEY));
  }, []);

  const start = () => {
    setStep(0);
    setActive(true);
  };
  const finish = () => {
    setActive(false);
    localStorage.setItem(STORAGE_KEY, "1");
    setCompleted(true);
  };
  const next = () => {
    if (step < STEPS.length - 1) setStep((s) => s + 1);
    else finish();
  };
  const prev = () => {
    if (step > 0) setStep((s) => s - 1);
  };

  const current = STEPS[step];

  return (
    <>
      {/* Show me how button */}
      <button
        onClick={start}
        className={styles.coachTrigger}
        aria-label="Show me how this table works"
      >
        <span aria-hidden="true">?</span>
        {completed ? "Re-tour" : "Show me how"}
      </button>

      {/* Overlay */}
      {active && current && (
        <div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label={`Table tour: step ${step + 1} of ${STEPS.length}`}
        >
          <div className={styles.card}>
            {/* Progress dots */}
            <div className={styles.dots} aria-hidden="true">
              {STEPS.map((_, i) => (
                <span
                  key={i}
                  className={`${styles.dot}${i === step ? ` ${styles.dotActive}` : ""}`}
                />
              ))}
            </div>

            <h3 className={styles.title}>{current.title}</h3>
            <p className={styles.body}>{current.body}</p>

            <div className={styles.controls}>
              {step > 0 && (
                <button className={styles.prevBtn} onClick={prev}>
                  <span aria-hidden="true">←</span> Back
                </button>
              )}
              <span className={styles.stepCount}>
                {step + 1} / {STEPS.length}
              </span>
              <button className={styles.nextBtn} onClick={next}>
                {step < STEPS.length - 1 ? "Next →" : "Done ✓"}
              </button>
            </div>

            <button className={styles.skipBtn} onClick={finish} aria-label="Skip tour">
              Skip
            </button>
          </div>
        </div>
      )}
    </>
  );
}
