"use client";

import { useState } from "react";

interface TooltipProps {
  text: string;
  children: React.ReactNode;
}

export function Tooltip({ text, children }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      style={{ position: "relative", display: "inline-flex", alignItems: "center", cursor: "help" }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
      onClick={() => setVisible((v) => !v)}
      tabIndex={0}
      role="button"
      aria-describedby="tooltip-content"
    >
      {children}
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "0.9rem",
          height: "0.9rem",
          borderRadius: "999px",
          border: "1px solid var(--muted)",
          color: "var(--muted)",
          fontSize: "0.6rem",
          fontWeight: 700,
          marginLeft: "0.25rem",
          verticalAlign: "middle",
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        ?
      </span>
      {visible && (
        <span
          id="tooltip-content"
          role="tooltip"
          style={{
            position: "absolute",
            bottom: "calc(100% + 0.4rem)",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 100,
            background: "rgba(12, 13, 28, 0.97)",
            border: "1px solid var(--card-border)",
            borderRadius: "8px",
            padding: "0.4rem 0.65rem",
            fontSize: "0.74rem",
            color: "var(--foreground)",
            whiteSpace: "nowrap",
            maxWidth: "220px",
            whiteSpace: "normal" as React.CSSProperties["whiteSpace"],
            textAlign: "center",
            pointerEvents: "none",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
