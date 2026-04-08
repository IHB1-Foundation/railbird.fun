"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "@/app/layout.module.css";

const NAV_LINKS = [
  { href: "/", label: "Tables" },
  { href: "/betting", label: "Rail Bets" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/me", label: "My Agents" },
];

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname.startsWith(href);
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
      <nav
        className={`${styles.topNav} ${open ? styles.open : ""}`}
        aria-label="Main navigation"
      >
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            onClick={() => setOpen(false)}
            className={isActive(link.href, pathname) ? styles.navLinkActive : ""}
            aria-current={isActive(link.href, pathname) ? "page" : undefined}
          >
            {link.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
