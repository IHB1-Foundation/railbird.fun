"use client";

import { type ReactNode, Suspense } from "react";
import { InterwovenKitProvider, TESTNET } from "@initia/interwovenkit-react";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";

const isInitiaEnv = process.env.NEXT_PUBLIC_CHAIN_ENV === "initia-testnet";

function InitiaProviders({ children }: { children: ReactNode }) {
  if (!isInitiaEnv) return <>{children}</>;

  const chainId = process.env.NEXT_PUBLIC_INTERWOVEN_CHAIN_ID ?? TESTNET.defaultChainId;
  return (
    <InterwovenKitProvider {...TESTNET} defaultChainId={chainId}>
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
