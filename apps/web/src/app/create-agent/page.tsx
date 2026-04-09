"use client";

import { useState, useEffect, useCallback } from "react";
import { WalletButton } from "@/components/WalletButton";
import { useAuth } from "@/lib/auth";
import { PERSONA_PRESETS } from "@/lib/agentProfiles";
import { getTables } from "@/lib/api";
import { ZERO_ADDRESS } from "@/lib/utils";
import { Breadcrumb } from "@/components/Breadcrumb";
import { PersonaRadar } from "@/components/PersonaRadar";
import styles from "./page.module.css";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PersonaConfig {
  name: string;
  emoji: string;
  colorAccent: string;
  aggression: number;
  tightness: number;
  bluffFrequency: number;
  positionAwareness: number;
  systemPrompt: string;
}

interface TableInfo {
  tableId: string;
  address: string;
  smallBlind: string;
  bigBlind: string;
  activePlayers: number;
  emptySeats: number;
  state: string;
}

type DeployStatus = "idle" | "registering" | "seating" | "starting" | "live" | "error";

// ─── Constants ────────────────────────────────────────────────────────────────

const EMOJI_OPTIONS = ["🦈", "🔥", "🪨", "🧠", "🐺", "🦊", "🐻", "🦅", "🐍", "🎯"];
const COLOR_OPTIONS = [
  "#3B82F6", "#EF4444", "#6B7280", "#8B5CF6",
  "#10B981", "#F59E0B", "#EC4899", "#06B6D4",
];

const PRESET_NAMES = Object.keys(PERSONA_PRESETS);

const DEFAULT_PERSONA: PersonaConfig = {
  name: "",
  emoji: "🤖",
  colorAccent: "#3B82F6",
  aggression: 0.5,
  tightness: 0.5,
  bluffFrequency: 0.3,
  positionAwareness: 0.7,
  systemPrompt: "",
};

const TABLE_MAX_SEATS = Number(process.env.NEXT_PUBLIC_TABLE_MAX_SEATS || "9");

// ─── Sub-components ───────────────────────────────────────────────────────────

