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
      >
        {isLoading ? "Connecting..." : "Connect Wallet"}
      </button>
    );
  }

  // Connected but not authenticated
  if (!isAuthenticated) {
    return (
      <div className="wallet-status">
        <span className="wallet-address" title={address || undefined}>
          {shortenAddress(address || "")}
        </span>
        <button
          onClick={authenticate}
          disabled={isLoading}
          className="wallet-button sign"
          title={error || "Sign to authenticate"}
        >
          {isLoading ? "Signing..." : "Sign In"}
        </button>
        <button
          onClick={disconnect}
          className="wallet-button disconnect"
          title="Disconnect wallet"
        >
          X
        </button>
      </div>
    );
  }

  // Fully authenticated
  return (
    <div className="wallet-status authenticated">
      <span className="wallet-address" title={address || undefined}>
        {shortenAddress(address || "")}
      </span>
      <span className="auth-badge">Signed In</span>
      <button
        onClick={disconnect}
        className="wallet-button disconnect"
        title="Sign out"
      >
        X
      </button>
    </div>
  );
}
