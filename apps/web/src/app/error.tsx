"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html>
      <body>
        <div style={{ padding: "3rem 1.5rem", textAlign: "center", fontFamily: "system-ui, sans-serif", background: "#06070b", color: "#f7f8ff", minHeight: "100vh" }}>
          <h2 style={{ marginBottom: "0.5rem" }}>Something went wrong</h2>
          <p style={{ color: "#9ba1ba", marginBottom: "1.5rem", maxWidth: "420px", marginInline: "auto" }}>
            An unexpected error occurred while loading this page. This is usually temporary.
          </p>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{ padding: "0.55rem 1.2rem", cursor: "pointer", borderRadius: "8px", border: "1px solid rgba(129,108,249,0.5)", background: "rgba(129,108,249,0.15)", color: "#c4b0ff", fontSize: "0.9rem" }}
            >
              Try Again
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