// D-20: RadarPreview replaced by shared PersonaRadar component
function RadarPreview({ persona }: { persona: PersonaConfig }) {
  return (
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
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = `slider-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className={styles.formGroup}>
      <div className={styles.sliderRow}>
        <label htmlFor={id} className={styles.sliderLabel}>{label}</label>
        <span className={styles.sliderValue} aria-hidden="true">{value.toFixed(2)}</span>
      </div>
      <input
        id={id}
        type="range" min={0} max={1} step={0.01} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        aria-valuetext={value.toFixed(2)}
        style={{ width: "100%", accentColor: "var(--accent)" }}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CreateAgentPage() {
  const { address, isConnected } = useAuth();
  const [step, setStep] = useState(1);
  const [persona, setPersona] = useState<PersonaConfig>(DEFAULT_PERSONA);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [deployStatus, setDeployStatus] = useState<DeployStatus>("idle");
  const [deployedAgentId, setDeployedAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Fetch tables for step 3
  useEffect(() => {
    if (step === 3) {
      getTables()
        .then((data) => {
          const tableList = data.map((table) => {
            const activePlayers = table.seats.filter(
              (seat) => seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS
            ).length;
            const emptySeats = Math.max(TABLE_MAX_SEATS - activePlayers, 0);
            return {
              tableId: table.tableId,
              address: table.contractAddress,
              smallBlind: table.smallBlind,
              bigBlind: table.bigBlind,
              activePlayers,
              emptySeats,
              state: table.gameState,
            } satisfies TableInfo;
          });
          setTables(tableList);
          if (tableList.length > 0 && !selectedTable) {
            const firstOpenTable = tableList.find((table) => table.emptySeats > 0) ?? tableList[0];
            setSelectedTable(firstOpenTable.address);
          }
        })
        .catch(() => {
          setError("Failed to load tables. Check that the indexer is available.");
        });
    }
  }, [step, selectedTable]);

  const applyPreset = useCallback((presetId: string) => {
    const preset = PERSONA_PRESETS[presetId];
    if (!preset) return;
    setPersona((prev) => ({
      ...prev,
      emoji: preset.emoji,
      colorAccent: preset.colorAccent,
      aggression: preset.aggression,
      tightness: preset.tightness,
      bluffFrequency: preset.bluffFrequency,
      positionAwareness: 0.7,
      systemPrompt: preset.description,
    }));
  }, []);

  const handleDeploy = async () => {
    if (!selectedTable || !address || !persona.name.trim()) return;
    setDeployStatus("registering");
    setError(null);

    const fleetUrl = process.env.NEXT_PUBLIC_FLEET_URL;
    if (!fleetUrl) {
      setError("Fleet service URL is not configured (NEXT_PUBLIC_FLEET_URL). Contact the operator.");
      setDeployStatus("error");
      return;
    }
    try {
      setDeployStatus("seating");
      await new Promise((r) => setTimeout(r, 800));
      setDeployStatus("starting");

      const res = await fetch(`${fleetUrl}/fleet/agents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerAddress: address,
          tableAddress: selectedTable,
          personaConfig: {
            name: persona.name.trim(),
            emoji: persona.emoji,
            colorAccent: persona.colorAccent,
            aggression: persona.aggression,
            tightness: persona.tightness,
            bluffFrequency: persona.bluffFrequency,
            positionAwareness: persona.positionAwareness,
          },
          systemPrompt: persona.systemPrompt || undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { agentId: string };
      setDeployedAgentId(data.agentId);
      setDeployStatus("live");
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
      setDeployStatus("error");
    }
  };

  // ─── Step rendering ──────────────────────────────────────────────────────

  return (
    <div className={styles.pageWrapper}>
      <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Create Agent" }]} />
      <h1 className={styles.pageTitle}>Create Your AI Agent</h1>
      <p className={`muted ${styles.pageSubtitle}`}>
        Deploy a custom poker-playing AI agent to compete on-chain.
      </p>

      {/* Progress */}
      <div className={styles.progressTrack}>
        {["Wallet", "Persona", "Table", "Deploy"].map((label, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div
              className={styles.progressBar}
              style={{
                background: step >= i + 1 ? "var(--accent)" : "var(--border-default)",
                opacity: step >= i + 1 ? 1 : 0.35,
              }}
            />
            <p className={`${styles.progressLabel} ${step >= i + 1 ? "" : "muted"}`}>{label}</p>
          </div>
        ))}
      </div>

      {/* ── Step 1: Connect Wallet ──────────────────────────────────────── */}
      {step === 1 && (
        <div className={styles.stepCard}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔗</div>
          <h2 className={styles.stepTitle}>Connect Your Wallet</h2>
          <p className={`muted ${styles.stepSubtitle}`}>
            Your wallet identifies you as the agent owner. You control which table the agent plays on.
          </p>
          {isConnected ? (
            <div>
              <p style={{ color: "var(--success)", marginBottom: "1rem" }}>
                ✓ Connected: {address?.slice(0, 6)}…{address?.slice(-4)}
              </p>
              <button onClick={() => setStep(2)} className={styles.primaryBtn}>
                Configure Persona
              </button>
            </div>
          ) : (
            <WalletButton />
          )}
        </div>
      )}

      {/* ── Step 2: Persona Config ─────────────────────────────────────── */}
      {step === 2 && (
        <div className={styles.stepCard} style={{ textAlign: "left" }}>
          <h2 className={styles.stepTitle}>Configure Persona</h2>

          <div className={styles.personaGrid}>
            <div>
              {/* Name */}
              <div className={styles.formGroup}>
                <label htmlFor="agent-name" className={styles.formLabel}>
                  Agent Name (1–24 chars)
                </label>
                <input
                  id="agent-name"
                  type="text" maxLength={24} value={persona.name}
                  onChange={(e) => { setPersona((p) => ({ ...p, name: e.target.value })); setNameError(null); }}
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
                      style={{ fontSize: "1.25rem", borderColor: persona.emoji === em ? "var(--accent)" : undefined }}
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

              {/* Strategy Sliders */}
              <Slider label="Aggression" value={persona.aggression} onChange={(v) => setPersona((p) => ({ ...p, aggression: v }))} />
              <Slider label="Tightness" value={persona.tightness} onChange={(v) => setPersona((p) => ({ ...p, tightness: v }))} />
              <Slider label="Bluff Frequency" value={persona.bluffFrequency} onChange={(v) => setPersona((p) => ({ ...p, bluffFrequency: v }))} />
              <Slider label="Position Awareness" value={persona.positionAwareness} onChange={(v) => setPersona((p) => ({ ...p, positionAwareness: v }))} />

              {/* Optional system prompt */}
              <div className={styles.formGroup}>
                <label htmlFor="system-prompt" className={styles.formLabel}>
                  Personality Prompt (optional, max 200 chars)
                </label>
                <textarea
                  id="system-prompt"
                  maxLength={200} value={persona.systemPrompt}
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
                <RadarPreview persona={persona} />
                <p className={styles.radarName}>{persona.name || "Unnamed"}</p>
              </div>
            </div>
          </div>

          <div className={styles.btnRow}>
            <button onClick={() => setStep(1)} className={styles.secondaryBtn}>
              <span aria-hidden="true">←</span> Back
            </button>
            <button
              onClick={() => {
                if (!persona.name.trim()) {
                  setNameError("Agent name is required (1–24 characters).");
                  return;
                }
                setStep(3);
              }}
              className={styles.primaryBtn}
              style={{ flex: 1 }}
            >
              Select Table
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Select Table ──────────────────────────────────────── */}
      {step === 3 && (
        <div className={styles.stepCard} style={{ textAlign: "left" }}>
          <h2 className={styles.stepTitle}>Select Table</h2>

          {tables.length === 0 ? (
            <p className="muted">Loading tables…</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {tables.map((table) => (
                <button
                  key={table.address}
                  onClick={() => setSelectedTable(table.address)}
                  disabled={table.emptySeats === 0}
                  className={`${styles.tableOption}${selectedTable === table.address ? ` ${styles.selected}` : ""}`}
                >
                  <div className={styles.tableOptionRow}>
                    <div>
                      <p className={styles.tableAddress}>{table.address.slice(0, 10)}…</p>
                      <p className={styles.tableMeta}>
                        Blinds: {table.smallBlind}/{table.bigBlind} RCHIP · {table.activePlayers} seated · {table.emptySeats} open
                      </p>
                    </div>
                    {table.emptySeats > 0 ? (
                      <span className={`${styles.badge} ${styles.open}`}>Open</span>
                    ) : (
                      <span className={`${styles.badge} ${styles.full}`}>Full</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div className={styles.btnRow}>
            <button onClick={() => setStep(2)} className={styles.secondaryBtn}>
              <span aria-hidden="true">←</span> Back
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!selectedTable || !tables.some((table) => table.address === selectedTable && table.emptySeats > 0)}
              className={styles.primaryBtn}
              style={{ flex: 1 }}
            >
              Deploy Agent
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Fund & Deploy ─────────────────────────────────────── */}
      {step === 4 && (
        <div className={styles.stepCard} style={{ textAlign: "left" }}>
          <h2 className={styles.stepTitle}>Fund & Deploy</h2>

          {/* Summary card */}
          <div className={styles.summaryCard}>
            <div className={styles.summaryAgentRow}>
              <span className={styles.summaryEmoji}>{persona.emoji}</span>
              <div>
                <p className={styles.summaryName}>{persona.name}</p>
                <p className={styles.summaryStats}>
                  Aggr {persona.aggression.toFixed(2)} · Tight {persona.tightness.toFixed(2)} · Bluff {persona.bluffFrequency.toFixed(2)}
                </p>
              </div>
            </div>
            <div className={styles.statsGrid}>
              <div>
                <span className="muted">Table</span>
                <p>{selectedTable.slice(0, 10)}…</p>
              </div>
              <div>
                <span className="muted">Buy-in (est.)</span>
                <p>1,000 RCHIP</p>
              </div>
            </div>
          </div>

          {error && (
            <div className={styles.errorAlert}>{error}</div>
          )}

          {deployStatus !== "idle" && deployStatus !== "error" && deployStatus !== "live" && (
            <div className={styles.progressAlert}>
              {deployStatus === "registering" && "⏳ Registering agent…"}
              {deployStatus === "seating" && "🎯 Seating at table…"}
              {deployStatus === "starting" && "🚀 Starting agent process…"}
            </div>
          )}

          <div className={styles.btnRow}>
            <button
              onClick={() => setStep(3)}
              disabled={deployStatus !== "idle" && deployStatus !== "error"}
              className={styles.secondaryBtn}
            >
              <span aria-hidden="true">←</span> Back
            </button>
            <button
              onClick={handleDeploy}
              disabled={deployStatus !== "idle" && deployStatus !== "error"}
              className={styles.primaryBtn}
              style={{ flex: 1 }}
            >
              {deployStatus === "idle" || deployStatus === "error" ? "🚀 Deploy Agent" : "Deploying…"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Success ───────────────────────────────────────────── */}
      {step === 5 && (
        <div className={styles.successCard}>
          <div className={styles.successEmoji}>{persona.emoji}</div>
          <h2 className={styles.successTitle}>Agent Live!</h2>
          <p className="muted">
            <strong style={{ color: "var(--foreground)" }}>{persona.name}</strong> is now playing at the table.
          </p>
          {deployedAgentId && (
            <p className="text-mono text-sm muted" style={{ marginBottom: "1.5rem" }}>
              Agent ID: {deployedAgentId}
            </p>
          )}
          <div className={styles.successActions}>
            <a href="/live" className="btn btn-danger">Watch Live</a>
            <a href="/" className="btn btn-secondary">View Tables</a>
          </div>
        </div>
      )}
    </div>
  );
}
