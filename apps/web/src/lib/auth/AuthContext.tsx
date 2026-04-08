"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { AuthContextValue, AuthState, HoleCardsResponse } from "./types";
import * as ownerviewApi from "./ownerviewApi";
import { COOKIE_SESSION_ENABLED } from "./ownerviewApi";
import { deriveEncryptionKeyPair, clearEncryptionKeyCache } from "./encryptionKey";

// HashKey Chain Testnet chain ID
const HASHKEY_CHAIN_ID = 133;
const HASHKEY_CHAIN_ID_HEX = "0x85";

// Session storage keys
const STORAGE_KEY_TOKEN = "playerco_auth_token";
const STORAGE_KEY_ADDRESS = "playerco_auth_address";
const STORAGE_KEY_EXPIRES = "playerco_auth_expires";

const initialState: AuthState = {
  isConnected: false,
  isAuthenticated: false,
  address: null,
  token: null,
  isLoading: false,
  error: null,
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Get the MetaMask/EIP-1193 provider (window.ethereum)
 */
function getProvider(): EthereumProvider | null {
  if (typeof window === "undefined") return null;
  return window.ethereum ?? null;
}

/**
 * Check if a wallet provider is available
 */
function hasWallet(): boolean {
  return getProvider() !== null;
}

/**
 * Ensure the wallet is on HashKey Chain Testnet.
 * Attempts to switch chain; if the chain is unknown, adds it first.
 */
async function ensureHashKeyChain(): Promise<void> {
  const provider = getProvider();
  if (!provider) return;

  const chainIdHex = (await provider.request({ method: "eth_chainId" })) as string;
  const chainId = parseInt(chainIdHex, 16);

  if (chainId === HASHKEY_CHAIN_ID) return;

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HASHKEY_CHAIN_ID_HEX }],
    });
  } catch (switchError: unknown) {
    // Chain not added to wallet (error code 4902) — add it
    if (
      typeof switchError === "object" &&
      switchError !== null &&
      "code" in switchError &&
      (switchError as { code: number }).code === 4902
    ) {
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: HASHKEY_CHAIN_ID_HEX,
            chainName: "HashKey Chain Testnet",
            nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
            rpcUrls: ["https://testnet.hsk.xyz"],
            blockExplorerUrls: ["https://testnet-explorer.hsk.xyz"],
          },
        ],
      });
    } else {
      throw new Error("Please switch to HashKey Chain Testnet in your wallet.");
    }
  }
}

/**
 * Get connected accounts from wallet
 */
async function getAccounts(): Promise<string[]> {
  const provider = getProvider();
  if (!provider) return [];
  try {
    const accounts = await provider.request({
      method: "eth_accounts",
    });
    return accounts as string[];
  } catch {
    return [];
  }
}

/**
 * Request wallet connection
 */
async function requestAccounts(): Promise<string[]> {
  const provider = getProvider();
  if (!provider) {
    throw new Error("Wallet not detected. Please install MetaMask.");
  }
  await ensureHashKeyChain();
  const accounts = await provider.request({
    method: "eth_requestAccounts",
  });
  return accounts as string[];
}

/**
 * Sign a message with the wallet
 */
