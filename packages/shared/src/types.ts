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
  // Core protocol contracts
  pokerTable: Address;
  playerRegistry: Address;
  playerVault: Address;
  vrfAdapter: Address;

  // nad.fun integration
  nadFunLens: Address;
  nadFunBondingRouter: Address;
  nadFunDexRouter: Address;

  // Token addresses
  wmon: Address; // Wrapped MON
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

  // Contract addresses
  POKER_TABLE_ADDRESS: "POKER_TABLE_ADDRESS",
  PLAYER_REGISTRY_ADDRESS: "PLAYER_REGISTRY_ADDRESS",
  PLAYER_VAULT_ADDRESS: "PLAYER_VAULT_ADDRESS",
  VRF_ADAPTER_ADDRESS: "VRF_ADAPTER_ADDRESS",

  // nad.fun addresses
  NADFUN_LENS_ADDRESS: "NADFUN_LENS_ADDRESS",
  NADFUN_BONDING_ROUTER_ADDRESS: "NADFUN_BONDING_ROUTER_ADDRESS",
  NADFUN_DEX_ROUTER_ADDRESS: "NADFUN_DEX_ROUTER_ADDRESS",

  // Token addresses
  WMON_ADDRESS: "WMON_ADDRESS",
} as const;
