"use client";

import Link from "next/link";
import styles from "./LegalFooter.module.css";

export function LegalFooter() {
  return (
    <footer className={styles.footer}>
      <nav className={styles.links} aria-label="Legal navigation">
        <Link href="/terms">Terms of Service</Link>
        <Link href="/privacy">Privacy Policy</Link>
        <Link href="/disclaimer">Risk Disclaimer</Link>
      </nav>
      <div className={styles.meta}>
        <span>© {new Date().getFullYear()} Railbird</span>
        <span className={styles.testnetBadge}>Testnet Only</span>
      </div>
    </footer>
  );
}
