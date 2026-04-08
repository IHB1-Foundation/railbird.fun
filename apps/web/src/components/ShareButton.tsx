"use client";

import { useState } from "react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const handleClick = async () => {
    const url = window.location.href;
    const supported = typeof navigator.clipboard?.writeText === "function";
    if (!supported) {
      setFallbackUrl(url);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setFallbackUrl(url);
    }
  };

  if (fallbackUrl) {
    return (
      <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
        Copy link manually:{" "}
        <span
          style={{ fontFamily: "var(--text-mono)", wordBreak: "break-all", color: "var(--accent-soft)" }}
        >
          {fallbackUrl}
        </span>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Copy link to clipboard"
      style={{
        background: copied ? "rgba(57, 217, 138, 0.15)" : "rgba(255,255,255,0.04)",
        border: `1px solid ${copied ? "rgba(57, 217, 138, 0.45)" : "rgba(148,163,184,0.3)"}`,
        borderRadius: "8px",
        color: copied ? "var(--success)" : "var(--muted)",
        padding: "0.4rem 0.8rem",
        fontSize: "0.82rem",
        cursor: "pointer",
        transition: "all 0.2s ease",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.35rem",
      }}
    >
      {copied ? "✓ Copied!" : "⎘ Share"}
    </button>
  );
}
