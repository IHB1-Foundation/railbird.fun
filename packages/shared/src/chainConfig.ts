// @playerco/shared - Chain configuration system
// No hardcoded addresses - all values loaded from environment

import {
  type Address,
  type ChainEnv,
  type ChainConfig,
  type ContractAddresses,
  ENV_VARS,
} from "./types.js";

/**
 * Static chain IDs for known environments.
 * initia-testnet chain ID is dynamic (set via INITIA_CHAIN_ID env var).
 */
const STATIC_CHAIN_IDS: Record<Exclude<ChainEnv, "initia-testnet">, number> = {
  local: 31337, // Anvil/Hardhat default
  testnet: 133, // legacy testnet chain (not active deployment target)
  mainnet: 177, // legacy mainnet chain (not active deployment target)
};

/** Resolves chain ID for the given environment at call time. */
function resolveChainId(env: ChainEnv): number {
  if (env === "initia-testnet") {
    const raw = process.env.INITIA_CHAIN_ID;
    if (!raw) {
      throw new ChainConfigError(
        "INITIA_CHAIN_ID is required when CHAIN_ENV=initia-testnet. " +
          "Set it to your rollup chain ID (see infra/initia/rollup.json).",
        ["INITIA_CHAIN_ID"],
      );
    }
    return parseInt(raw, 10);
  }
  return STATIC_CHAIN_IDS[env];
}

/**
 * Static block explorer URLs for known environments.
 * initia-testnet URL is dynamic (set via INITIA_EXPLORER_URL env var).
 */
const STATIC_BLOCK_EXPLORERS: Record<Exclude<ChainEnv, "initia-testnet">, string> = {
  local: "http://localhost:8545",
  testnet: "https://testnet-explorer.hsk.xyz",
  mainnet: "https://explorer.hsk.xyz",
};

/** Resolves block explorer URL for the given environment at call time. */
function resolveBlockExplorer(env: ChainEnv): string {
  if (env === "initia-testnet") {
    return process.env.INITIA_EXPLORER_URL ?? "https://scan.testnet.initia.xyz";
  }
  return STATIC_BLOCK_EXPLORERS[env];
}

/**
 * Error thrown when required configuration is missing
 */
export class ChainConfigError extends Error {
  constructor(
    message: string,
    public readonly missingVars?: string[],
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
 * Validates the chain environment value
 */
function parseChainEnv(value: string): ChainEnv {
  if (
    value === "local" ||
    value === "testnet" ||
    value === "mainnet" ||
    value === "initia-testnet"
  ) {
    return value;
  }
  throw new ChainConfigError(
    `Invalid CHAIN_ENV: "${value}" - must be one of: local, testnet, mainnet, initia-testnet`,
  );
}

/**
 * Parses a comma-separated list of addresses from an environment variable.
 * Validates each address and returns an array.
 */
function parseAddressList(envName: string, raw: string): Address[] {
  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    throw new ChainConfigError(`${envName} is set but contains no valid addresses`);
  }
  for (const part of parts) {
    if (!isValidAddress(part)) {
      throw new ChainConfigError(
        `Invalid address in ${envName}: "${part}" - must be 0x-prefixed 40 hex characters`,
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
        `Invalid address for ${env}: "${value}" - must be 0x-prefixed 40 hex characters`,
      );
    } else {
      singles[key] = value;
    }
  }

  if (missingVars.length > 0) {
    throw new ChainConfigError(
      `Missing required contract addresses: ${missingVars.join(", ")}`,
      missingVars,
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
      [ENV_VARS.VRF_ADAPTER_TYPE],
    );
  }
}

/**
 * Returns true when the current environment is Initia testnet.
 * Useful for feature-gating Initia-specific behaviour (auto-sign, .init usernames).
 */
export function isInitiaEnv(env: ChainEnv): boolean {
  return env === "initia-testnet";
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

  cachedConfig = Object.freeze({
    env,
    chainId: resolveChainId(env),
    rpcUrl,
    blockExplorerUrl: resolveBlockExplorer(env),
    contracts: Object.freeze({
      ...contracts,
      pokerTables: Object.freeze([...contracts.pokerTables]),
    }),
  }) as ChainConfig;

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

  // VRF_ADAPTER_TYPE is required on non-local environments (including initia-testnet)
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
 * Validates that the chain ID returned by the RPC matches the expected chain ID.
 * Call this at service startup to detect misconfigured RPC_URL / CHAIN_ENV pairs.
 *
 * @throws ChainConfigError with a descriptive message if the IDs do not match.
 */
export async function validateChainIdWithRpc(
  rpcUrl: string,
  expectedChainId: number,
): Promise<void> {
  let rpcChainId: number;

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    if (!response.ok) {
      throw new Error(`RPC returned HTTP ${response.status}`);
    }
    const json = (await response.json()) as { result?: string; error?: unknown };
    if (json.error) {
      throw new Error(`RPC error: ${JSON.stringify(json.error)}`);
    }
    if (typeof json.result !== "string") {
      throw new Error(`Unexpected eth_chainId response: ${JSON.stringify(json)}`);
    }
    rpcChainId = parseInt(json.result, 16);
  } catch (cause) {
    throw new ChainConfigError(
      `Failed to validate chain ID via RPC (${rpcUrl}): ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }

  if (rpcChainId !== expectedChainId) {
    throw new ChainConfigError(
      `CHAIN_ID mismatch: configured CHAIN_ENV expects chain ID ${expectedChainId} ` +
        `but RPC at ${rpcUrl} returned chain ID ${rpcChainId}. ` +
        `Check that RPC_URL and CHAIN_ENV point to the same network.`,
    );
  }
}

/**
 * Gets a specific contract address from the config.
 * Shorthand for getChainConfig().contracts[name]
 */
export function getContractAddress<K extends keyof ContractAddresses>(
  name: K,
): ContractAddresses[K] {
  return getChainConfig().contracts[name];
}
