"use client";

import { useState } from "react";

export function ShareButton() {
  const [copied, setCopied] = useState(false);
  const [embedCopied, setEmbedCopied] = useState(false);
  const [showEmbed, setShowEmbed] = useState(false);
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

  const getEmbedCode = () => {
    // Convert /table/X → /embed/table/X
    const url = window.location.href.replace(/\/table\//, "/embed/table/");
    return `<iframe src="${url}" width="800" height="600" frameborder="0" allowfullscreen></iframe>`;
  };

  const handleEmbedCopy = async () => {
    const code = getEmbedCode();
    try {
      await navigator.clipboard.writeText(code);
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  if (fallbackUrl) {
    return (
      <span style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
        Copy link manually:{" "}
        <span
          style={{
            fontFamily: "var(--text-mono)",
            wordBreak: "break-all",
            color: "var(--accent-soft)",
          }}
        >
          {fallbackUrl}
        </span>
      </span>
    );
  }

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.35rem" }}>
      <div style={{ display: "inline-flex", gap: "0.35rem" }}>
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
        <button
          type="button"
          onClick={() => setShowEmbed((v) => !v)}
          aria-label="Embed this table"
          title="Get embed code for this table"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(148,163,184,0.3)",
            borderRadius: "8px",
            color: "var(--muted)",
            padding: "0.4rem 0.8rem",
            fontSize: "0.82rem",
            cursor: "pointer",
            transition: "all 0.2s ease",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.35rem",
          }}
        >
          {"</>"} Embed
        </button>
      </div>
      {showEmbed && (
        <div
          style={{
            background: "rgba(10,13,28,0.9)",
            border: "1px solid rgba(148,163,184,0.2)",
            borderRadius: "8px",
            padding: "0.65rem",
            fontSize: "0.72rem",
            maxWidth: "340px",
          }}
        >
          <p style={{ color: "var(--muted)", marginBottom: "0.4rem" }}>
            Embed this table widget on your site:
          </p>
          <code
            style={{
              display: "block",
              fontFamily: "var(--text-mono)",
              color: "var(--accent-soft)",
              wordBreak: "break-all",
              marginBottom: "0.5rem",
            }}
          >
            {getEmbedCode()}
          </code>
          <button
            type="button"
            onClick={handleEmbedCopy}
            style={{
              background: embedCopied ? "rgba(57,217,138,0.12)" : "rgba(129,108,249,0.15)",
              border: "1px solid rgba(129,108,249,0.35)",
              borderRadius: "6px",
              color: embedCopied ? "var(--success)" : "var(--accent)",
              padding: "0.3rem 0.7rem",
              fontSize: "0.72rem",
              cursor: "pointer",
            }}
          >
            {embedCopied ? "✓ Copied!" : "Copy code"}
          </button>
        </div>
      )}
    </div>
  );
}
