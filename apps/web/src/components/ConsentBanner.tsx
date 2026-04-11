"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./ConsentBanner.module.css";

const CONSENT_KEY = "consentAcceptedAt";

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) {
      setVisible(true);
    }
  }, []);

  function handleAccept() {
    localStorage.setItem(CONSENT_KEY, new Date().toISOString());
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className={styles.banner} role="dialog" aria-label="Terms consent">
      <p className={styles.text}>
        By using Railbird you agree to our{" "}
        <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
        This is experimental software on testnet — use at your own risk.
      </p>
      <button className={styles.btn} onClick={handleAccept}>
        I understand
      </button>
    </div>
  );
}
