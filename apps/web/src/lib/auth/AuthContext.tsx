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
 * Check if window.ethereum is available
 */
function hasEthereum(): boolean {
  return typeof window !== "undefined" && typeof window.ethereum !== "undefined";
}

/**
 * Get connected accounts from wallet
 */
async function getAccounts(): Promise<string[]> {
  if (!hasEthereum()) return [];
  try {
    const accounts = await window.ethereum!.request({
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
  if (!hasEthereum()) {
    throw new Error("No Ethereum wallet detected. Please install MetaMask.");
  }
  const accounts = await window.ethereum!.request({
    method: "eth_requestAccounts",
  });
  return accounts as string[];
}

/**
 * Sign a message with the wallet
 */
async function signMessage(address: string, message: string): Promise<string> {
  if (!hasEthereum()) {
    throw new Error("No Ethereum wallet detected");
  }
  const signature = await window.ethereum!.request({
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
      // Check for stored session
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

    // Listen for account changes
    if (hasEthereum()) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length === 0) {
          // Disconnected
          sessionStorage.removeItem(STORAGE_KEY_TOKEN);
          sessionStorage.removeItem(STORAGE_KEY_ADDRESS);
          sessionStorage.removeItem(STORAGE_KEY_EXPIRES);
          setState(initialState);
        } else {
          // Account changed - clear auth, keep connection
          sessionStorage.removeItem(STORAGE_KEY_TOKEN);
          sessionStorage.removeItem(STORAGE_KEY_ADDRESS);
          sessionStorage.removeItem(STORAGE_KEY_EXPIRES);
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

      window.ethereum!.on("accountsChanged", handleAccountsChanged);
      return () => {
        window.ethereum!.removeListener(
          "accountsChanged",
          handleAccountsChanged
        );
      };
    }
  }, []);

  /**
   * Connect wallet
   */
  const connect = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const accounts = await requestAccounts();
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
   * Disconnect and clear session
   */
  const disconnect = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(STORAGE_KEY_ADDRESS);
    sessionStorage.removeItem(STORAGE_KEY_EXPIRES);
    setState(initialState);
  }, []);

  /**
   * Authenticate with wallet signature
   */
  const authenticate = useCallback(async () => {
    if (!state.address) {
      throw new Error("Wallet not connected");
    }

    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      // 1. Get nonce from OwnerView
      const { nonce, message } = await ownerviewApi.getNonce(state.address);

      // 2. Sign the message
      const signature = await signMessage(state.address, message);

      // 3. Verify signature and get token
      const { token, expiresAt } = await ownerviewApi.verifySignature(
        state.address,
        nonce,
        signature
      );

      // 4. Store session
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
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : "Authentication failed",
      }));
    }
  }, [state.address]);

  /**
   * Get hole cards for a specific table/hand
   */
  const getHoleCards = useCallback(
    async (
      tableId: string,
      handId: string
    ): Promise<HoleCardsResponse | null> => {
      if (!state.token) {
        return null;
      }

      try {
        return await ownerviewApi.getHoleCards(state.token, tableId, handId);
      } catch {
        // Not owner of any seat or other error - return null
        return null;
      }
    },
    [state.token]
  );

  const value: AuthContextValue = {
    ...state,
    connect,
    disconnect,
    authenticate,
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
