"use client";

import { useState, useEffect } from "react";

interface LastUpdatedProps {
  timestamp: string | number;
}

export function LastUpdated({ timestamp }: LastUpdatedProps) {
  const [secondsAgo, setSecondsAgo] = useState(() =>
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)
  );

  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [timestamp]);

  const stale = secondsAgo > 60;
  const label = secondsAgo < 60 ? `${secondsAgo}s ago` : `${Math.floor(secondsAgo / 60)}m ago`;

  return (
    <span
      style={{
        fontSize: "0.75rem",
        color: stale ? "var(--warning)" : "var(--muted)",
        transition: "color 0.3s ease",
      }}
    >
      Updated {label}
    </span>
  );
}
