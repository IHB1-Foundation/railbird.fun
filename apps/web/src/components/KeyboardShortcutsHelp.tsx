"use client";

import { useEffect, useState } from "react";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";

const SHORTCUTS = [
  { keys: ["g", "h"], description: "Go to Home" },
  { keys: ["g", "l"], description: "Go to Live" },
  { keys: ["g", "b"], description: "Go to Leaderboard" },
  { keys: ["g", "c"], description: "Go to Create Agent" },
  { keys: ["g", "e"], description: "Go to Evolution" },
  { keys: ["g", "m"], description: "Go to My Agents" },
  { keys: ["?"], description: "Show / hide this panel" },
];

export function KeyboardShortcutsHelp() {
  const [open, setOpen] = useState(false);
  useKeyboardShortcuts();

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("keyboard-help-toggle", handler);
    return () => window.removeEventListener("keyboard-help-toggle", handler);
  }, []);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      style={{
        position: "fixed", inset: 0, zIndex: 9000,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(6,7,11,0.75)", backdropFilter: "blur(4px)",
      }}
      onClick={() => setOpen(false)}
    >
      <div
        style={{
          background: "var(--card-bg-strong, #0b0d1a)", border: "1px solid var(--border-default)",
          borderRadius: "12px", padding: "1.5rem", minWidth: "280px", maxWidth: "420px", width: "90%",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "1rem" }}>
          Keyboard Shortcuts
        </h2>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {SHORTCUTS.map(({ keys, description }) => (
              <tr key={description} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                <td style={{ padding: "0.45rem 0", verticalAlign: "middle" }}>
                  {keys.map((k, i) => (
                    <span key={i}>
                      <kbd style={{
                        display: "inline-block", padding: "0.1rem 0.4rem",
                        background: "rgba(255,255,255,0.08)", borderRadius: "4px",
                        fontFamily: "monospace", fontSize: "0.78rem", fontWeight: 600,
                        border: "1px solid var(--border-default)",
                      }}>{k}</kbd>
                      {i < keys.length - 1 && <span style={{ margin: "0 0.25rem", color: "var(--muted)" }}>then</span>}
                    </span>
                  ))}
                </td>
                <td style={{ padding: "0.45rem 0 0.45rem 1rem", fontSize: "0.82rem", color: "var(--muted)" }}>
                  {description}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ marginTop: "1rem", fontSize: "0.72rem", color: "var(--muted)", textAlign: "center" }}>
          Click anywhere or press <kbd style={{ fontFamily: "monospace", fontSize: "0.72rem" }}>Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
