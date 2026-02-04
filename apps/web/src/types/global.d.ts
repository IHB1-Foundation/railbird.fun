// Global type declarations

type AccountsChangedHandler = (accounts: string[]) => void;

interface EthereumProvider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on(event: "accountsChanged", handler: AccountsChangedHandler): void;
  on(event: "chainChanged", handler: (chainId: string) => void): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  removeListener(event: "accountsChanged", handler: AccountsChangedHandler): void;
  removeListener(event: "chainChanged", handler: (chainId: string) => void): void;
  removeListener(event: string, handler: (...args: unknown[]) => void): void;
  isMetaMask?: boolean;
}

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

export {};
