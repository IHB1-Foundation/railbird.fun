"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { shortenAddress } from "@/lib/utils";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./WalletButton.module.css";

function friendlyError(raw: string): string {
  if (/user rejected|user denied/i.test(raw)) return "Connection cancelled by user.";
  if (/chain|network|mismatch/i.test(raw)) return "Please switch to HashKey Chain Testnet.";
  if (/timeout/i.test(raw)) return "Connection timed out — please try again.";
  return "Wallet error — please try again.";
}

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
    clearError,
  } = useAuth();

  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [errorVisible, setErrorVisible] = useState(false);
  const [displayedError, setDisplayedError] = useState<string | null>(null);
  const prevErrorRef = useRef<string | null>(null);

  // Show inline error with auto-dismiss inside useEffect (prevents memory leak on unmount)
  useEffect(() => {
    if (error && error !== prevErrorRef.current) {
      prevErrorRef.current = error;
      setDisplayedError(friendlyError(error));
      setErrorVisible(true);
    }
  }, [error]);

  useEffect(() => {
    if (!errorVisible) return;
    const timer = setTimeout(() => setErrorVisible(false), 8000);
    return () => clearTimeout(timer);
  }, [errorVisible, displayedError]);

  const handleConnect = () => {
    clearError();
    setErrorVisible(false);
    connect();
  };
  const handleAuthenticate = () => {
    clearError();
    setErrorVisible(false);
    authenticate();
  };
  const handleDisconnect = () => setShowDisconnectConfirm(true);
  const confirmDisconnect = () => {
    disconnect();
    setShowDisconnectConfirm(false);
  };
  const dismissError = () => setErrorVisible(false);

  const errorEl =
    errorVisible && displayedError ? (
      <span className={styles.errorMessage}>
        {displayedError}
        <button className={styles.errorDismiss} onClick={dismissError} aria-label="Dismiss error">
          ×
        </button>
      </span>
    ) : null;

  // Not connected
  if (!isConnected) {
    return (
      <div className={styles.walletWrapper}>
        <button
          onClick={handleConnect}
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
      <div className={styles.walletWrapper}>
        <div className={styles.walletStatus} role="group" aria-label="Wallet status">
          <span
            className={styles.walletAddress}
            title={address || undefined}
            aria-label={`Connected address: ${address || ""}`}
          >
            {shortenAddress(address || "")}
          </span>
          <button
            onClick={handleAuthenticate}
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
    <div className={styles.walletWrapper}>
      <div
        className={`${styles.walletStatus} ${styles.authenticated}`}
        role="group"
        aria-label="Authenticated wallet"
      >
        <span
          className={styles.walletAddress}
          title={address || undefined}
          aria-label={`Signed-in address: ${address || ""}`}
        >
          {shortenAddress(address || "")}
        </span>
        <span className={styles.authBadge} aria-live="polite">
          Signed In
        </span>
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
