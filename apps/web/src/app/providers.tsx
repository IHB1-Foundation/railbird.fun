"use client";

import { type ReactNode, Suspense } from "react";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";

const isInitiaEnv = process.env.NEXT_PUBLIC_CHAIN_ENV === "initia-testnet";

/**
 * InterwovenKit provider wrapper — only rendered on Initia.
 * Dynamically imported so it doesn't bloat the HashKey/local bundle.
 */
function InitiaProviders({ children }: { children: ReactNode }) {
  if (!isInitiaEnv) return <>{children}</>;

  // Dynamic import of InterwovenKit to avoid build failure if package is missing.
  // Once @initia/interwovenkit-react is installed, this renders the full provider.
  const InterwovenKitProviderWrapper = ({ kids }: { kids: ReactNode }) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { InterwovenKitProvider } = require("@initia/interwovenkit-react") as {
        InterwovenKitProvider: React.ComponentType<{
          chainId: string | number;
          children: ReactNode;
        }>;
      };
      const chainId = process.env.NEXT_PUBLIC_INTERWOVEN_CHAIN_ID ?? "7777777";
      return <InterwovenKitProvider chainId={chainId}>{kids}</InterwovenKitProvider>;
    } catch {
      // Package not installed yet — render without provider (dev fallback)
      return <>{kids}</>;
    }
  };

  return <InterwovenKitProviderWrapper kids={children} />;
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
