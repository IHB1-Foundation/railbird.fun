"use client";

/**
 * InterwovenKit wallet adapter for Railbird.
 *
 * On Initia (NEXT_PUBLIC_CHAIN_ENV=initia-testnet):
 *   IWKBridge (rendered inside InterwovenKitProvider in providers.tsx) calls
 *   useInterwovenKit() and writes the result into a module-level store via
 *   setIWKHandle(). useInitiaWallet() reads the store via useSyncExternalStore
 *   so any component that calls useInterwovenWallet() reacts to IWK state changes.
 *
 * On other chains (local):
 *   Falls back to the EIP-1193 injected provider (MetaMask-compatible).
 */

import { useCallback, useSyncExternalStore } from "react";
import type { useInterwovenKit } from "@initia/interwovenkit-react";

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
// Module-level IWK handle store
// IWKBridge writes here; hooks read via useSyncExternalStore.
// ──────────────────────────────────────────────────────────────────────────

type IWKHandle = ReturnType<typeof useInterwovenKit> | null;

let _iwkHandle: IWKHandle = null;
const _listeners = new Set<() => void>();

/** Called by IWKBridge on every render to keep the store current. */
export function setIWKHandle(handle: IWKHandle): void {
  _iwkHandle = handle;
  _listeners.forEach((fn) => fn());
}

/** Imperative read of the current IWK handle (for non-hook consumers). */
export function getIWKHandle(): IWKHandle {
  return _iwkHandle;
}

function _subscribeIWKHandle(listener: () => void): () => void {
  _listeners.add(listener);
  return () => {
    _listeners.delete(listener);
  };
}

function _getIWKSnapshot(): IWKHandle {
  return _iwkHandle;
}

// ──────────────────────────────────────────────────────────────────────────
// EIP-1193 helpers (non-Initia chains)
// ──────────────────────────────────────────────────────────────────────────

function getEip1193Provider() {
  if (typeof window === "undefined") return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum ?? null;
}

/**
 * Returns the injected EIP-1193 provider for event subscription.
 * On Initia this returns null — InterwovenKit manages wallet state via the
 * modal. For EVM write transactions on the rollup, use getEvmProvider().
 */
export function getInjectedProvider(): EthereumProvider | null {
  if (isInitiaEnv) return null;
  return getEip1193Provider() as EthereumProvider | null;
}

/**
 * Returns the raw EIP-1193 provider for EVM transaction signing.
 * Unlike getInjectedProvider(), this works on Initia too — the Initia
 * MiniEVM rollup is EVM-compatible and the user's MetaMask (or equivalent)
 * signs EVM contract calls after connecting via InterwovenKit's modal.
 *
 * All EVM write-path callers (pokerTableClient, etc.) should use this
 * instead of getInjectedProvider() or window.ethereum directly.
 */
export function getEvmProvider(): EthereumProvider | null {
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

export async function getWalletAccounts(): Promise<WalletAddress[]> {
  return eip1193GetAccounts();
}

export async function requestWalletConnection(): Promise<WalletAddress[]> {
  return eip1193Connect();
}

export async function walletSignMessage(address: string, message: string): Promise<string> {
  return eip1193SignMessage(address, message);
}

// ──────────────────────────────────────────────────────────────────────────
// useEip1193Wallet — non-Initia implementation
// ──────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";

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
// useInitiaWallet — InterwovenKit implementation (Initia)
// Reads from the IWKBridge store via useSyncExternalStore.
// ──────────────────────────────────────────────────────────────────────────

function useInitiaWallet(): UseInterwovenWalletResult {
  const iwk = useSyncExternalStore(_subscribeIWKHandle, _getIWKSnapshot, () => null);

  const connect = useCallback(async () => {
    iwk?.openConnect();
  }, [iwk]);

  const disconnect = useCallback(async () => {
    iwk?.disconnect();
  }, [iwk]);

  const signMessage = useCallback(async (_message: string): Promise<string> => {
    throw new Error("signMessage is not directly available via InterwovenKit.");
  }, []);

  const sendTransaction = useCallback(
    async (params: SendTransactionParams): Promise<`0x${string}`> => {
      if (!iwk) throw new Error("InterwovenKit not initialized.");
      // Route through the IWK sendTransaction added by I0-3.
      // Falls back to throwing until I0-3 wires the EVM path.
      throw new Error(`sendTransaction not yet wired for Initia (to=${params.to}).`);
    },
    [iwk],
  );

  return {
    isConnected: iwk?.isConnected ?? false,
    address: (iwk?.hexAddress ?? null) as WalletAddress | null,
    isLoading: false,
    error: null,
    connect,
    disconnect,
    signMessage,
    sendTransaction,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Public hook — selects implementation based on chain env
// ──────────────────────────────────────────────────────────────────────────

export function useInterwovenWallet(): UseInterwovenWalletResult {
  const eip1193 = useEip1193Wallet();
  const initia = useInitiaWallet();
  return isInitiaEnv ? initia : eip1193;
}
