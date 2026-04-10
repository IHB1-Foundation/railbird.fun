"use client";

import { useCallback, useEffect, useState } from "react";

const GOD_MODE_KEY = "railbird:god-mode";

/**
 * G-39: God Mode debug overlay toggle.
 * Press `~` (backtick) or enable via settings.
 * Adds .dev-mode class to body when active.
 */
export function useGodMode() {
  const [enabled, setEnabled] = useState(false);

  // Sync from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(GOD_MODE_KEY) === "true";
    setEnabled(stored);
    if (stored) document.body.classList.add("dev-mode");
  }, []);

  // Toggle on ~ key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "`" || e.key === "~") {
        setEnabled((prev) => {
          const next = !prev;
          localStorage.setItem(GOD_MODE_KEY, String(next));
          if (next) {
            document.body.classList.add("dev-mode");
          } else {
            document.body.classList.remove("dev-mode");
          }
          return next;
        });
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(GOD_MODE_KEY, String(next));
      if (next) {
        document.body.classList.add("dev-mode");
      } else {
        document.body.classList.remove("dev-mode");
      }
      return next;
    });
  }, []);

  return { enabled, toggle };
}
