// @playerco/shared - Common types, config, and utilities
export const VERSION = "0.0.1";

// Types
export type {
  ChainEnv,
  Address,
  ContractAddresses,
  ChainConfig,
  PersonaId,
  PersonaSummary,
  FleetAgentConfig,
  FleetAgentStatus,
} from "./types.js";

export { ENV_VARS, GameState } from "./types.js";

// Chain config
export {
  getChainConfig,
  getContractAddress,
  validateChainConfigEnv,
  clearChainConfigCache,
  validateChainIdWithRpc,
  isInitiaEnv,
  ChainConfigError,
} from "./chainConfig.js";

// Logger
export { createLogger, getTraceId, withTraceId, traceStorage } from "./logger.js";
export type { LoggerOptions, LogLevel } from "./logger.js";

// Circuit breaker
export { CircuitBreaker, CircuitOpenError } from "./circuitBreaker.js";
export type { CircuitState, CircuitBreakerOptions } from "./circuitBreaker.js";

// Utilities
export { hexToBytes, requireEnv } from "./utils.js";

// Nonce manager
export { NonceManager } from "./nonceManager.js";
export type { NonceManagerOptions } from "./nonceManager.js";

// Health server
export { startHealthServer } from "./healthServer.js";
export type { HealthServerOptions, HealthServer } from "./healthServer.js";

// Prometheus metrics
export {
  registry,
  botActionsTotal,
  botErrorsTotal,
  botCircuitState,
  authAttemptsTotal,
  authRateLimitedTotal,
  indexerBlockLag,
  indexerCursorLag,
  ownerviewJwtActive,
  indexerReorgTotal,
  pgPoolTotalCount,
  pgPoolIdleCount,
  pgPoolWaitingCount,
  fleetAgentRestartsTotal,
  getMetricsText,
  metricsContentType,
} from "./metrics.js";

// Contract ABIs (generated from Foundry artifacts)
export {
  POKER_TABLE_ABI,
  PLAYER_REGISTRY_ABI,
  PLAYER_VAULT_ABI,
  SIDE_BET_POOL_ABI,
} from "./abis/index.js";

// ABI version tracking (N-5)
export { computeAbiHash, logAbiVersions, ABI_HASHES } from "./abiVersion.js";
export type { AbiName } from "./abiVersion.js";

// Agent profiles
export { getAgentProfile } from "./agentProfiles.js";
export type { AgentProfile } from "./agentProfiles.js";

// Env parsing utilities
export {
  validatePrivateKey,
  parseTableAddresses,
  parsePositiveInt,
  optionalEnv,
} from "./envUtils.js";
export type { Hex } from "./envUtils.js";

// HTTP utilities
export { parseAllowedOrigins, createCorsMiddleware } from "./http/cors.js";
export { traceIdMiddleware } from "./http/traceId.js";
export { fetchWithTimeout } from "./http/fetchWithTimeout.js";
export type { FetchWithTimeoutOptions } from "./http/fetchWithTimeout.js";
export { buildOpenApiSpec, validateOpenApiSpec } from "./http/openapi.js";
export type { OpenApiSpec, OpenApiInfo, OpenApiServer } from "./http/openapi.js";

// Chain utilities
export { withRpcRetry } from "./chain/rpcRetry.js";
export type { RpcRetryOptions } from "./chain/rpcRetry.js";

// DB utilities
export { buildPgPoolConfig, pgDeepHealthCheck } from "./db/pool.js";
export type { PgPoolOptions } from "./db/pool.js";

// Initia username resolution
export {
  resolveInitUsername,
  resolveInitUsernames,
  formatInitAddress,
  clearInitUsernameCache,
} from "./initiaUsername.js";

// Observability
export { initSentry } from "./observability/sentry.js";
export type { SentryInitOptions } from "./observability/sentry.js";
export { initTracing } from "./observability/tracing.js";
export type { TracingInitOptions } from "./observability/tracing.js";
