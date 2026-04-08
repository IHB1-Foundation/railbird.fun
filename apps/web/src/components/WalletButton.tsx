"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { shortenAddress } from "@/lib/utils";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./WalletButton.module.css";

export function WalletButton() {
  const {
    isConnected,
    isAuthenticated,
    address,
    isLoading,
    error,
    connect,
    disconnect,
    authenticate,
  } = useAuth();

  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [displayedError, setDisplayedError] = useState<string | null>(null);

  // Show inline error when error changes
  if (error && error !== displayedError) {
    setDisplayedError(friendlyError(error));
    setErrorVisible(true);
    const timer = setTimeout(() => setErrorVisible(false), 8000);
    // can't cleanup in render, but error will change again if it occurs
  }

  function friendlyError(raw: string): string {
    if (/user rejected|user denied/i.test(raw)) return "Connection cancelled by user.";
    if (/chain|network|mismatch/i.test(raw)) return "Please switch to HashKey Chain Testnet.";
    if (/timeout/i.test(raw)) return "Connection timed out — please try again.";
    return "Wallet error — please try again.";
  }

  const handleDisconnect = () => setShowDisconnectConfirm(true);
  const confirmDisconnect = () => { disconnect(); setShowDisconnectConfirm(false); };

  const errorEl = errorVisible && displayedError ? (
    <span style={{ display: "block", color: "var(--danger)", fontSize: "0.72rem", marginTop: "0.25rem", maxWidth: "180px", textAlign: "right" }}>
      {displayedError}
    </span>
  ) : null;

  // Not connected
  if (!isConnected) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <button
          onClick={connect}
          disabled={isLoading}
          className={styles.walletButton}
          aria-busy={isLoading}
          aria-label={isLoading ? "Connecting wallet…" : "Connect wallet"}
        >
          {isLoading ? "Connecting..." : "Connect Wallet"}
        </button>
        {errorEl}
      </div>
    );
  }

  // Connected but not authenticated
  if (!isAuthenticated) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
        <div className={styles.walletStatus} role="group" aria-label="Wallet status">
          <span className={styles.walletAddress} title={address || undefined} aria-label={`Connected address: ${address || ""}`}>
            {shortenAddress(address || "")}
          </span>
          <button
            onClick={authenticate}
            disabled={isLoading}
            className={`${styles.walletButton} ${styles.sign}`}
            title={error || "Sign to authenticate"}
            aria-busy={isLoading}
            aria-label={isLoading ? "Signing in…" : "Sign in with wallet"}
          >
            {isLoading ? "Signing..." : "Sign In"}
          </button>
          <button
            onClick={handleDisconnect}
            className={`${styles.walletButton} ${styles.disconnect}`}
            aria-label="Disconnect wallet"
          >
            X
          </button>
        </div>
        {errorEl}
        <ConfirmDialog
          open={showDisconnectConfirm}
          title="Disconnect Wallet"
          message="Disconnect wallet? You'll need to reconnect and sign in again."
          confirmLabel="Disconnect"
          cancelLabel="Cancel"
          danger
          onConfirm={confirmDisconnect}
          onCancel={() => setShowDisconnectConfirm(false)}
        />
      </div>
    );
  }

  // Fully authenticated
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <div className={`${styles.walletStatus} ${styles.authenticated}`} role="group" aria-label="Authenticated wallet">
        <span className={styles.walletAddress} title={address || undefined} aria-label={`Signed-in address: ${address || ""}`}>
          {shortenAddress(address || "")}
        </span>
        <span className={styles.authBadge} aria-live="polite">Signed In</span>
        <button
          onClick={handleDisconnect}
          className={`${styles.walletButton} ${styles.disconnect}`}
          aria-label="Sign out and disconnect wallet"
        >
          X
        </button>
      </div>
      {errorEl}
      <ConfirmDialog
        open={showDisconnectConfirm}
        title="Disconnect Wallet"
        message="Disconnect wallet? You'll need to reconnect and sign in again."
        confirmLabel="Disconnect"
        cancelLabel="Cancel"
        danger
        onConfirm={confirmDisconnect}
        onCancel={() => setShowDisconnectConfirm(false)}
      />
    </div>
  );
}
