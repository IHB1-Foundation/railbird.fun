"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/app/layout.module.css";

// Primary links — core user journey (Watch → Bet → Create)
const NAV_PRIMARY = [
  { href: "/", label: "Lobby" },
  { href: "/live", label: "LIVE 🔴" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/betting", label: "Bet" },
];

// Secondary links — power-user features
const NAV_SECONDARY = [
  { href: "/create-agent", label: "Create Agent" },
  { href: "/me", label: "My Agents" },
  { href: "/evolution", label: "AI Evolution" },
  { href: "/verify", label: "Verify" },
  { href: "/docs", label: "Docs" },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const firstLinkRef = useRef<HTMLAnchorElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  // Focus trap: focus first link when drawer opens
  useEffect(() => {
    if (open) {
      firstLinkRef.current?.focus();
    }
  }, [open]);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        setOpen(false);
        hamburgerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const close = () => {
    setOpen(false);
    hamburgerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={hamburgerRef}
        className={styles.hamburger}
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls="mobile-nav-drawer"
      >
        {"\u2630"}
      </button>

      {/* Desktop nav */}
      <nav className={styles.topNav} aria-label="Main navigation">
        {NAV_PRIMARY.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={isActive(link.href, pathname) ? styles.navLinkActive : ""}
            aria-current={isActive(link.href, pathname) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
        <span className={styles.navDivider} aria-hidden="true" />
        {NAV_SECONDARY.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`${styles.navSecondary} ${isActive(link.href, pathname) ? styles.navLinkActive : ""}`}
            aria-current={isActive(link.href, pathname) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>

      {/* Mobile backdrop */}
      <div
        className={`${styles.mobileBackdrop} ${open ? styles.visible : ""}`}
        onClick={close}
        aria-hidden="true"
      />

      {/* Mobile drawer */}
      <nav
        id="mobile-nav-drawer"
        className={`${styles.mobileDrawer} ${open ? styles.open : ""}`}
        aria-label="Mobile navigation"
        aria-hidden={!open}
      >
        <button className={styles.mobileDrawerClose} onClick={close} aria-label="Close navigation">
          ✕
        </button>
        {NAV_PRIMARY.map((link, i) => (
          <Link
            key={link.href}
            href={link.href}
            ref={i === 0 ? firstLinkRef : undefined}
            onClick={close}
            tabIndex={open ? 0 : -1}
            className={isActive(link.href, pathname) ? styles.navLinkActive : ""}
            aria-current={isActive(link.href, pathname) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
        <div className={styles.mobileNavDivider} aria-hidden="true" />
        {NAV_SECONDARY.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={close}
            tabIndex={open ? 0 : -1}
            className={`${styles.mobileNavSecondary} ${isActive(link.href, pathname) ? styles.navLinkActive : ""}`}
            aria-current={isActive(link.href, pathname) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
