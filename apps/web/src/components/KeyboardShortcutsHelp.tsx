"use client";

import { useEffect, useRef, useState } from "react";
import { useKeyboardShortcuts } from "@/lib/useKeyboardShortcuts";
import { useScrollLock } from "@/hooks/useScrollLock";
import styles from "./KeyboardShortcutsHelp.module.css";

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
  const cardRef = useRef<HTMLDivElement>(null);
  useKeyboardShortcuts();
  useScrollLock(open); // PD-H7 / PD-F5: prevent body scroll while modal is open

  useEffect(() => {
    const handler = () => setOpen((v) => !v);
    window.addEventListener("keyboard-help-toggle", handler);
    return () => window.removeEventListener("keyboard-help-toggle", handler);
  }, []);

  // Focus trap: move focus into card when opened
  useEffect(() => {
    if (open) cardRef.current?.focus();
  }, [open]);

  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!open) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={() => setOpen(false)}
    >
      <div
        ref={cardRef}
        className={styles.card}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={styles.title}>Keyboard Shortcuts</h2>
        <table className={styles.shortcutTable}>
          <tbody>
            {SHORTCUTS.map(({ keys, description }) => (
              <tr key={description} className={styles.shortcutRow}>
                <td className={styles.keysCell}>
                  {keys.map((k, i) => (
                    <span key={i}>
                      <kbd className={styles.kbd}>{k}</kbd>
                      {i < keys.length - 1 && (
                        <span className={styles.separator}>then</span>
                      )}
                    </span>
                  ))}
                </td>
                <td className={styles.descCell}>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className={styles.hint}>
          Click anywhere or press{" "}
          <kbd className={styles.kbd}>Esc</kbd> to close
        </p>
      </div>
    </div>
  );
}
