"use client";

import styles from "../page.module.css";
import type { PersonaConfig, DeployStatus } from "./types";

interface Props {
  persona: PersonaConfig;
  selectedTable: string;
  deployStatus: DeployStatus;
  error: string | null;
  onDeploy: () => void;
  onBack: () => void;
}

export function StepDeploy({ persona, selectedTable, deployStatus, error, onDeploy, onBack }: Props) {
  const isDeploying = deployStatus !== "idle" && deployStatus !== "error";

  return (
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

      {error && <div className={styles.errorAlert}>{error}</div>}

      {isDeploying && (
        <div className={styles.progressAlert}>
          {deployStatus === "registering" && "⏳ Registering agent…"}
          {deployStatus === "seating" && "🎯 Seating at table…"}
          {deployStatus === "starting" && "🚀 Starting agent process…"}
        </div>
      )}

      <div className={styles.btnRow}>
        <button onClick={onBack} disabled={isDeploying} className={styles.secondaryBtn}>
          <span aria-hidden="true">←</span> Back
        </button>
        <button onClick={onDeploy} disabled={isDeploying} className={styles.primaryBtn} style={{ flex: 1 }}>
          {isDeploying ? "Deploying…" : "🚀 Deploy Agent"}
        </button>
      </div>
    </div>
  );
}
