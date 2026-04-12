"use client";

import { useState, useEffect, useCallback } from "react";
import { WalletButton } from "@/components/WalletButton";
import { useAuth } from "@/lib/auth";
import { PERSONA_PRESETS } from "@/lib/agentProfiles";
import { getTables } from "@/lib/api";
import { ZERO_ADDRESS } from "@/lib/utils";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import styles from "./page.module.css";
import { StepPersona } from "./_components/StepPersona";
import { StepTable } from "./_components/StepTable";
import { StepDeploy } from "./_components/StepDeploy";
import { StepSuccess } from "./_components/StepSuccess";
import { DEFAULT_PERSONA } from "./_components/types";
import type { PersonaConfig, TableInfo, DeployStatus } from "./_components/types";

const TABLE_MAX_SEATS = Number(process.env.NEXT_PUBLIC_TABLE_MAX_SEATS || "9");

const STEP_LABELS = ["Wallet", "Persona", "Table", "Deploy"];

export default function CreateAgentPage() {
  const { address, isConnected } = useAuth();
  // Skip wallet step if already connected (UX-4.1)
  const [step, setStep] = useState(() => (isConnected ? 2 : 1));
  const [persona, setPersona] = useState<PersonaConfig>(DEFAULT_PERSONA);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selectedTable, setSelectedTable] = useState<string>("");
  const [deployStatus, setDeployStatus] = useState<DeployStatus>("idle");
  const [deployedAgentId, setDeployedAgentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [showDeployConfirm, setShowDeployConfirm] = useState(false);

  // Fetch tables when entering step 3
  useEffect(() => {
    if (step !== 3) return;
    getTables()
      .then((data) => {
        const tableList = data.map((table) => {
          const activePlayers = table.seats.filter(
            (seat) => seat.ownerAddress.toLowerCase() !== ZERO_ADDRESS,
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
          const firstOpen = tableList.find((t) => t.emptySeats > 0) ?? tableList[0];
          setSelectedTable(firstOpen.address);
        }
      })
      .catch(() => {
        setError("Failed to load tables. Check that the indexer is available.");
      });
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
      setError(
        "Fleet service URL is not configured (NEXT_PUBLIC_FLEET_URL). Contact the operator.",
      );
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
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as { agentId: string };
      setDeployedAgentId(data.agentId);
      setDeployStatus("live");
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deploy failed");
      setDeployStatus("error");
    }
  };

  const handlePersonaNext = () => {
    if (!persona.name.trim()) {
      setNameError("Agent name is required (1–24 characters).");
      return;
    }
    setStep(3);
  };

  return (
    <div className={styles.pageWrapper}>
      <Breadcrumb crumbs={[{ label: "Home", href: "/" }, { label: "Create Agent" }]} />
      <h1 className={styles.pageTitle}>Create Your AI Agent</h1>
      <p className={`muted ${styles.pageSubtitle}`}>
        Deploy a custom poker-playing AI agent to compete on-chain.
      </p>

      {/* Progress bar */}
      <div className={styles.progressTrack}>
        {STEP_LABELS.map((label, i) => (
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

      {/* Step 1: Connect Wallet */}
      {step === 1 && (
        <div className={styles.stepCard}>
          <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>🔗</div>
          <h2 className={styles.stepTitle}>Connect Your Wallet</h2>
          <p className={`muted ${styles.stepSubtitle}`}>
            Your wallet identifies you as the agent owner. You control which table the agent plays
            on.
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

      {/* Step 2: Persona */}
      {step === 2 && (
        <StepPersona
          persona={persona}
          setPersona={setPersona}
          nameError={nameError}
          setNameError={setNameError}
          applyPreset={applyPreset}
          onBack={() => setStep(1)}
          onNext={handlePersonaNext}
        />
      )}

      {/* Step 3: Table */}
      {step === 3 && (
        <StepTable
          tables={tables}
          selectedTable={selectedTable}
          setSelectedTable={setSelectedTable}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      )}

      {/* Step 4: Deploy */}
      {step === 4 && (
        <>
          <StepDeploy
            persona={persona}
            selectedTable={selectedTable}
            deployStatus={deployStatus}
            error={error}
            onDeploy={() => setShowDeployConfirm(true)}
            onBack={() => setStep(3)}
          />
          {/* D-R10.2: confirm dialog before irreversible deploy */}
          <ConfirmDialog
            open={showDeployConfirm}
            title={`Deploy ${persona.name || "Agent"}?`}
            message={`Deploy "${persona.name}" to table ${selectedTable.slice(0, 10)}…? Fleet deployment is off-chain. Gas is absorbed by the protocol. Agent seating cannot be cancelled once started.`}
            confirmLabel="Deploy Agent"
            cancelLabel="Cancel"
            onConfirm={() => {
              setShowDeployConfirm(false);
              handleDeploy();
            }}
            onCancel={() => setShowDeployConfirm(false)}
          />
        </>
      )}

      {/* Step 5: Success */}
      {step === 5 && <StepSuccess persona={persona} deployedAgentId={deployedAgentId} />}
    </div>
  );
}
