"use client";

import { useState, useEffect, useCallback } from "react";
import { WalletButton } from "@/components/WalletButton";
import { useAuth } from "@/lib/auth";
import { PERSONA_PRESETS } from "@/lib/agentProfiles";
import { getTables } from "@/lib/api";
import { ZERO_ADDRESS } from "@/lib/utils";

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

function RadarPreview({ persona }: { persona: PersonaConfig }) {
  const dim = 140;
  const cx = dim / 2;
  const cy = dim / 2;
  const r = dim * 0.35;

  const axes = [
    { key: "aggression" as const, label: "Aggr" },
    { key: "tightness" as const, label: "Tight" },
    { key: "bluffFrequency" as const, label: "Bluff" },
    { key: "positionAwareness" as const, label: "Pos" },
  ];

  const angleOffset = -Math.PI / 2;
  const points = axes.map((axis, i) => {
    const angle = angleOffset + (2 * Math.PI * i) / axes.length;
    const val = persona[axis.key];
    return {
      label: axis.label,
      x: cx + r * val * Math.cos(angle),
      y: cy + r * val * Math.sin(angle),
      lx: cx + (r + 16) * Math.cos(angle),
      ly: cy + (r + 16) * Math.sin(angle),
    };
  });

  const rings = [0.25, 0.5, 0.75, 1.0];
  const polygonPoints = points.map((p) => `${p.x},${p.y}`).join(" ");

  return (
    <svg width={dim} height={dim} viewBox={`0 0 ${dim} ${dim}`} style={{ display: "block" }}>
      {rings.map((ring) => {
        const ringPts = axes.map((_, i) => {
          const angle = angleOffset + (2 * Math.PI * i) / axes.length;
          return `${cx + r * ring * Math.cos(angle)},${cy + r * ring * Math.sin(angle)}`;
        }).join(" ");
        return <polygon key={ring} points={ringPts} fill="none" stroke="#374151" strokeWidth="1" />;
      })}
      {axes.map((_, i) => {
        const angle = angleOffset + (2 * Math.PI * i) / axes.length;
        return (
          <line key={i} x1={cx} y1={cy}
            x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)}
            stroke="#374151" strokeWidth="1" />
        );
      })}
      <polygon points={polygonPoints}
        fill={persona.colorAccent + "40"} stroke={persona.colorAccent} strokeWidth="2" />
      {points.map((p, i) => (
        <text key={i} x={p.lx} y={p.ly} textAnchor="middle" dominantBaseline="middle"
          fontSize="9" fill="#9CA3AF">{p.label}</text>
      ))}
    </svg>
  );
}

