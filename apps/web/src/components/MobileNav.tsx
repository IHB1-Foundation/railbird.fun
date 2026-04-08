"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "@/app/layout.module.css";

const NAV_LINKS = [
  { href: "/", label: "Tables" },
  { href: "/betting", label: "Rail Bets" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/me", label: "My Agents" },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={styles.hamburger}
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
        aria-expanded={open}
      >
        {open ? "\u2715" : "\u2630"}
      </button>
      <nav className={`${styles.topNav} ${open ? styles.open : ""}`}>
        {NAV_LINKS.map((link) => (
          <Link key={link.href} href={link.href} onClick={() => setOpen(false)}>
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
