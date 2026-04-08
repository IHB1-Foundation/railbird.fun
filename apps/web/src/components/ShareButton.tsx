"use client";

import { useState } from "react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select the URL
      const input = document.createElement("input");
      input.value = window.location.href;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

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
