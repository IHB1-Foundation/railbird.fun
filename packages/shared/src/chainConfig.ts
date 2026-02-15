// @playerco/shared - Chain configuration system
// No hardcoded addresses - all values loaded from environment

import {
  type ChainEnv,
  type ChainConfig,
  type Address,
  type ContractAddresses,
  ENV_VARS,
} from "./types.js";

/**
 * Known chain IDs by environment
 */
const CHAIN_IDS: Record<ChainEnv, number> = {
  local: 31337, // Anvil/Hardhat default
  testnet: 10143, // Monad testnet
  mainnet: 10143, // Placeholder - update when mainnet launches
};

/**
 * Block explorer URLs by environment
 */
const BLOCK_EXPLORERS: Record<ChainEnv, string> = {
  local: "http://localhost:8545",
  testnet: "https://testnet.monadexplorer.com",
  mainnet: "https://monadexplorer.com",
};

/**
 * Error thrown when required configuration is missing
 */
export class ChainConfigError extends Error {
  constructor(
    message: string,
    public readonly missingVars?: string[]
  ) {
    super(message);
    this.name = "ChainConfigError";
  }
}

/**
 * Validates that a string is a valid Ethereum address
 */
function isValidAddress(value: string): value is Address {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

/**
 * Gets an environment variable or throws if missing
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new ChainConfigError(`Missing required environment variable: ${name}`, [name]);
  }
  return value;
}

/**
 * Gets an address from environment or throws if missing/invalid
 */
function requireAddress(name: string): Address {
  const value = requireEnv(name);
  if (!isValidAddress(value)) {
    throw new ChainConfigError(
      `Invalid address for ${name}: "${value}" - must be 0x-prefixed 40 hex characters`
    );
  }
  return value;
}

/**
 * Gets an optional address from environment, returns undefined if not set
 */
function optionalAddress(name: string): Address | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  if (!isValidAddress(value)) {
    throw new ChainConfigError(
      `Invalid address for ${name}: "${value}" - must be 0x-prefixed 40 hex characters`
    );
  }
  return value;
}

/**
 * Validates the chain environment value
 */
function parseChainEnv(value: string): ChainEnv {
  if (value === "local" || value === "testnet" || value === "mainnet") {
    return value;
  }
  throw new ChainConfigError(
    `Invalid CHAIN_ENV: "${value}" - must be one of: local, testnet, mainnet`
  );
}

/**
 * Loads all contract addresses from environment variables
 * Throws ChainConfigError if any required address is missing or invalid
 */
function loadContractAddresses(): ContractAddresses {
  const missingVars: string[] = [];
  const addresses: Partial<ContractAddresses> = {};

  // Collect all missing vars first for better error messages
  const addressVars = [
    { key: "pokerTable", env: ENV_VARS.POKER_TABLE_ADDRESS },
    { key: "playerRegistry", env: ENV_VARS.PLAYER_REGISTRY_ADDRESS },
    { key: "playerVault", env: ENV_VARS.PLAYER_VAULT_ADDRESS },
    { key: "vrfAdapter", env: ENV_VARS.VRF_ADAPTER_ADDRESS },
    { key: "nadFunLens", env: ENV_VARS.NADFUN_LENS_ADDRESS },
    { key: "nadFunBondingRouter", env: ENV_VARS.NADFUN_BONDING_ROUTER_ADDRESS },
    { key: "nadFunDexRouter", env: ENV_VARS.NADFUN_DEX_ROUTER_ADDRESS },
    { key: "wmon", env: ENV_VARS.WMON_ADDRESS },
  ] as const;

  for (const { key, env } of addressVars) {
    const value = process.env[env];
    if (!value) {
      missingVars.push(env);
    } else if (!isValidAddress(value)) {
      throw new ChainConfigError(
        `Invalid address for ${env}: "${value}" - must be 0x-prefixed 40 hex characters`
      );
    } else {
      (addresses as Record<string, Address>)[key] = value;
    }
  }

  if (missingVars.length > 0) {
    throw new ChainConfigError(
      `Missing required contract addresses: ${missingVars.join(", ")}`,
      missingVars
    );
  }

  return addresses as ContractAddresses;
}

