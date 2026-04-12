"use client";

import { PersonaRadar } from "@/components/PersonaRadar";
import { PERSONA_PRESETS } from "@/lib/agentProfiles";
import styles from "../page.module.css";
import type { PersonaConfig } from "./types";
import { EMOJI_OPTIONS, COLOR_OPTIONS } from "./types";

interface Props {
  persona: PersonaConfig;
  setPersona: React.Dispatch<React.SetStateAction<PersonaConfig>>;
  nameError: string | null;
  setNameError: (e: string | null) => void;
  applyPreset: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}

const PRESET_NAMES = Object.keys(PERSONA_PRESETS);

const SLIDER_META: Record<string, { low: string; high: string; hint: string }> = {
  Aggression: {
    low: "Passive",
    high: "Aggressive",
    hint: "High = bets and raises often. Low = checks and calls more.",
  },
  Tightness: {
    low: "Loose",
    high: "Tight",
    hint: "High = only plays premium hands. Low = plays many hands.",
  },
  "Bluff Frequency": {
    low: "Honest",
    high: "Bluffer",
    hint: "High = bluffs frequently. Low = rarely bluffs.",
  },
  "Position Awareness": {
    low: "Ignores",
    high: "Position-first",
    hint: "High = plays differently based on table position.",
  },
};

function Slider({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = `slider-${label.toLowerCase().replace(/\s+/g, "-")}`;
  const meta = SLIDER_META[label];
  const step = 0.05;

  const handleMinus = () => onChange(Math.max(0, parseFloat((value - step).toFixed(2))));
  const handlePlus = () => onChange(Math.min(1, parseFloat((value + step).toFixed(2))));

  return (
    <div className={styles.formGroup}>
      <div className={styles.sliderRow}>
        <label htmlFor={id} className={styles.sliderLabel}>
          {label}
        </label>
        {/* UX-11.2: +/- steppers for touch precision */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <button
            type="button"
            onClick={handleMinus}
            aria-label={`Decrease ${label}`}
            style={{
              width: "1.5rem",
              height: "1.5rem",
              borderRadius: "4px",
              border: "1px solid rgba(148,163,184,0.3)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: "0.85rem",
              lineHeight: 1,
            }}
          >
            −
          </button>
          <span className={styles.sliderValue} aria-hidden="true">
            {value.toFixed(2)}
          </span>
          <button
            type="button"
            onClick={handlePlus}
            aria-label={`Increase ${label}`}
            style={{
              width: "1.5rem",
              height: "1.5rem",
              borderRadius: "4px",
              border: "1px solid rgba(148,163,184,0.3)",
              background: "rgba(255,255,255,0.04)",
              color: "var(--muted)",
              cursor: "pointer",
              fontSize: "0.85rem",
              lineHeight: 1,
            }}
          >
            +
          </button>
        </div>
      </div>
      {meta && (
        <p style={{ fontSize: "0.72rem", color: "var(--muted)", margin: "0 0 0.3rem" }}>
          {meta.hint}
        </p>
      )}
      <input
        id={id}
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-valuetext={value.toFixed(2)}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
      {meta && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontSize: "0.68rem",
            color: "var(--muted)",
            marginTop: "0.15rem",
          }}
        >
          <span>{meta.low}</span>
          <span>{meta.high}</span>
        </div>
      )}
    </div>
  );
}

