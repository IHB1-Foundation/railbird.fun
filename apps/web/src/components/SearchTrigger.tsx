"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { SearchPalette } from "./SearchPalette";
import styles from "./SearchTrigger.module.css";

export function SearchTrigger() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  const handleClose = useCallback(() => {
    setOpen(false);
    // Restore focus to trigger button for keyboard users
    triggerRef.current?.focus();
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(true)}
        aria-label="Search (⌘K)"
        title="Search (⌘K)"
        className={styles.searchTrigger}
      >
        <span aria-hidden="true">🔍</span>
        <span>Search</span>
        <span className={styles.kbdHint}>⌘K</span>
      </button>
      <SearchPalette open={open} onClose={handleClose} />
    </>
  );
}
