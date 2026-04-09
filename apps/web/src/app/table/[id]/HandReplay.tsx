"use client";

import { useState } from "react";
import { ACTION_LABELS } from "@/lib/types";
import { formatChips } from "@/lib/utils";
import type { HandResponse, ActionResponse } from "@/lib/types";
import { PokerCard } from "@/components/poker/PokerCard";

interface HandReplayProps {
  hand: HandResponse;
  chipSymbol?: string;
}

const STREET_ORDER = ["PREFLOP", "FLOP", "TURN", "RIVER", "SHOWDOWN"];

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
  const total = hand.actions.length;
  const currentAction = hand.actions[step];
  const visibleCards = communityCardsAtStep(hand, step);
  const currentStreet = streetAtStep(hand.actions, step);

  const potAtStep = step > 0
    ? formatChips(hand.actions[step - 1]?.potAfter ?? "0")
    : "0";

  return (
    <div style={{ padding: "1rem", background: "rgba(255,255,255,0.02)", borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
          Hand #{hand.handId} — {currentStreet}
        </span>
        <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
          Pot: <strong style={{ color: "var(--foreground)" }}>{potAtStep} {chipSymbol}</strong>
        </span>
      </div>

      {/* Community Cards */}
      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginBottom: "0.75rem", minHeight: "3rem", alignItems: "center" }}>
        {visibleCards.length > 0 ? (
          visibleCards.map((c, i) => <PokerCard key={i} cardIndex={c} />)
        ) : (
          <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>No community cards yet</span>
        )}
      </div>

      {/* Current Action Highlight */}
      {currentAction && (
        <div style={{
          background: "rgba(129,108,249,0.12)", border: "1px solid rgba(129,108,249,0.3)",
          borderRadius: "var(--radius-sm)", padding: "0.5rem 0.75rem", marginBottom: "0.75rem",
          fontSize: "0.82rem",
        }}>
          <strong>Seat {currentAction.seatIndex}</strong>
          {" — "}
          {ACTION_LABELS[currentAction.actionType] ?? currentAction.actionType}
          {currentAction.amount && currentAction.amount !== "0" && (
            <span style={{ color: "var(--text-gold)", marginLeft: "0.4rem" }}>
              {formatChips(currentAction.amount)} {chipSymbol}
            </span>
          )}
          {currentAction.reasoning && (
            <p style={{ fontSize: "0.72rem", color: "var(--muted)", marginTop: "0.25rem", fontStyle: "italic" }}>
              {currentAction.reasoning.slice(0, 120)}{currentAction.reasoning.length > 120 ? "…" : ""}
            </p>
          )}
        </div>
      )}

      {/* Scrubber */}
      <div style={{ marginBottom: "0.5rem" }}>
        <label htmlFor="hand-replay-scrubber" className="sr-only">Action step {step + 1} of {total}</label>
        <input
          id="hand-replay-scrubber"
          type="range"
          min={0}
          max={Math.max(0, total - 1)}
          value={step}
          onChange={(e) => setStep(Number(e.target.value))}
          style={{ width: "100%", accentColor: "var(--accent)" }}
          aria-valuetext={`Action ${step + 1} of ${total}`}
        />
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", minHeight: 0 }}
          onClick={() => setStep(0)}
          disabled={step === 0}
          aria-label="Go to first action"
        >
          <span aria-hidden="true">⏮</span>
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", minHeight: 0 }}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          aria-label="Previous action"
        >
          <span aria-hidden="true">←</span>
        </button>
        <span style={{ flex: 1, textAlign: "center", fontSize: "0.72rem", color: "var(--muted)" }}>
          Action {step + 1} / {total}
        </span>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", minHeight: 0 }}
          onClick={() => setStep((s) => Math.min(total - 1, s + 1))}
          disabled={step >= total - 1}
          aria-label="Next action"
        >
          <span aria-hidden="true">→</span>
        </button>
        <button
          className="btn btn-ghost"
          style={{ fontSize: "0.75rem", padding: "0.25rem 0.6rem", minHeight: 0 }}
          onClick={() => setStep(total - 1)}
          disabled={step >= total - 1}
          aria-label="Go to last action"
        >
          <span aria-hidden="true">⏭</span>
        </button>
      </div>

      {/* Action log */}
      <div style={{ marginTop: "0.75rem", maxHeight: "140px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.2rem" }}>
        {hand.actions.map((a, i) => (
          <button
            key={i}
            onClick={() => setStep(i)}
            style={{
              display: "flex", gap: "0.5rem", alignItems: "center",
              padding: "0.2rem 0.4rem", borderRadius: "4px",
              background: i === step ? "rgba(129,108,249,0.15)" : "transparent",
              border: "none", cursor: "pointer", textAlign: "left", width: "100%",
              fontSize: "0.72rem", color: i === step ? "var(--foreground)" : "var(--muted)",
            }}
          >
            <span style={{ minWidth: "20px", opacity: 0.5 }}>{i + 1}.</span>
            <span>Seat {a.seatIndex}</span>
            <span>{ACTION_LABELS[a.actionType] ?? a.actionType}</span>
            {a.amount && a.amount !== "0" && (
              <span style={{ color: "var(--text-gold)", marginLeft: "auto" }}>{formatChips(a.amount)}</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
