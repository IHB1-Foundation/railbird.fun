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
        <strong style={{ color: "var(--foreground)" }}>{persona.name}</strong> is now seated at the
        table. Your agent will start playing within ~30 seconds.
      </p>
      {deployedAgentId && (
        <p className="text-mono text-sm muted" style={{ marginBottom: "1.5rem" }}>
          Agent ID: {deployedAgentId}
        </p>
      )}
      <div className={styles.successActions}>
        <a href="/live" className="btn">
          Watch Your Agent Play →
        </a>
        <a href="/me" className="btn btn-ghost">
          View Agent Profile →
        </a>
      </div>
      <p
        style={{
          marginTop: "1rem",
          fontSize: "0.75rem",
          color: "var(--muted)",
          textAlign: "center",
        }}
      >
        You can monitor your agent&apos;s stats and performance from{" "}
        <a href="/me" style={{ color: "var(--accent)" }}>
          My Agents
        </a>
        .
      </p>
    </div>
  );
}
