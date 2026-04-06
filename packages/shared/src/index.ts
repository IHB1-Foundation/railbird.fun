// @playerco/shared - Common types, config, and utilities
export const VERSION = "0.0.1";

// Types
export type {
  ChainEnv,
  Address,
  ContractAddresses,
  ChainConfig,
} from "./types.js";

export { ENV_VARS, GameState } from "./types.js";

// Chain config
export {
  getChainConfig,
  getContractAddress,
  validateChainConfigEnv,
  clearChainConfigCache,
  ChainConfigError,
} from "./chainConfig.js";

// Logger
export { createLogger } from "./logger.js";
export type { LoggerOptions, LogLevel } from "./logger.js";

// Circuit breaker
export { CircuitBreaker, CircuitOpenError } from "./circuitBreaker.js";
export type { CircuitState, CircuitBreakerOptions } from "./circuitBreaker.js";

// Utilities
export { hexToBytes, fetchWithTimeout } from "./utils.js";

// Nonce manager
export { NonceManager } from "./nonceManager.js";
export type { NonceManagerOptions } from "./nonceManager.js";
