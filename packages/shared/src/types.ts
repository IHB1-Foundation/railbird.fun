// @playerco/shared - Type definitions

/**
 * On-chain PokerTable.GameState enum — single source of truth for all services.
 * Values must stay in sync with contracts/src/PokerTable.sol:GameState.
 */
export enum GameState {
  WAITING_FOR_SEATS = 0,
  HAND_INIT = 1,
  BETTING_PRE = 2,
  WAITING_VRF_FLOP = 3,
  BETTING_FLOP = 4,
  WAITING_VRF_TURN = 5,
  BETTING_TURN = 6,
  WAITING_VRF_RIVER = 7,
  BETTING_RIVER = 8,
  SHOWDOWN = 9,
  SETTLED = 10,
  TOURNAMENT_OVER = 11,
  WAITING_VRF_HOLECARDS = 12,
  WAITING_FOR_HOLECARDS = 13,
}

/**
 * Supported chain environments
 */
export type ChainEnv = "local" | "testnet" | "mainnet" | "initia-testnet";

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
 * Supported agent persona identifiers
 */
export type PersonaId = "shark" | "maniac" | "rock" | "adaptive";

/**
 * Lightweight persona summary for web app display
 */
export interface PersonaSummary {
  id: PersonaId;
  name: string;
  emoji: string;
  colorAccent: string;
  aggression: number;
  tightness: number;
  bluffFrequency: number;
}

/**
 * Fleet agent configuration — passed to fleet service when creating an agent.
 */
export interface FleetAgentConfig {
  ownerAddress: string;
  tableAddress: string;
  personaConfig: {
    name: string;
    emoji: string;
    colorAccent: string;
    aggression: number;
    tightness: number;
    bluffFrequency: number;
    positionAwareness: number;
    systemPrompt?: string;
  };
  systemPrompt?: string;
}

/**
 * Fleet agent status returned by fleet API.
 */
export interface FleetAgentStatus {
  agentId: string;
  operatorAddress: string;
  tableAddress: string;
  ownerAddress: string;
  personaName: string;
  personaEmoji: string;
  status: "starting" | "live" | "stopped" | "crashed";
  pid?: number;
  restarts: number;
  createdAt: number;
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
