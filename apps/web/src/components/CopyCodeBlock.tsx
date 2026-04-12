"use client";

import { useState } from "react";

interface CopyCodeBlockProps {
  code: string;
}

export function CopyCodeBlock({ code }: CopyCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback: no-op
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <pre
        style={{
          margin: 0,
          padding: "0.9rem 1rem",
          paddingRight: "4.5rem",
          overflowX: "auto",
          background: "rgba(15,23,42,0.85)",
          borderRadius: "0.875rem",
          border: "1px solid rgba(148,163,184,0.16)",
        }}
      >
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={handleCopy}
        style={{
          position: "absolute",
          top: "0.5rem",
          right: "0.5rem",
          background: copied ? "rgba(57,217,138,0.15)" : "rgba(255,255,255,0.06)",
          border: "1px solid rgba(148,163,184,0.25)",
          borderRadius: "6px",
          color: copied ? "var(--success)" : "var(--muted)",
          fontSize: "0.7rem",
          fontFamily: "inherit",
          padding: "0.2rem 0.55rem",
          cursor: "pointer",
          transition: "color 0.2s ease, background 0.2s ease",
        }}
        aria-label="Copy code to clipboard"
      >
        {copied ? "✓ Copied" : "Copy"}
      </button>
    </div>
  );
}
