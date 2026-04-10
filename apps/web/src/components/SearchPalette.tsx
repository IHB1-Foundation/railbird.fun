"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useScrollLock } from "@/hooks/useScrollLock";
import styles from "./SearchPalette.module.css";

interface SearchItem {
  id: string;
  title: string;
  desc?: string;
  icon: string;
  href: string;
  section: string;
}

const STATIC_ITEMS: SearchItem[] = [
  { id: "home",       title: "Tables",          desc: "Lobby — all poker tables", icon: "🎲", href: "/",             section: "Pages" },
  { id: "live",       title: "Live",            desc: "Watch tables in real time", icon: "🔴", href: "/live",         section: "Pages" },
  { id: "lb",         title: "Leaderboard",     desc: "Agent rankings",            icon: "🏆", href: "/leaderboard",  section: "Pages" },
  { id: "create",     title: "Create Agent",    desc: "Deploy a new AI agent",     icon: "🤖", href: "/create-agent", section: "Pages" },
  { id: "evolution",  title: "Evolution",       desc: "Agent strategy analytics",  icon: "📈", href: "/evolution",    section: "Pages" },
  { id: "bets",       title: "Rail Bets",       desc: "Sidebet on live games",     icon: "💸", href: "/betting",      section: "Pages" },
  { id: "me",         title: "My Agents",       desc: "Agents you own",            icon: "👤", href: "/me",           section: "Pages" },
  { id: "docs",       title: "Developer Docs",  desc: "REST and WS integration",   icon: "🧩", href: "/docs",         section: "Pages" },
  { id: "verify",     title: "Verify",          desc: "Verify hand outcomes (VRF)", icon: "🔒", href: "/verify",      section: "Pages" },
];

function highlight(text: string, query: string): string {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return text.slice(0, idx) + "**" + text.slice(idx, idx + query.length) + "**" + text.slice(idx + query.length);
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const parts = highlight(text, query).split("**");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <mark key={i} style={{ background: "rgba(129,108,249,0.35)", color: "inherit", borderRadius: "2px", padding: "0 1px" }}>{part}</mark> : part
      )}
    </>
  );
}

interface SearchPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function SearchPalette({ open, onClose }: SearchPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  useScrollLock(open); // PD-F5: prevent body scroll when palette is open

  const filtered = STATIC_ITEMS.filter((item) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return item.title.toLowerCase().includes(q) || (item.desc ?? "").toLowerCase().includes(q);
  });

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const navigate = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1)); }
      if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)); }
      if (e.key === "Enter" && filtered[selectedIdx]) { navigate(filtered[selectedIdx].href); }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, filtered, selectedIdx, navigate, onClose]);

  if (!open) return null;

  // Group by section
  const sections: Record<string, SearchItem[]> = {};
  for (const item of filtered) {
    (sections[item.section] ??= []).push(item);
  }

  return (
    <div className={styles.backdrop} onClick={onClose} role="dialog" aria-modal="true" aria-label="Search">
      <div className={styles.palette} onClick={(e) => e.stopPropagation()}>
        {/* Search input */}
        <div className={styles.searchRow}>
          <span className={styles.searchIcon} aria-hidden="true">🔍</span>
          <input
            ref={inputRef}
            type="search"
            className={styles.searchInput}
            placeholder="Search pages, agents…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label="Search"
            aria-autocomplete="list"
          />
          <span className={styles.kbdHint}>ESC</span>
        </div>

        {/* Results */}
        <div className={styles.results} role="listbox">
          {filtered.length === 0 ? (
            <p className={styles.emptyState}>No results for &ldquo;{query}&rdquo;</p>
          ) : (
            Object.entries(sections).map(([section, items]) => (
              <div key={section}>
                <p className={styles.sectionLabel}>{section}</p>
                {items.map((item) => {
                  const idx = filtered.indexOf(item);
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      role="option"
                      aria-selected={idx === selectedIdx}
                      className={`${styles.resultItem}${idx === selectedIdx ? ` ${styles.selected}` : ""}`}
                      onClick={(e) => { e.preventDefault(); navigate(item.href); }}
                    >
                      <span className={styles.resultIcon} aria-hidden="true">{item.icon}</span>
                      <span className={styles.resultBody}>
                        <span className={styles.resultTitle}>
                          <HighlightedText text={item.title} query={query} />
                        </span>
                        {item.desc && (
                          <span className={styles.resultDesc}>
                            <HighlightedText text={item.desc} query={query} />
                          </span>
                        )}
                      </span>
                      <span className={styles.resultArrow} aria-hidden="true">→</span>
                    </a>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className={styles.footer}>
          <span className={styles.footerHint}><span className={styles.kbdKey}>↑↓</span> navigate</span>
          <span className={styles.footerHint}><span className={styles.kbdKey}>↵</span> open</span>
          <span className={styles.footerHint}><span className={styles.kbdKey}>ESC</span> close</span>
        </div>
      </div>
    </div>
  );
}
