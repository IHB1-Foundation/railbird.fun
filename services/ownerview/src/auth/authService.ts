import type { Address } from "@playerco/shared";
import { NonceStore } from "./nonceStore.js";
import { SessionManager, verifyWalletSignature } from "./session.js";
import type { AuthConfig, SessionPayload } from "./types.js";
import { DEFAULT_AUTH_CONFIG } from "./types.js";

/**
 * Error thrown when authentication fails
 */
export class AuthError extends Error {
  constructor(
    message: string,
    public code:
      | "INVALID_ADDRESS"
      | "INVALID_NONCE"
      | "INVALID_SIGNATURE"
      | "EXPIRED_NONCE"
      | "INVALID_TOKEN"
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Verify result from POST /auth/verify
 */
export interface VerifyResult {
  token: string;
  address: Address;
  expiresAt: number;
}

/**
 * Authentication service combining nonce management and session tokens
 */
export class AuthService {
  private nonceStore: NonceStore;
  private sessionManager: SessionManager;

  constructor(config: Partial<AuthConfig> & { jwtSecret: string }) {
    const fullConfig = { ...DEFAULT_AUTH_CONFIG, ...config };
    this.nonceStore = new NonceStore(fullConfig.nonceTtlMs);
    this.sessionManager = new SessionManager(fullConfig);
  }

  /**
   * Start cleanup intervals
   */
  start(): void {
    this.nonceStore.startCleanup();
  }

  /**
   * Stop cleanup intervals
   */
  stop(): void {
    this.nonceStore.stopCleanup();
  }

  /**
   * Generate a nonce for the given address (GET /auth/nonce)
   */
  getNonce(address: string): { nonce: string; message: string } {
    // Validate address format
    if (!isValidAddress(address)) {
      throw new AuthError("Invalid Ethereum address", "INVALID_ADDRESS");
    }

    const normalizedAddress = address.toLowerCase() as Address;
    const nonce = this.nonceStore.create(normalizedAddress);

    return {
      nonce,
      message: `Sign this message to authenticate with PlayerCo OwnerView.\n\nNonce: ${nonce}`,
    };
  }

  /**
   * Verify signature and issue session token (POST /auth/verify)
   */
  async verify(
    address: string,
    nonce: string,
    signature: string
  ): Promise<VerifyResult> {
    // Validate address format
    if (!isValidAddress(address)) {
      throw new AuthError("Invalid Ethereum address", "INVALID_ADDRESS");
    }

    // Validate signature format
    if (!isValidSignature(signature)) {
      throw new AuthError("Invalid signature format", "INVALID_SIGNATURE");
    }

    const normalizedAddress = address.toLowerCase() as Address;
    const normalizedSignature = signature as `0x${string}`;

    // Consume nonce (one-time use)
    const nonceRecord = this.nonceStore.consume(nonce, normalizedAddress);
    if (!nonceRecord) {
      throw new AuthError(
        "Invalid or expired nonce",
        "INVALID_NONCE"
      );
    }

    // Verify signature
    const isValid = await verifyWalletSignature(
      normalizedAddress,
      nonce,
      normalizedSignature
    );

    if (!isValid) {
      throw new AuthError(
        "Signature verification failed",
        "INVALID_SIGNATURE"
      );
    }

    // Create session token
    const token = await this.sessionManager.createToken(normalizedAddress);
    const payload = await this.sessionManager.verifyToken(token);

    return {
      token,
      address: normalizedAddress,
      expiresAt: payload!.exp * 1000, // Convert to ms
    };
  }

  /**
   * Verify a session token
   */
  async verifySession(token: string): Promise<SessionPayload | null> {
    return this.sessionManager.verifyToken(token);
  }

  /**
   * Clear all nonces (for testing)
   */
  clearNonces(): void {
    this.nonceStore.clear();
  }
}

/**
 * Validate Ethereum address format
 */
function isValidAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validate signature format (0x prefixed hex, 65 bytes = 130 hex chars)
 */
function isValidSignature(signature: string): boolean {
  return /^0x[a-fA-F0-9]{130}$/.test(signature);
}
