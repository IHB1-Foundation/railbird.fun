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
        <div style={{ padding: "3rem 1.5rem", textAlign: "center", fontFamily: "system-ui, sans-serif", background: "#06070b", color: "#f7f8ff", minHeight: "100vh" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>Something went wrong</h2>
          <p style={{ color: "#9ba1ba", marginBottom: "0.5rem", maxWidth: "420px", marginInline: "auto" }}>
            An unexpected error occurred while loading this page. This is usually temporary — the service may be restarting.
          </p>
          <p style={{ color: "#6b7280", marginBottom: "1.5rem", fontSize: "0.85rem" }}>
            Retrying automatically in <strong style={{ color: "#c4b0ff" }}>{countdown}s</strong> — or click below to act now.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              onClick={() => { setCountdown(15); reset(); }}
              style={{ padding: "0.55rem 1.2rem", cursor: "pointer", borderRadius: "8px", border: "1px solid rgba(129,108,249,0.5)", background: "rgba(129,108,249,0.15)", color: "#c4b0ff", fontSize: "0.9rem" }}
            >
              Try Again Now
            </button>
            <Link
              href="/"
              style={{ padding: "0.55rem 1.2rem", borderRadius: "8px", border: "1px solid rgba(148,163,184,0.3)", color: "#9ba1ba", textDecoration: "none", fontSize: "0.9rem" }}
            >
              Go Home
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
