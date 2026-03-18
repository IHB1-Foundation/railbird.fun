// @playerco/shared - Type definitions

/**
 * Supported chain environments
 */
export type ChainEnv = "local" | "testnet" | "mainnet";

/**
 * Hex address type (0x-prefixed, 42 characters)
 */
export type Address = `0x${string}`;

/**
 * Contract addresses for a specific environment
 */
export interface ContractAddresses {
  // Core protocol contracts (multi-table)
  pokerTables: Address[];
  playerRegistry: Address;
  playerVault: Address;
  vrfAdapter: Address;
}

/**
 * Chain configuration for a specific environment
 */
export interface ChainConfig {
  env: ChainEnv;
  chainId: number;
  rpcUrl: string;
  blockExplorerUrl: string;
  contracts: ContractAddresses;
}

/**
 * Environment variable names for chain config
 */
export const ENV_VARS = {
  CHAIN_ENV: "CHAIN_ENV",
  RPC_URL: "RPC_URL",

  // Contract addresses (comma-separated for multi-table)
  POKER_TABLE_ADDRESSES: "POKER_TABLE_ADDRESSES",
  PLAYER_REGISTRY_ADDRESS: "PLAYER_REGISTRY_ADDRESS",
  PLAYER_VAULT_ADDRESS: "PLAYER_VAULT_ADDRESS",
  VRF_ADAPTER_ADDRESS: "VRF_ADAPTER_ADDRESS",

  // VRF adapter type (must be "production" for testnet/mainnet)
  VRF_ADAPTER_TYPE: "VRF_ADAPTER_TYPE",
} as const;
