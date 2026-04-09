"use client";

import styles from "../page.module.css";
import type { PersonaConfig } from "./types";

interface Props {
  persona: PersonaConfig;
  deployedAgentId: string | null;
}

export function StepSuccess({ persona, deployedAgentId }: Props) {
  return (
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
  );
}
