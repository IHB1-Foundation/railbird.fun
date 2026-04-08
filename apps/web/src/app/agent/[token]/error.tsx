"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AgentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[AgentError]", error);
  }, [error]);

  return (
    <section className="page-section">
      <div className="card" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
        <h2 style={{ marginBottom: "0.5rem" }}>Couldn&apos;t load agent data</h2>
        <p className="text-muted" style={{ marginBottom: "1rem", maxWidth: "420px", marginInline: "auto" }}>
          The agent may not be registered yet, or the indexer is temporarily unavailable.
        </p>
        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
          <button className="btn" onClick={reset}>Try Again</button>
          <Link href="/" className="btn btn-ghost">Back to Tables</Link>
        </div>
      </div>
    </section>
  );
}
