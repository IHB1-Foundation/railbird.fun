"use client";

/**
 * InterwovenKit wallet adapter for Railbird.
 *
 * This module is the single point of integration with @initia/interwovenkit-react.
 * It exposes:
 *   - useInterwovenWallet()    — React hook: connect/disconnect/sign/sendTx
 *   - getWalletAccounts()      — imperative: get current accounts
 *   - requestWalletConnection()— imperative: prompt connection
 *   - walletSignMessage()      — imperative: sign message
 *   - getInjectedProvider()    — EIP-1193 provider for event listeners (non-Initia only)
 *
 * On Initia (NEXT_PUBLIC_CHAIN_ENV=initia-testnet):
 *   Uses InterwovenKit modal and signer.
 *
 * On other chains (HashKey / local):
 *   Falls back to the EIP-1193 injected provider (MetaMask-compatible).
 *
 * All other modules should import from here instead of accessing
 *   the injected provider or InterwovenKit directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { UseWalletResult } from "@initia/interwovenkit-react";

export type WalletAddress = `0x${string}`;

export interface WalletState {
  isConnected: boolean;
  address: WalletAddress | null;
  isLoading: boolean;
  error: string | null;
}

export interface WalletActions {
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
  sendTransaction: (params: SendTransactionParams) => Promise<`0x${string}`>;
}

export interface SendTransactionParams {
  to: WalletAddress;
  data?: `0x${string}`;
  value?: bigint;
}

export type UseInterwovenWalletResult = WalletState & WalletActions;

const isInitiaEnv =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_CHAIN_ENV === "initia-testnet";

// ──────────────────────────────────────────────────────────────────────────
// EIP-1193 helpers
// ──────────────────────────────────────────────────────────────────────────

function getEip1193Provider() {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null;
}

/**
 * Returns the injected EIP-1193 provider for event subscription.
 * On Initia this returns null — InterwovenKit manages wallet state internally.
 */
export function getInjectedProvider(): EthereumProvider | null {
  if (isInitiaEnv) return null;
  return getEip1193Provider() as EthereumProvider | null;
}

async function eip1193SignMessage(address: string, message: string): Promise<string> {
  const provider = getEip1193Provider();
  if (!provider) throw new Error("No wallet provider found.");
  return provider.request({ method: "personal_sign", params: [message, address] });
}

async function eip1193Connect(): Promise<WalletAddress[]> {
  const provider = getEip1193Provider();
  if (!provider)
    throw new Error("No wallet provider found. Install MetaMask or a compatible wallet.");
  return provider.request({ method: "eth_requestAccounts" });
}

async function eip1193GetAccounts(): Promise<WalletAddress[]> {
  const provider = getEip1193Provider();
  if (!provider) return [];
  try {
    return await provider.request({ method: "eth_accounts" });
  } catch {
    return [];
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Exported wallet primitives (usable outside hooks)
// ──────────────────────────────────────────────────────────────────────────

/** Returns currently connected accounts without prompting. */
export async function getWalletAccounts(): Promise<WalletAddress[]> {
  return eip1193GetAccounts();
}

/** Prompts wallet connection and returns the connected addresses. */
export async function requestWalletConnection(): Promise<WalletAddress[]> {
  return eip1193Connect();
}

/** Signs a message with the connected wallet. */
export async function walletSignMessage(address: string, message: string): Promise<string> {
  return eip1193SignMessage(address, message);
}

// ──────────────────────────────────────────────────────────────────────────
// useInterwovenWallet — EIP-1193 implementation (non-Initia)
// ──────────────────────────────────────────────────────────────────────────

function useEip1193Wallet(): UseInterwovenWalletResult {
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    address: null,
    isLoading: false,
    error: null,
  });

  useEffect(() => {
    eip1193GetAccounts().then((accounts) => {
      if (accounts.length > 0) {
        setState((prev) => ({ ...prev, isConnected: true, address: accounts[0] }));
      }
    });
  }, []);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const accounts = await eip1193Connect();
      setState((prev) => ({
        ...prev,
        isConnected: true,
        address: accounts[0] ?? null,
        isLoading: false,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Wallet connection failed.",
      }));
    }
  }, []);

  const disconnect = useCallback(async () => {
    setState({ isConnected: false, address: null, isLoading: false, error: null });
  }, []);

  const signMessage = useCallback(
    async (message: string): Promise<string> => {
      if (!state.address) throw new Error("Wallet not connected.");
      return eip1193SignMessage(state.address, message);
    },
    [state.address],
  );

  const sendTransaction = useCallback(
    async (params: SendTransactionParams): Promise<`0x${string}`> => {
      const provider = getEip1193Provider();
      if (!provider || !state.address) throw new Error("Wallet not connected.");
      return provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: state.address,
            to: params.to,
            data: params.data,
            value: params.value ? `0x${params.value.toString(16)}` : undefined,
          },
        ],
      });
    },
    [state.address],
  );

  return { ...state, connect, disconnect, signMessage, sendTransaction };
}

// ──────────────────────────────────────────────────────────────────────────
// useInterwovenWallet — InterwovenKit implementation (Initia)
// ──────────────────────────────────────────────────────────────────────────

function useInitiaWallet(): UseInterwovenWalletResult {
  const iwkRef = useRef<UseWalletResult | null>(null);
  const [state, setState] = useState<WalletState>({
    isConnected: false,
    address: null,
    isLoading: false,
    error: null,
  });

  // Lazily import and initialize InterwovenKit wallet hook result via a side-effect.
  // The actual hook call happens inside InterwovenKitProvider's subtree — this ref
  // is populated by the IWKBridge component rendered in providers.tsx.
  useEffect(() => {
    const ref = iwkRef.current;
    if (ref) {
      setState({
        isConnected: ref.isConnected,
        address: ref.address as WalletAddress | null,
        isLoading: false,
        error: null,
      });
    }
  }, []);

  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const ref = iwkRef.current;
      if (ref) {
        await ref.connect();
        setState({
          isConnected: ref.isConnected,
          address: ref.address as WalletAddress | null,
          isLoading: false,
          error: null,
        });
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Wallet connection failed.",
      }));
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (iwkRef.current) await iwkRef.current.disconnect();
    setState({ isConnected: false, address: null, isLoading: false, error: null });
  }, []);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    if (!iwkRef.current) throw new Error("InterwovenKit not initialized.");
    return iwkRef.current.signMessage(message);
  }, []);

  const sendTransaction = useCallback(
    async (params: SendTransactionParams): Promise<`0x${string}`> => {
      if (!iwkRef.current) throw new Error("InterwovenKit not initialized.");
      return iwkRef.current.sendTransaction({
        to: params.to,
        data: params.data,
        value: params.value,
      });
    },
    [],
  );

  return { ...state, connect, disconnect, signMessage, sendTransaction };
}

// ──────────────────────────────────────────────────────────────────────────
// Public hook — selects implementation based on chain env
// ──────────────────────────────────────────────────────────────────────────

/**
 * Main wallet hook for Railbird.
 * On Initia: delegates to InterwovenKit.
 * On other chains: delegates to EIP-1193 injected provider.
 */
export function useInterwovenWallet(): UseInterwovenWalletResult {
  const eip1193 = useEip1193Wallet();
  const initia = useInitiaWallet();
  return isInitiaEnv ? initia : eip1193;
}