async function signMessage(address: string, message: string): Promise<string> {
  const provider = getProvider();
  if (!provider) {
    throw new Error("Wallet not detected.");
  }
  const signature = await provider.request({
    method: "personal_sign",
    params: [message, address],
  });
  return signature as string;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>(initialState);

  // Check for existing session on mount
  useEffect(() => {
    const checkExistingSession = async () => {
      if (COOKIE_SESSION_ENABLED) {
        // Cookie mode: session is in httpOnly cookie — presence of csrf_token cookie
        // indicates a live session. We can't read the JWT itself.
        const hasCsrf = document.cookie
          .split(";")
          .some((c) => c.trim().startsWith("csrf_token="));

        const accounts = await getAccounts();
        if (hasCsrf && accounts.length > 0) {
          setState({
            isConnected: true,
            isAuthenticated: true,
            address: accounts[0],
            token: null, // token lives in httpOnly cookie
            isLoading: false,
            error: null,
          });
          return;
        }
        if (accounts.length > 0) {
          setState((prev) => ({
            ...prev,
            isConnected: true,
            address: accounts[0],
          }));
        }
        return;
      }

      // Bearer token mode: check sessionStorage
      const storedToken = sessionStorage.getItem(STORAGE_KEY_TOKEN);
      const storedAddress = sessionStorage.getItem(STORAGE_KEY_ADDRESS);
      const storedExpires = sessionStorage.getItem(STORAGE_KEY_EXPIRES);

      // Validate stored session
      if (storedToken && storedAddress && storedExpires) {
        const expiresAt = new Date(storedExpires);
        if (expiresAt > new Date()) {
          // Check if wallet is still connected with same address
          const accounts = await getAccounts();
          if (
            accounts.length > 0 &&
            accounts[0].toLowerCase() === storedAddress.toLowerCase()
          ) {
            setState({
              isConnected: true,
              isAuthenticated: true,
              address: storedAddress,
              token: storedToken,
              isLoading: false,
              error: null,
            });
            return;
          }
        }
        // Clear expired or mismatched session
        sessionStorage.removeItem(STORAGE_KEY_TOKEN);
        sessionStorage.removeItem(STORAGE_KEY_ADDRESS);
        sessionStorage.removeItem(STORAGE_KEY_EXPIRES);
      }

      // Check if wallet is connected (without auth)
      const accounts = await getAccounts();
      if (accounts.length > 0) {
        setState((prev) => ({
          ...prev,
          isConnected: true,
          address: accounts[0],
        }));
      }
    };

    checkExistingSession();

    // Listen for account & chain changes
    const provider = getProvider();
    if (provider) {
      const clearStoredSession = () => {
        if (!COOKIE_SESSION_ENABLED) {
          sessionStorage.removeItem(STORAGE_KEY_TOKEN);
          sessionStorage.removeItem(STORAGE_KEY_ADDRESS);
          sessionStorage.removeItem(STORAGE_KEY_EXPIRES);
        }
      };

      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          clearStoredSession();
          setState(initialState);
        } else {
          clearStoredSession();
          setState({
            isConnected: true,
            isAuthenticated: false,
            address: accounts[0],
            token: null,
            isLoading: false,
            error: null,
          });
        }
      };

      const handleChainChanged = (chainIdHex: string) => {
        const chainId = parseInt(chainIdHex, 16);
        if (chainId !== HASHKEY_CHAIN_ID) {
          clearStoredSession();
          setState({
            ...initialState,
            error: "Please switch to HashKey Chain Testnet.",
          });
        }
      };

      provider.on("accountsChanged", handleAccountsChanged);
      provider.on("chainChanged", handleChainChanged);
      return () => {
        provider.removeListener("accountsChanged", handleAccountsChanged);
        provider.removeListener("chainChanged", handleChainChanged);
      };
    }
  }, []);

  /**
   * Clear the current error state
   */
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  /**
   * Connect wallet
   */
  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // 10-second timeout to prevent hanging on unresponsive wallet providers
      const accounts = await Promise.race<string[]>([
        requestAccounts(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Connection timed out — please try again.")), 10_000)
        ),
      ]);

      if (accounts.length === 0) {
        throw new Error("No accounts available");
      }

      setState({
        isConnected: true,
        isAuthenticated: false,
        address: accounts[0],
        token: null,
        isLoading: false,
        error: null,
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Failed to connect wallet",
      }));
    }
  }, []);

  /**
   * Disconnect and clear session.
   * Client state is always cleared regardless of server logout success.
   */
  const disconnect = useCallback(() => {
    if (state.address) {
      clearEncryptionKeyCache(state.address);
    }

    const clearClientState = () => {
      if (!COOKIE_SESSION_ENABLED) {
        sessionStorage.removeItem(STORAGE_KEY_TOKEN);
        sessionStorage.removeItem(STORAGE_KEY_ADDRESS);
        sessionStorage.removeItem(STORAGE_KEY_EXPIRES);
      }
      setState(initialState);
    };

    if (COOKIE_SESSION_ENABLED) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      fetch(`${process.env.NEXT_PUBLIC_OWNERVIEW_URL || "https://ownerview.railbird.fun"}/auth/logout`, {
        method: "POST",
        credentials: "include",
        signal: controller.signal,
      })
        .catch((err) => {
          console.error("[AuthContext] Server logout failed; client state cleared anyway:", err);
        })
        .finally(() => {
          clearTimeout(timer);
          clearClientState();
        });
    } else {
      clearClientState();
    }
  }, [state.address]);

  /**
   * Authenticate with wallet signature
   */
  const authenticate = useCallback(async () => {
    if (!state.address) {
      throw new Error("Wallet not connected");
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    // Capture address and chainId at start of authentication
    const capturedAddress = state.address;
    const provider = getProvider();
    let capturedChainId: number | null = null;
    if (provider) {
      try {
        const hexId = await provider.request({ method: "eth_chainId" }) as string;
        capturedChainId = parseInt(hexId, 16);
      } catch { /* ignore */ }
    }

    // Listen for account/chain changes during sign flow
    let mismatchDetected = false;
    const handleMidFlowAccountChange = (accounts: string[]) => {
      if (!accounts.length || accounts[0].toLowerCase() !== capturedAddress.toLowerCase()) {
        mismatchDetected = true;
      }
    };
    const handleMidFlowChainChange = (hexId: string) => {
      if (capturedChainId !== null && parseInt(hexId, 16) !== capturedChainId) {
        mismatchDetected = true;
      }
    };
    if (provider) {
      provider.on("accountsChanged", handleMidFlowAccountChange);
      provider.on("chainChanged", handleMidFlowChainChange);
    }

    try {
      // 1. Get nonce from OwnerView
      const { nonce, message } = await ownerviewApi.getNonce(state.address);

      // 2. Guard: verify address/chain haven't changed before signing
      if (mismatchDetected) {
        throw new Error("Chain or account changed during sign-in. Please try again.");
      }

      // 2. Sign the message
      const signature = await signMessage(state.address, message);

      // 3. Guard: verify again after signing (user may have changed mid-sign)
      if (mismatchDetected) {
        throw new Error("Chain or account changed during sign-in. Please try again.");
      }

      // 3. Verify signature and get token
      const verifyResult = await ownerviewApi.verifySignature(
        state.address,
        nonce,
        signature
      );

      if (COOKIE_SESSION_ENABLED) {
        // Cookie mode: token is in httpOnly cookie — don't touch sessionStorage
        setState((prev) => ({
          ...prev,
          isAuthenticated: true,
          token: null, // token lives in httpOnly cookie, not accessible to JS
          isLoading: false,
          error: null,
        }));
      } else {
        // Bearer mode: store token in sessionStorage
        const token = verifyResult.token ?? "";
        const expiresAt = String(verifyResult.expiresAt);
        sessionStorage.setItem(STORAGE_KEY_TOKEN, token);
        sessionStorage.setItem(STORAGE_KEY_ADDRESS, state.address);
        sessionStorage.setItem(STORAGE_KEY_EXPIRES, expiresAt);

        setState((prev) => ({
          ...prev,
          isAuthenticated: true,
          token,
          isLoading: false,
          error: null,
        }));
      }
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Authentication failed",
      }));
    } finally {
      if (provider) {
        provider.removeListener("accountsChanged", handleMidFlowAccountChange);
        provider.removeListener("chainChanged", handleMidFlowChainChange);
      }
    }
  }, [state.address]);

  /**
   * Get hole cards for a specific table/hand.
   * Automatically derives the encryption key pair (prompts wallet once per session)
   * and decrypts the server's encrypted response client-side.
   */
  const getHoleCards = useCallback(
    async (
      tableId: string,
      handId: string
    ): Promise<HoleCardsResponse | null> => {
      // In cookie mode, token is null but session is in httpOnly cookie
      if ((!COOKIE_SESSION_ENABLED && !state.token) || !state.address) {
        return null;
      }
      if (!state.isAuthenticated) return null;

      try {
        // Derive (or retrieve cached) encryption key pair
        const { privKey } = await deriveEncryptionKeyPair(
          state.address,
          (message, address) => signMessage(address, message)
        );

        return await ownerviewApi.getHoleCards(state.token ?? undefined, tableId, handId, privKey);
      } catch {
        // Not owner of any seat, decryption failed, or other error — return null
        return null;
      }
    },
    [state.token, state.address]
  );

  const value: AuthContextValue = {
    ...state,
    connect,
    disconnect,
    authenticate,
    clearError,
    getHoleCards,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Hook to use auth context
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
