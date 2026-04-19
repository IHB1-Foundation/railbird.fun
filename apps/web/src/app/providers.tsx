"use client";

import { type ReactNode, Suspense } from "react";
import { InterwovenKitProvider, TESTNET } from "@initia/interwovenkit-react";
import { IWKBridge } from "@/lib/wallet/IWKBridge";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";

const isInitiaEnv = process.env.NEXT_PUBLIC_CHAIN_ENV === "initia-testnet";

function InitiaProviders({ children }: { children: ReactNode }) {
  if (!isInitiaEnv) return <>{children}</>;

  const chainId = process.env.NEXT_PUBLIC_INTERWOVEN_CHAIN_ID;
  if (!chainId) {
    // Hard misconfiguration: renders a fatal error banner so devs see it immediately
    // instead of silently pointing InterwovenKit at a fictitious chain.
    return (
      <div
        role="alert"
        style={{
          padding: "2rem",
          background: "#fee2e2",
          color: "#991b1b",
          fontFamily: "monospace",
          fontSize: "0.875rem",
        }}
      >
        <strong>Misconfiguration:</strong> NEXT_PUBLIC_INTERWOVEN_CHAIN_ID is not set.
        <br />
        Set it to your Railbird rollup chain ID in <code>.env.local</code>.
      </div>
    );
  }

  return (
    <InterwovenKitProvider {...TESTNET} defaultChainId={chainId}>
      <IWKBridge />
      {children}
    </InterwovenKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <InitiaProviders>
        <AuthProvider>
          <ToastProvider>{children}</ToastProvider>
        </AuthProvider>
      </InitiaProviders>
    </Suspense>
  );
}
