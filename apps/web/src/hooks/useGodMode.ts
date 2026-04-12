"use client";

import { useCallback, useEffect, useState } from "react";

const GOD_MODE_KEY = "railbird:god-mode";

/**
 * G-39: God Mode debug overlay toggle.
 * Press `~` (backtick) or enable via settings.
 * Adds .dev-mode class to body when active.
 * No-op in production builds (J-1).
 */
export function useGodMode() {
  // Disabled in production — debug overlays must not ship to prod (J-1)
  const isProduction = process.env.NODE_ENV === "production";
  const [enabled, setEnabled] = useState(false);

  // Sync from localStorage on mount (dev only)
  useEffect(() => {
    if (isProduction) return;
    const stored = localStorage.getItem(GOD_MODE_KEY) === "true";
    setEnabled(stored);
    if (stored) document.body.classList.add("dev-mode");
  }, [isProduction]);

  // Toggle on ~ key (dev only)
  useEffect(() => {
    if (isProduction) return;
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
  }, [isProduction]);

  const toggle = useCallback(() => {
    if (isProduction) return;
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
  }, [isProduction]);

  return { enabled, toggle };
}
