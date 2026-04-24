"use client";

import { type ReactNode, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { mainnet } from "wagmi/chains";
import { AuthProvider } from "@/lib/auth";
import { ToastProvider } from "@/components/Toast";

const queryClient = new QueryClient();
const wagmiConfig = createConfig({
  chains: [mainnet],
  transports: { [mainnet.id]: http() },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <AuthProvider>
            <ToastProvider>{children}</ToastProvider>
          </AuthProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </Suspense>
  );
}
