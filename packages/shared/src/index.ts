// @playerco/shared - Common types, config, and utilities
export const VERSION = "0.0.1";

// Types
export type {
  ChainEnv,
  Address,
  ContractAddresses,
  ChainConfig,
} from "./types.js";

export { ENV_VARS } from "./types.js";

// Chain config
export {
  getChainConfig,
  getContractAddress,
  validateChainConfigEnv,
  clearChainConfigCache,
  ChainConfigError,
} from "./chainConfig.js";
