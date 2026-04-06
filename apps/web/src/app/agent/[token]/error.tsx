"use client";

import { useEffect } from "react";

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
    <div className="error-boundary">
      <h2>Failed to load agent</h2>
      <p>{error.message || "Could not fetch agent data. Please try again."}</p>
      <button onClick={reset}>Retry</button>
    </div>
  );
}
