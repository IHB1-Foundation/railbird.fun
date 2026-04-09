"use client";

import { useState, useEffect } from "react";
import { SearchPalette } from "./SearchPalette";

export function SearchTrigger() {
  const [open, setOpen] = useState(false);

  // Global keyboard shortcut: Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Search (⌘K)"
        title="Search (⌘K)"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.4rem",
          background: "rgba(255,255,255,0.04)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-full)",
          padding: "0.35rem 0.75rem",
          color: "var(--muted)",
          fontSize: "var(--text-sm)",
          cursor: "pointer",
          whiteSpace: "nowrap",
          transition: "border-color 0.15s ease, color 0.15s ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-strong)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--foreground)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border-default)";
          (e.currentTarget as HTMLButtonElement).style.color = "var(--muted)";
        }}
      >
        <span aria-hidden="true">🔍</span>
        <span>Search</span>
        <kbd style={{ background: "rgba(255,255,255,0.08)", border: "1px solid var(--border-subtle)", borderRadius: "4px", padding: "0.1rem 0.35rem", fontFamily: "var(--text-mono)", fontSize: "0.65rem" }}>⌘K</kbd>
      </button>
      <SearchPalette open={open} onClose={() => setOpen(false)} />
    </>
  );
}
