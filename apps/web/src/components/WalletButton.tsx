"use client";

import { useAuth } from "@/lib/auth";
import { shortenAddress } from "@/lib/utils";

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

  // Not connected
  if (!isConnected) {
    return (
      <button
        onClick={connect}
        disabled={isLoading}
        className="wallet-button"
        title={error || undefined}
        aria-busy={isLoading}
        aria-label={isLoading ? "Connecting wallet…" : "Connect wallet"}
      >
        {isLoading ? "Connecting..." : "Connect Wallet"}
      </button>
    );
  }

  // Connected but not authenticated
  if (!isAuthenticated) {
    return (
      <div className="wallet-status" role="group" aria-label="Wallet status">
        <span className="wallet-address" title={address || undefined} aria-label={`Connected address: ${address || ""}`}>
          {shortenAddress(address || "")}
        </span>
        <button
          onClick={authenticate}
          disabled={isLoading}
          className="wallet-button sign"
          title={error || "Sign to authenticate"}
          aria-busy={isLoading}
          aria-label={isLoading ? "Signing in…" : "Sign in with wallet"}
        >
          {isLoading ? "Signing..." : "Sign In"}
        </button>
        <button
          onClick={disconnect}
          className="wallet-button disconnect"
          title="Disconnect wallet"
          aria-label="Disconnect wallet"
        >
          X
        </button>
      </div>
    );
  }

  // Fully authenticated
  return (
    <div className="wallet-status authenticated" role="group" aria-label="Authenticated wallet">
      <span className="wallet-address" title={address || undefined} aria-label={`Signed-in address: ${address || ""}`}>
        {shortenAddress(address || "")}
      </span>
      <span className="auth-badge" aria-live="polite">Signed In</span>
      <button
        onClick={disconnect}
        className="wallet-button disconnect"
        title="Sign out"
        aria-label="Sign out and disconnect wallet"
      >
        X
      </button>
    </div>
  );
}
