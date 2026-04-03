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

    // Listen for account & chain changes
    const provider = getProvider();
    if (provider) {
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

      const handleChainChanged = (chainIdHex: string) => {
        const chainId = parseInt(chainIdHex, 16);
        if (chainId !== HASHKEY_CHAIN_ID) {
          // Wrong network - disconnect and show error
          sessionStorage.removeItem(STORAGE_KEY_TOKEN);
          sessionStorage.removeItem(STORAGE_KEY_ADDRESS);
          sessionStorage.removeItem(STORAGE_KEY_EXPIRES);
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