/**
 * Cached config instance
 */
let cachedConfig: ChainConfig | null = null;

/**
 * Validates VRF adapter configuration for the given environment.
 * On testnet/mainnet, requires VRF_ADAPTER_TYPE=production.
 * On local, any adapter type (or none) is acceptable.
 */
function validateVRFAdapterConfig(env: ChainEnv): void {
  if (env === "local") return;

  const adapterType = process.env[ENV_VARS.VRF_ADAPTER_TYPE];
  if (adapterType !== "production") {
    throw new ChainConfigError(
      `VRF_ADAPTER_TYPE must be "production" for ${env} environment (got: "${adapterType || ""}").\n` +
        `MockVRFAdapter is not allowed on non-local environments.\n` +
        `Deploy ProductionVRFAdapter and set VRF_ADAPTER_TYPE=production.`,
      [ENV_VARS.VRF_ADAPTER_TYPE]
    );
  }
}

/**
 * Loads the chain configuration from environment variables.
 * Throws ChainConfigError if required configuration is missing.
 *
 * Required environment variables:
 * - CHAIN_ENV: "local" | "testnet" | "mainnet"
 * - RPC_URL: The RPC endpoint URL
 * - All contract addresses (see ENV_VARS)
 * - VRF_ADAPTER_TYPE: "production" (required on testnet/mainnet)
 *
 * @param forceReload - If true, ignores cached config and reloads from environment
 * @returns The chain configuration
 * @throws ChainConfigError if configuration is missing or invalid
 */
export function getChainConfig(forceReload = false): ChainConfig {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  const env = parseChainEnv(requireEnv(ENV_VARS.CHAIN_ENV));
  const rpcUrl = requireEnv(ENV_VARS.RPC_URL);
  const contracts = loadContractAddresses();

  // Validate VRF adapter is production-safe for non-local envs
  validateVRFAdapterConfig(env);

  cachedConfig = {
    env,
    chainId: CHAIN_IDS[env],
    rpcUrl,
    blockExplorerUrl: BLOCK_EXPLORERS[env],
    contracts,
  };

  return cachedConfig;
}

/**
 * Validates that all required chain config environment variables are set.
 * Returns a list of missing variables, or an empty array if all are present.
 * Does not throw - useful for startup validation with custom error handling.
 */
export function validateChainConfigEnv(): string[] {
  const missing: string[] = [];

  const requiredVars = [
    ENV_VARS.CHAIN_ENV,
    ENV_VARS.RPC_URL,
    ENV_VARS.POKER_TABLE_ADDRESS,
    ENV_VARS.PLAYER_REGISTRY_ADDRESS,
    ENV_VARS.PLAYER_VAULT_ADDRESS,
    ENV_VARS.VRF_ADAPTER_ADDRESS,
    ENV_VARS.NADFUN_LENS_ADDRESS,
    ENV_VARS.NADFUN_BONDING_ROUTER_ADDRESS,
    ENV_VARS.NADFUN_DEX_ROUTER_ADDRESS,
    ENV_VARS.WMON_ADDRESS,
  ];

  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // VRF_ADAPTER_TYPE is required on non-local environments
  const chainEnv = process.env[ENV_VARS.CHAIN_ENV];
  if (chainEnv && chainEnv !== "local" && !process.env[ENV_VARS.VRF_ADAPTER_TYPE]) {
    missing.push(ENV_VARS.VRF_ADAPTER_TYPE);
  }

  return missing;
}

/**
 * Clears the cached configuration.
 * Useful for testing or when environment variables change.
 */
export function clearChainConfigCache(): void {
  cachedConfig = null;
}

/**
 * Gets a specific contract address from the config.
 * Shorthand for getChainConfig().contracts[name]
 */
export function getContractAddress<K extends keyof ContractAddresses>(
  name: K
): Address {
  return getChainConfig().contracts[name];
}
