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
 * testnet: HashKey Chain Testnet (133)
 * mainnet: HashKey Chain Mainnet (177)
 * legacy KAIA: testnet=1001, mainnet=8217 (backward compat — set CHAIN_ID=1001 if needed)
 */
const CHAIN_IDS: Record<ChainEnv, number> = {
  local: 31337, // Anvil/Hardhat default
  testnet: 133, // HashKey Chain Testnet
  mainnet: 177, // HashKey Chain Mainnet
};

/**
 * Block explorer URLs by environment
 */
const BLOCK_EXPLORERS: Record<ChainEnv, string> = {
  local: "http://localhost:8545",
  testnet: "https://testnet-explorer.hsk.xyz",
  mainnet: "https://explorer.hsk.xyz",
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
 * Parses a comma-separated list of addresses from an environment variable.
 * Validates each address and returns an array.
 */
function parseAddressList(envName: string, raw: string): Address[] {
  const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) {
    throw new ChainConfigError(
      `${envName} is set but contains no valid addresses`
    );
  }
  for (const part of parts) {
    if (!isValidAddress(part)) {
      throw new ChainConfigError(
        `Invalid address in ${envName}: "${part}" - must be 0x-prefixed 40 hex characters`
      );
    }
  }
  return parts as Address[];
}

/**
 * Loads all contract addresses from environment variables
 * Throws ChainConfigError if any required address is missing or invalid
 */
function loadContractAddresses(): ContractAddresses {
  const missingVars: string[] = [];

  // Multi-table addresses (comma-separated)
  const tablesRaw = process.env[ENV_VARS.POKER_TABLE_ADDRESSES];
  if (!tablesRaw) {
    missingVars.push(ENV_VARS.POKER_TABLE_ADDRESSES);
  }

  // Single-address fields
  const singleVars = [
    { key: "playerRegistry", env: ENV_VARS.PLAYER_REGISTRY_ADDRESS },
    { key: "playerVault", env: ENV_VARS.PLAYER_VAULT_ADDRESS },
    { key: "vrfAdapter", env: ENV_VARS.VRF_ADAPTER_ADDRESS },
  ] as const;

  const singles: Record<string, Address> = {};
  for (const { key, env } of singleVars) {
    const value = process.env[env];
    if (!value) {
      missingVars.push(env);
    } else if (!isValidAddress(value)) {
      throw new ChainConfigError(
        `Invalid address for ${env}: "${value}" - must be 0x-prefixed 40 hex characters`
      );
    } else {
      singles[key] = value;
    }
  }

  if (missingVars.length > 0) {
    throw new ChainConfigError(
      `Missing required contract addresses: ${missingVars.join(", ")}`,
      missingVars
    );
  }

  return {
    pokerTables: parseAddressList(ENV_VARS.POKER_TABLE_ADDRESSES, tablesRaw!),
    playerRegistry: singles.playerRegistry,
    playerVault: singles.playerVault,
    vrfAdapter: singles.vrfAdapter,
  };
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
    ENV_VARS.POKER_TABLE_ADDRESSES,
    ENV_VARS.PLAYER_REGISTRY_ADDRESS,
    ENV_VARS.PLAYER_VAULT_ADDRESS,
    ENV_VARS.VRF_ADAPTER_ADDRESS,
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
): ContractAddresses[K] {
  return getChainConfig().contracts[name];
}
