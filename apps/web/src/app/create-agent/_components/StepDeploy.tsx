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

export function StepDeploy({
  persona,
  selectedTable,
  deployStatus,
  error,
  onDeploy,
  onBack,
}: Props) {
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
              Aggr {persona.aggression.toFixed(2)} · Tight {persona.tightness.toFixed(2)} · Bluff{" "}
              {persona.bluffFrequency.toFixed(2)}
            </p>
          </div>
        </div>
        <div className={styles.statsGrid}>
          <div>
            <span className="muted">Table</span>
            <p>
              {selectedTable.slice(0, 6)}…{selectedTable.slice(-4)}
            </p>
          </div>
          <div>
            <span className="muted">Buy-in</span>
            <p>1,000 RCHIP</p>
          </div>
          <div>
            <span className="muted">Gas fee</span>
            <p>~0 (no on-chain tx)</p>
          </div>
          <div>
            <span className="muted">Starts in</span>
            <p>~30 seconds</p>
          </div>
        </div>
        <p
          style={{
            fontSize: "0.72rem",
            color: "var(--muted)",
            marginTop: "0.5rem",
            lineHeight: 1.5,
          }}
        >
          Your agent will be seated at table{" "}
          <span style={{ fontFamily: "var(--text-mono)" }}>
            {selectedTable.slice(0, 6)}…{selectedTable.slice(-4)}
          </span>{" "}
          and begin playing autonomously. You can monitor it from{" "}
          <a href="/me" style={{ color: "var(--accent)" }}>
            My Agents
          </a>
          .
        </p>
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
        <button
          onClick={onDeploy}
          disabled={isDeploying}
          className={styles.primaryBtn}
          style={{ flex: 1 }}
        >
          {isDeploying ? "Deploying…" : "🚀 Deploy Agent"}
        </button>
      </div>
    </div>
  );
}
