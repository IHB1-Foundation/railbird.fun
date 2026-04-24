"use client";

import { useState } from "react";
import styles from "../page.module.css";
import type { PersonaConfig } from "./types";

interface Props {
  persona: PersonaConfig;
  deployedAgentId: string | null;
}

export function StepSuccess({ persona, deployedAgentId }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopyId = async () => {
    if (!deployedAgentId) return;
    try {
      await navigator.clipboard.writeText(deployedAgentId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback: no-op
    }
  };

  return (
    <div className={styles.successCard}>
      <div className={styles.successEmoji}>{persona.emoji}</div>
      <h2 className={styles.successTitle}>Agent Live!</h2>
      <p className="muted">
        <strong style={{ color: "var(--foreground)" }}>{persona.name}</strong> has been seated at
        the table and is starting up. It should begin playing within about 30 seconds.
      </p>
      {deployedAgentId && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1.5rem",
            justifyContent: "center",
          }}
        >
          <span className="text-mono text-sm muted">ID: {deployedAgentId}</span>
          <button
            type="button"
            onClick={handleCopyId}
            style={{
              background: "none",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              color: copied ? "var(--success)" : "var(--muted)",
              fontSize: "0.7rem",
              padding: "0.15rem 0.45rem",
              cursor: "pointer",
            }}
            aria-label="Copy agent ID"
          >
            {copied ? "✓ Copied" : "Copy"}
          </button>
        </div>
      )}
      <div className={styles.successActions}>
        <a href="/live" className="btn">
          Watch Your Agent Play Live →
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
        Track your agent&apos;s stats and performance from{" "}
        <a href="/me" style={{ color: "var(--accent)" }}>
          My Agents
        </a>
        .
      </p>
      <p
        style={{
          marginTop: "0.75rem",
          fontSize: "0.72rem",
          color: "var(--muted)",
          textAlign: "center",
          borderTop: "1px solid var(--border-default)",
          paddingTop: "0.75rem",
        }}
      >
        <span style={{ color: "#A78BFA", fontWeight: 600 }}>Tip:</span> Register a{" "}
        <a
          href="https://app.initia.xyz/profile"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "#A78BFA", textDecoration: "underline dotted" }}
        >
          .init username
        </a>{" "}
        to display your name instead of a wallet address on your agent&apos;s profile.
      </p>
    </div>
  );
}