export function StepPersona({
  persona,
  setPersona,
  nameError,
  setNameError,
  applyPreset,
  onBack,
  onNext,
}: Props) {
  return (
    <div className={styles.stepCard} style={{ textAlign: "left" }}>
      <h2 className={styles.stepTitle}>Configure Persona</h2>

      <div className={styles.personaGrid}>
        <div>
          {/* Name */}
          <div className={styles.formGroup}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
            >
              <label htmlFor="agent-name" className={styles.formLabel}>
                Agent Name
              </label>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: persona.name.length >= 20 ? "var(--warning)" : "var(--muted)",
                }}
              >
                {persona.name.length}/24
              </span>
            </div>
            <input
              id="agent-name"
              type="text"
              maxLength={24}
              value={persona.name}
              onChange={(e) => {
                setPersona((p) => ({ ...p, name: e.target.value }));
                setNameError(null);
              }}
              placeholder="e.g. Serpent"
              aria-invalid={!!nameError}
              aria-describedby={nameError ? "name-error" : undefined}
              className={`${styles.formInput}${nameError ? ` ${styles.hasError}` : ""}`}
            />
            {nameError && (
              <p id="name-error" role="alert" className={styles.formError}>
                {nameError}
              </p>
            )}
          </div>

          {/* Presets */}
          <div className={styles.formGroup}>
            <p className={styles.formLabel}>Quick Presets</p>
            <div className={styles.presetRow}>
              {PRESET_NAMES.map((id) => (
                <button key={id} onClick={() => applyPreset(id)} className={styles.presetBtn}>
                  {PERSONA_PRESETS[id].emoji} {id}
                </button>
              ))}
            </div>
          </div>

          {/* Emoji */}
          <div className={styles.formGroup}>
            <p className={styles.formLabel}>Emoji</p>
            <div className={styles.presetRow}>
              {EMOJI_OPTIONS.map((em) => (
                <button
                  key={em}
                  onClick={() => setPersona((p) => ({ ...p, emoji: em }))}
                  className={styles.presetBtn}
                  style={{
                    fontSize: "1.25rem",
                    borderColor: persona.emoji === em ? "var(--accent)" : undefined,
                  }}
                >
                  {em}
                </button>
              ))}
            </div>
          </div>

          {/* Color */}
          <div className={styles.formGroup}>
            <p className={styles.formLabel}>Color Accent</p>
            <div className={styles.colorRow}>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setPersona((p) => ({ ...p, colorAccent: c }))}
                  className={`${styles.colorSwatch}${persona.colorAccent === c ? ` ${styles.selected}` : ""}`}
                  style={{ background: c }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>

          {/* Sliders */}
          <Slider
            label="Aggression"
            value={persona.aggression}
            onChange={(v) => setPersona((p) => ({ ...p, aggression: v }))}
          />
          <Slider
            label="Tightness"
            value={persona.tightness}
            onChange={(v) => setPersona((p) => ({ ...p, tightness: v }))}
          />
          <Slider
            label="Bluff Frequency"
            value={persona.bluffFrequency}
            onChange={(v) => setPersona((p) => ({ ...p, bluffFrequency: v }))}
          />
          <Slider
            label="Position Awareness"
            value={persona.positionAwareness}
            onChange={(v) => setPersona((p) => ({ ...p, positionAwareness: v }))}
          />

          {/* System Prompt */}
          <div className={styles.formGroup}>
            <div
              style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}
            >
              <label htmlFor="system-prompt" className={styles.formLabel}>
                Personality Prompt (optional)
              </label>
              <span
                style={{
                  fontSize: "0.72rem",
                  color: persona.systemPrompt.length >= 160 ? "var(--warning)" : "var(--muted)",
                }}
              >
                {persona.systemPrompt.length}/200
              </span>
            </div>
            <textarea
              id="system-prompt"
              maxLength={200}
              value={persona.systemPrompt}
              onChange={(e) => setPersona((p) => ({ ...p, systemPrompt: e.target.value }))}
              placeholder="e.g. Be mysterious, never reveal your hand strength..."
              rows={3}
              className={styles.formInput}
              style={{ resize: "vertical" }}
            />
          </div>
        </div>

        {/* Radar preview */}
        <div className={styles.radarPreview}>
          <div className={styles.radarCard} style={{ borderColor: `${persona.colorAccent}40` }}>
            <div className={styles.radarEmoji}>{persona.emoji}</div>
            <PersonaRadar
              axes={[
                { label: "Aggr", value: persona.aggression },
                { label: "Tight", value: persona.tightness },
                { label: "Bluff", value: persona.bluffFrequency },
                { label: "Pos", value: persona.positionAwareness },
              ]}
              colorAccent={persona.colorAccent}
              name={persona.name || "Agent"}
              size="large"
            />
            <p className={styles.radarName}>{persona.name || "Unnamed"}</p>
          </div>
        </div>
      </div>

      <div className={styles.btnRow}>
        <button onClick={onBack} className={styles.secondaryBtn}>
          <span aria-hidden="true">←</span> Back
        </button>
        <button onClick={onNext} className={styles.primaryBtn} style={{ flex: 1 }}>
          Select Table
        </button>
      </div>
    </div>
  );
}
