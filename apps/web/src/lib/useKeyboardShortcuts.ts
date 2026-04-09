"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

// Keyboard shortcut sequences: g+<key> for navigation, ? for help overlay
// Usage: call useKeyboardShortcuts() once in a client layout or page root.

export function useKeyboardShortcuts() {
  const router = useRouter();
  const buffer: string[] = [];
  let bufferTimer: ReturnType<typeof setTimeout> | null = null;

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      // Skip when focus is inside a text field
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement).isContentEditable) return;

      const key = e.key.toLowerCase();

      // ? — toggle help
      if (key === "?" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Dispatch custom event that the help overlay listens to
        window.dispatchEvent(new CustomEvent("keyboard-help-toggle"));
        return;
      }

      // Accumulate g+<key> chord
      buffer.push(key);
      if (bufferTimer) clearTimeout(bufferTimer);
      bufferTimer = setTimeout(() => { buffer.length = 0; }, 600);

      if (buffer.length === 2 && buffer[0] === "g") {
        const dest = buffer[1];
        buffer.length = 0;
        if (bufferTimer) clearTimeout(bufferTimer);

        switch (dest) {
          case "h": router.push("/"); break;
          case "l": router.push("/live"); break;
          case "b": router.push("/leaderboard"); break;
          case "c": router.push("/create-agent"); break;
          case "e": router.push("/evolution"); break;
          case "m": router.push("/me"); break;
        }
      }
    },
    [router] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);
}
