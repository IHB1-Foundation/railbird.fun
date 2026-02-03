import type { Address } from "@playerco/shared";

/**
 * Session token payload
 */
export interface SessionPayload {
  /** Wallet address (subject) */
  sub: Address;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
}

/**
 * Nonce record stored in memory
 */
export interface NonceRecord {
  nonce: string;
  address: Address;
  createdAt: number;
  expiresAt: number;
}

/**
 * Auth configuration
 */
export interface AuthConfig {
  /** Nonce TTL in milliseconds (default: 5 minutes) */
  nonceTtlMs: number;
  /** Session TTL in milliseconds (default: 24 hours) */
  sessionTtlMs: number;
  /** JWT secret key (must be at least 32 bytes for HS256) */
  jwtSecret: string;
}

export const DEFAULT_AUTH_CONFIG: Omit<AuthConfig, "jwtSecret"> = {
  nonceTtlMs: 5 * 60 * 1000, // 5 minutes
  sessionTtlMs: 24 * 60 * 60 * 1000, // 24 hours
};
