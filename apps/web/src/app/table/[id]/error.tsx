"use client";

import { useEffect } from "react";

export default function TableError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[TableError]", error);
  }, [error]);

  return (
    <div className="error-boundary">
      <h2>Failed to load table</h2>
      <p>{error.message || "Could not fetch table data. Please try again."}</p>
      <button onClick={reset}>Retry</button>
    </div>
  );
}
