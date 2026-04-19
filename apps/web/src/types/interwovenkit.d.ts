/**
 * Type stubs for @initia/interwovenkit-react.
 * These declarations allow TypeScript to compile before the package is installed.
 * Once `pnpm install` runs with the real package, these will be overridden by the
 * package's own type definitions.
 */
declare module "@initia/interwovenkit-react" {
  import type { ReactNode } from "react";

  export interface InterwovenKitProviderProps {
    chainId: string | number;
    children?: ReactNode;
  }

  export function InterwovenKitProvider(props: InterwovenKitProviderProps): JSX.Element;

  export interface WalletInfo {
    address: string | null;
    isConnected: boolean;
  }

  export interface UseWalletResult extends WalletInfo {
    connect: () => Promise<void>;
    disconnect: () => Promise<void>;
    signMessage: (message: string) => Promise<string>;
    sendTransaction: (params: {
      to: string;
      data?: string;
      value?: bigint;
    }) => Promise<`0x${string}`>;
  }

  export function useWallet(): UseWalletResult;

  export interface AutoSignSession {
    isActive: boolean;
    expiresAt: number | null;
    activate: (durationMs?: number) => Promise<void>;
    revoke: () => Promise<void>;
  }

  export function useAutoSign(allowedMethods?: string[]): AutoSignSession;
}