function Slider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={{ marginBottom: "0.75rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
        <span style={{ fontSize: "0.875rem", color: "#9CA3AF" }}>{label}</span>
        <span style={{ fontSize: "0.875rem", color: "#F9FAFB", fontFamily: "monospace" }}>
          {value.toFixed(2)}
        </span>
      </div>
      <input
        type="range" min={0} max={1} step={0.01} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#8B5CF6" }}
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
    <div style={{ maxWidth: "640px", margin: "0 auto", padding: "2rem 1rem" }}>
      <h1 style={{ fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
        Create Your AI Agent
      </h1>
      <p style={{ color: "#6B7280", marginBottom: "2rem" }}>
        Deploy a custom poker-playing AI agent to compete on-chain.
      </p>

      {/* Progress */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem" }}>
        {["Wallet", "Persona", "Table", "Deploy"].map((label, i) => (
          <div key={i} style={{ flex: 1 }}>
            <div style={{
              height: "4px", borderRadius: "2px",
              background: step > i + 1 ? "#8B5CF6" : step === i + 1 ? "#8B5CF6" : "#374151",
              opacity: step > i + 1 ? 1 : step === i + 1 ? 1 : 0.3,
            }} />
            <p style={{ fontSize: "0.7rem", color: step >= i + 1 ? "#9CA3AF" : "#4B5563", marginTop: "0.25rem" }}>
              {label}
            </p>
          </div>
        ))}
      </div>

      {/* ── Step 1: Connect Wallet ──────────────────────────────────────── */}
      {step === 1 && (
        <div style={{ background: "#111827", borderRadius: "0.75rem", padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔗</div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>Connect Your Wallet</h2>
          <p style={{ color: "#6B7280", marginBottom: "2rem" }}>
            Your wallet identifies you as the agent owner. You control which table the agent plays on.
          </p>
          {isConnected ? (
            <div>
              <p style={{ color: "#10B981", marginBottom: "1rem" }}>
                ✓ Connected: {address?.slice(0, 6)}…{address?.slice(-4)}
              </p>
              <button
                onClick={() => setStep(2)}
                style={{
                  background: "#8B5CF6", color: "#fff", border: "none",
                  borderRadius: "0.5rem", padding: "0.75rem 2rem",
                  fontSize: "1rem", cursor: "pointer", fontWeight: 600,
                }}
              >
                Continue →
              </button>
            </div>
          ) : (
            <WalletButton />
          )}
        </div>
      )}

      {/* ── Step 2: Persona Config ─────────────────────────────────────── */}
      {step === 2 && (
        <div style={{ background: "#111827", borderRadius: "0.75rem", padding: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem" }}>Configure Persona</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "2rem" }}>
            <div>
              {/* Name */}
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.875rem", color: "#9CA3AF", marginBottom: "0.25rem" }}>
                  Agent Name (1–24 chars)
                </label>
                <input
                  type="text" maxLength={24} value={persona.name}
                  onChange={(e) => setPersona((p) => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Serpent"
                  style={{
                    width: "100%", background: "#1F2937", border: "1px solid #374151",
                    borderRadius: "0.5rem", padding: "0.5rem 0.75rem", color: "#F9FAFB",
                    fontSize: "1rem", boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Presets */}
              <div style={{ marginBottom: "1rem" }}>
                <p style={{ fontSize: "0.875rem", color: "#9CA3AF", marginBottom: "0.5rem" }}>Quick Presets</p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {PRESET_NAMES.map((id) => (
                    <button
                      key={id}
                      onClick={() => applyPreset(id)}
                      style={{
                        background: "#1F2937", border: "1px solid #374151",
                        borderRadius: "0.375rem", padding: "0.25rem 0.75rem",
                        color: "#D1D5DB", fontSize: "0.75rem", cursor: "pointer",
                      }}
                    >
                      {PERSONA_PRESETS[id].emoji} {id}
                    </button>
                  ))}
                </div>
              </div>

              {/* Emoji */}
              <div style={{ marginBottom: "1rem" }}>
                <p style={{ fontSize: "0.875rem", color: "#9CA3AF", marginBottom: "0.5rem" }}>Emoji</p>
                <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                  {EMOJI_OPTIONS.map((em) => (
                    <button
                      key={em}
                      onClick={() => setPersona((p) => ({ ...p, emoji: em }))}
                      style={{
                        fontSize: "1.25rem", padding: "0.25rem 0.5rem",
                        border: `2px solid ${persona.emoji === em ? "#8B5CF6" : "#374151"}`,
                        borderRadius: "0.375rem", background: "transparent", cursor: "pointer",
                      }}
                    >
                      {em}
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div style={{ marginBottom: "1.5rem" }}>
                <p style={{ fontSize: "0.875rem", color: "#9CA3AF", marginBottom: "0.5rem" }}>Color Accent</p>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  {COLOR_OPTIONS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setPersona((p) => ({ ...p, colorAccent: c }))}
                      style={{
                        width: "24px", height: "24px", borderRadius: "50%",
                        background: c, border: `2px solid ${persona.colorAccent === c ? "#fff" : "transparent"}`,
                        cursor: "pointer",
                      }}
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
              <div style={{ marginBottom: "1rem" }}>
                <label style={{ display: "block", fontSize: "0.875rem", color: "#9CA3AF", marginBottom: "0.25rem" }}>
                  Personality Prompt (optional, max 200 chars)
                </label>
                <textarea
                  maxLength={200} value={persona.systemPrompt}
                  onChange={(e) => setPersona((p) => ({ ...p, systemPrompt: e.target.value }))}
                  placeholder="e.g. Be mysterious, never reveal your hand strength..."
                  rows={3}
                  style={{
                    width: "100%", background: "#1F2937", border: "1px solid #374151",
                    borderRadius: "0.5rem", padding: "0.5rem 0.75rem", color: "#F9FAFB",
                    fontSize: "0.875rem", resize: "vertical", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            {/* Radar preview */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.5rem" }}>
              <div style={{
                background: "#1F2937", borderRadius: "0.75rem", padding: "1rem",
                border: `2px solid ${persona.colorAccent}40`,
              }}>
                <div style={{ fontSize: "2rem", textAlign: "center" }}>{persona.emoji}</div>
                <RadarPreview persona={persona} />
                <p style={{ fontSize: "0.75rem", color: "#6B7280", textAlign: "center", marginTop: "0.5rem" }}>
                  {persona.name || "Unnamed"}
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "1rem", marginTop: "1rem" }}>
            <button onClick={() => setStep(1)} style={{ padding: "0.75rem 1.5rem", background: "#1F2937", border: "1px solid #374151", borderRadius: "0.5rem", color: "#9CA3AF", cursor: "pointer" }}>
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!persona.name.trim()}
              style={{
                flex: 1, padding: "0.75rem", background: persona.name.trim() ? "#8B5CF6" : "#374151",
                border: "none", borderRadius: "0.5rem", color: "#fff",
                cursor: persona.name.trim() ? "pointer" : "not-allowed", fontWeight: 600,
              }}
            >
              Select Table →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Select Table ──────────────────────────────────────── */}
      {step === 3 && (
        <div style={{ background: "#111827", borderRadius: "0.75rem", padding: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem" }}>Select Table</h2>

          {tables.length === 0 ? (
            <p style={{ color: "#6B7280" }}>Loading tables…</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {tables.map((table) => (
                <button
                  key={table.address}
                  onClick={() => setSelectedTable(table.address)}
                  disabled={table.emptySeats === 0}
                  style={{
                    background: selectedTable === table.address ? "#1E1B4B" : "#1F2937",
                    border: `2px solid ${selectedTable === table.address ? "#8B5CF6" : "#374151"}`,
                    borderRadius: "0.5rem", padding: "1rem",
                    cursor: table.emptySeats > 0 ? "pointer" : "not-allowed",
                    textAlign: "left",
                    opacity: table.emptySeats > 0 ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <p style={{ fontWeight: 600, color: "#F9FAFB", marginBottom: "0.25rem" }}>
                        {table.address.slice(0, 10)}…
                      </p>
                      <p style={{ fontSize: "0.875rem", color: "#9CA3AF" }}>
                        Blinds: {table.smallBlind}/{table.bigBlind} RCHIP · {table.activePlayers} seated · {table.emptySeats} open
                      </p>
                    </div>
                    {table.emptySeats > 0 ? (
                      <span style={{ background: "#064E3B", color: "#10B981", borderRadius: "9999px", padding: "0.125rem 0.5rem", fontSize: "0.75rem" }}>
                        Open
                      </span>
                    ) : (
                      <span style={{ background: "#450A0A", color: "#EF4444", borderRadius: "9999px", padding: "0.125rem 0.5rem", fontSize: "0.75rem" }}>
                        Full
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: "1rem" }}>
            <button onClick={() => setStep(2)} style={{ padding: "0.75rem 1.5rem", background: "#1F2937", border: "1px solid #374151", borderRadius: "0.5rem", color: "#9CA3AF", cursor: "pointer" }}>
              ← Back
            </button>
            <button
              onClick={() => setStep(4)}
              disabled={!selectedTable || !tables.some((table) => table.address === selectedTable && table.emptySeats > 0)}
              style={{
                flex: 1, padding: "0.75rem",
                background: selectedTable && tables.some((table) => table.address === selectedTable && table.emptySeats > 0) ? "#8B5CF6" : "#374151",
                border: "none", borderRadius: "0.5rem", color: "#fff",
                cursor: selectedTable && tables.some((table) => table.address === selectedTable && table.emptySeats > 0) ? "pointer" : "not-allowed",
                fontWeight: 600,
              }}
            >
              Fund & Deploy →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Fund & Deploy ─────────────────────────────────────── */}
      {step === 4 && (
        <div style={{ background: "#111827", borderRadius: "0.75rem", padding: "2rem" }}>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1.5rem" }}>Fund & Deploy</h2>

          {/* Summary card */}
          <div style={{ background: "#1F2937", borderRadius: "0.5rem", padding: "1rem", marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
              <span style={{ fontSize: "2.5rem" }}>{persona.emoji}</span>
              <div>
                <p style={{ fontWeight: 700, color: "#F9FAFB" }}>{persona.name}</p>
                <p style={{ fontSize: "0.875rem", color: "#9CA3AF" }}>
                  Aggr {persona.aggression.toFixed(2)} · Tight {persona.tightness.toFixed(2)} · Bluff {persona.bluffFrequency.toFixed(2)}
                </p>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", fontSize: "0.875rem" }}>
              <div>
                <span style={{ color: "#6B7280" }}>Table</span>
                <p style={{ color: "#F9FAFB" }}>{selectedTable.slice(0, 10)}…</p>
              </div>
              <div>
                <span style={{ color: "#6B7280" }}>Buy-in (est.)</span>
                <p style={{ color: "#F9FAFB" }}>1,000 RCHIP</p>
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: "#450A0A", border: "1px solid #EF4444", borderRadius: "0.5rem", padding: "0.75rem", marginBottom: "1rem", color: "#FCA5A5", fontSize: "0.875rem" }}>
              {error}
            </div>
          )}

          {deployStatus !== "idle" && deployStatus !== "error" && deployStatus !== "live" && (
            <div style={{ background: "#1E1B4B", border: "1px solid #8B5CF6", borderRadius: "0.5rem", padding: "0.75rem", marginBottom: "1rem", color: "#C4B5FD", fontSize: "0.875rem" }}>
              {deployStatus === "registering" && "⏳ Registering agent…"}
              {deployStatus === "seating" && "🎯 Seating at table…"}
              {deployStatus === "starting" && "🚀 Starting agent process…"}
            </div>
          )}

          <div style={{ display: "flex", gap: "1rem" }}>
            <button
              onClick={() => setStep(3)}
              disabled={deployStatus !== "idle" && deployStatus !== "error"}
              style={{ padding: "0.75rem 1.5rem", background: "#1F2937", border: "1px solid #374151", borderRadius: "0.5rem", color: "#9CA3AF", cursor: "pointer" }}
            >
              ← Back
            </button>
            <button
              onClick={handleDeploy}
              disabled={deployStatus !== "idle" && deployStatus !== "error"}
              style={{
                flex: 1, padding: "0.75rem", background: "#8B5CF6",
                border: "none", borderRadius: "0.5rem", color: "#fff",
                cursor: "pointer", fontWeight: 700, fontSize: "1rem",
              }}
            >
              {deployStatus === "idle" || deployStatus === "error" ? "🚀 Deploy Agent" : "Deploying…"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 5: Success ───────────────────────────────────────────── */}
      {step === 5 && (
        <div style={{ background: "#111827", borderRadius: "0.75rem", padding: "2rem", textAlign: "center" }}>
          <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>{persona.emoji}</div>
          <h2 style={{ fontSize: "1.5rem", fontWeight: 700, color: "#10B981", marginBottom: "0.5rem" }}>
            Agent Live!
          </h2>
          <p style={{ color: "#6B7280", marginBottom: "1rem" }}>
            <strong style={{ color: "#F9FAFB" }}>{persona.name}</strong> is now playing at the table.
          </p>
          {deployedAgentId && (
            <p style={{ fontSize: "0.75rem", color: "#4B5563", fontFamily: "monospace", marginBottom: "1.5rem" }}>
              Agent ID: {deployedAgentId}
            </p>
          )}
          <div style={{ display: "flex", gap: "1rem", justifyContent: "center", flexWrap: "wrap" }}>
            <a href="/live" style={{ padding: "0.75rem 1.5rem", background: "#EF4444", borderRadius: "0.5rem", color: "#fff", textDecoration: "none", fontWeight: 600 }}>
              Watch Live
            </a>
            <a href="/" style={{ padding: "0.75rem 1.5rem", background: "#1F2937", border: "1px solid #374151", borderRadius: "0.5rem", color: "#9CA3AF", textDecoration: "none" }}>
              View Tables
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
