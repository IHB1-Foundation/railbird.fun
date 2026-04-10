"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [countdown, setCountdown] = useState(15);

  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  // Auto-retry countdown
  useEffect(() => {
    if (countdown <= 0) {
      reset();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, reset]);

  return (
    <html>
      <body>
        <div style={{
          padding: "3rem 1.5rem",
          textAlign: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#06070b",
          color: "#f7f8ff",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
        }}>
          {/* Broken card art */}
          <div style={{ fontSize: "4rem", marginBottom: "0.5rem" }} aria-hidden="true">🃏💥</div>

          <p style={{
            fontSize: "0.75rem",
            fontFamily: "monospace",
            letterSpacing: "0.2em",
            color: "#ef4444",
            textTransform: "uppercase",
          }}>
            THE DEALER FOLDED
          </p>

          <h2 style={{
            fontSize: "clamp(1.4rem, 4vw, 2rem)",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            margin: 0,
          }}>
            Something went wrong.
          </h2>

          <p style={{ color: "#9ba1ba", maxWidth: "380px", lineHeight: 1.6, margin: "0.25rem 0" }}>
            An unexpected error shuffled the deck wrong. This is usually temporary.
          </p>

          <p style={{ color: "#6b7280", fontSize: "0.85rem" }}>
            Dealing again in{" "}
            <strong style={{ color: "#a78bfa" }}>{countdown}s</strong>
            {" "}— or go now.
          </p>

          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
            <button
              onClick={() => { setCountdown(15); reset(); }}
              style={{
                padding: "0.55rem 1.2rem",
                cursor: "pointer",
                borderRadius: "999px",
                border: "1px solid rgba(167,139,250,0.5)",
                background: "rgba(167,139,250,0.12)",
                color: "#c4b0ff",
                fontSize: "0.9rem",
                fontWeight: 600,
                minHeight: "44px",
              }}
            >
              Deal Again
            </button>
            <Link
              href="/"
              style={{
                padding: "0.55rem 1.2rem",
                borderRadius: "999px",
                border: "1px solid rgba(148,163,184,0.3)",
                color: "#9ba1ba",
                textDecoration: "none",
                fontSize: "0.9rem",
                display: "inline-flex",
                alignItems: "center",
                minHeight: "44px",
              }}
            >
              Back to Lobby
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
