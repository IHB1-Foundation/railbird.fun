"use client";

import { useState, useEffect, useRef } from "react";
import { ACTION_LABELS } from "@/lib/types";
import { formatChips } from "@/lib/utils";
import type { HandResponse, ActionResponse } from "@/lib/types";
import { PokerCard } from "@/components/poker/PokerCard";
import styles from "./HandReplay.module.css";

interface HandReplayProps {
  hand: HandResponse;
  chipSymbol?: string;
}

const STREET_ORDER = ["PREFLOP", "FLOP", "TURN", "RIVER", "SHOWDOWN"];
const SPEED_OPTIONS = [0.5, 1, 2, 4] as const;
type Speed = typeof SPEED_OPTIONS[number];

function streetAtStep(actions: ActionResponse[], stepIndex: number): string {
  let street = "PREFLOP";
  for (let i = 0; i <= stepIndex; i++) {
    const a = actions[i];
    if (a?.endsStreet) {
      const idx = STREET_ORDER.indexOf(street);
      if (idx < STREET_ORDER.length - 1) street = STREET_ORDER[idx + 1];
    }
  }
  return street;
}

function communityCardsAtStep(hand: HandResponse, stepIndex: number): number[] {
  const street = streetAtStep(hand.actions, stepIndex);
  const all = hand.communityCards;
  if (street === "PREFLOP") return [];
  if (street === "FLOP") return all.slice(0, 3);
  if (street === "TURN") return all.slice(0, 4);
  return all;
}

export function HandReplay({ hand, chipSymbol = "RCHIP" }: HandReplayProps) {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [vhsMode, setVhsMode] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = hand.actions.length;
  const currentAction = hand.actions[step];
  const visibleCards = communityCardsAtStep(hand, step);
  const currentStreet = streetAtStep(hand.actions, step);
  const potAtStep = step > 0
    ? formatChips(hand.actions[step - 1]?.potAfter ?? "0")
    : "0";

  // Auto-play loop
  useEffect(() => {
    if (!isPlaying) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }
    const ms = Math.round(1400 / speed);
    intervalRef.current = setInterval(() => {
      setStep((s) => {
        if (s >= total - 1) {
          setIsPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, ms);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, speed, total]);

  const handlePlay = () => {
    if (step >= total - 1) setStep(0);
    setIsPlaying((v) => !v);
  };

  return (
    <div className={`${styles.replayRoot}${vhsMode ? ` ${styles.scanlines}` : ""}`}>
      {/* Header */}
      <div className={styles.replayHeader}>
        <span className={styles.replayTitle}>
          Hand #{hand.handId} — {currentStreet}
        </span>
        <span className={styles.replayTitle}>
          Pot: <strong style={{ color: "var(--foreground)" }}>{potAtStep} {chipSymbol}</strong>
        </span>
        {/* LED step counter */}
        <span className={styles.ledCounter} aria-live="polite" aria-atomic="true">
          {String(step + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
        </span>
      </div>

      <div className={styles.replayBody}>
        {/* Community Cards */}
        <div className={styles.communityRow}>
          {visibleCards.length > 0 ? (
            visibleCards.map((c, i) => <PokerCard key={i} cardIndex={c} />)
          ) : (
            <span style={{ fontSize: "var(--text-xs)", color: "var(--text-muted)" }}>
              No community cards yet
            </span>
          )}
        </div>

        {/* Current Action Highlight */}
        {currentAction && (
          <div className={styles.actionHighlight}>
            <strong>Seat {currentAction.seatIndex}</strong>
            {" — "}
            {ACTION_LABELS[currentAction.actionType] ?? currentAction.actionType}
            {currentAction.amount && currentAction.amount !== "0" && (
              <span style={{ color: "var(--text-gold)", marginLeft: "0.4rem" }}>
                {formatChips(currentAction.amount)} {chipSymbol}
              </span>
            )}
            {currentAction.reasoning && (
              <p className={styles.actionReasoning}>
                {currentAction.reasoning.slice(0, 120)}
                {currentAction.reasoning.length > 120 ? "…" : ""}
              </p>
            )}
          </div>
        )}

        {/* Scrubber */}
        <div className={styles.scrubberWrap}>
          <label htmlFor="hand-replay-scrubber" className="sr-only">
            Action step {step + 1} of {total}
          </label>
          <input
            id="hand-replay-scrubber"
            type="range"
            className={styles.scrubber}
            min={0}
            max={Math.max(0, total - 1)}
            value={step}
            onChange={(e) => { setIsPlaying(false); setStep(Number(e.target.value)); }}
            aria-valuetext={`Action ${step + 1} of ${total}`}
          />
        </div>

        {/* G-38: Arcade controls */}
        <div className={styles.controlsRow} role="toolbar" aria-label="Replay controls">
          {/* ⏮ */}
          <button
            className={styles.arcadeBtn}
            onClick={() => { setIsPlaying(false); setStep(0); }}
            disabled={step === 0}
            aria-label="Go to first action"
          >
            <span aria-hidden="true">⏮</span>
          </button>
          {/* ← */}
          <button
            className={styles.arcadeBtn}
            onClick={() => { setIsPlaying(false); setStep((s) => Math.max(0, s - 1)); }}
            disabled={step === 0}
            aria-label="Previous action"
          >
            <span aria-hidden="true">◀</span>
          </button>

          {/* Play / Pause — red arcade button */}
          <button
            className={`${styles.arcadeBtn} ${styles.playBtn}`}
            onClick={handlePlay}
            aria-label={isPlaying ? "Pause replay" : "Play replay"}
          >
            <span aria-hidden="true">{isPlaying ? "⏸" : "▶"}</span>
          </button>

          {/* → */}
          <button
            className={styles.arcadeBtn}
            onClick={() => { setIsPlaying(false); setStep((s) => Math.min(total - 1, s + 1)); }}
            disabled={step >= total - 1}
            aria-label="Next action"
          >
            <span aria-hidden="true">▶</span>
          </button>
          {/* ⏭ */}
          <button
            className={styles.arcadeBtn}
            onClick={() => { setIsPlaying(false); setStep(total - 1); }}
            disabled={step >= total - 1}
            aria-label="Go to last action"
          >
            <span aria-hidden="true">⏭</span>
          </button>

          {/* Speed selector */}
          <select
            className={styles.speedSelect}
            value={speed}
            onChange={(e) => setSpeed(Number(e.target.value) as Speed)}
            aria-label="Playback speed"
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}x</option>
            ))}
          </select>

          {/* VHS scanline toggle */}
          <button
            className={`${styles.arcadeBtn} ${styles.vhsToggle}${vhsMode ? ` ${styles.active}` : ""}`}
            onClick={() => setVhsMode((v) => !v)}
            aria-pressed={vhsMode}
            aria-label="Toggle VHS scanline overlay"
            title="VHS mode"
          >
            VHS
          </button>
        </div>

        {/* Action log */}
        <div className={styles.actionLog} role="list" aria-label="Action history">
          {hand.actions.map((a, i) => (
            <button
              key={i}
              role="listitem"
              onClick={() => { setIsPlaying(false); setStep(i); }}
              className={`${styles.logItem}${i === step ? ` ${styles.logItemActive}` : ""}`}
              aria-current={i === step ? "true" : undefined}
            >
              <span className={styles.logItemNum}>{i + 1}.</span>
              <span>Seat {a.seatIndex}</span>
              <span>{ACTION_LABELS[a.actionType] ?? a.actionType}</span>
              {a.amount && a.amount !== "0" && (
                <span className={styles.logItemAmount}>{formatChips(a.amount)}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
