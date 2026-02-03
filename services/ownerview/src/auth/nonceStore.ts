import { randomBytes } from "crypto";
import type { Address } from "@playerco/shared";
import type { NonceRecord } from "./types.js";

/**
 * In-memory nonce store for wallet auth challenges.
 * Production should use Redis or similar for horizontal scaling.
 */
export class NonceStore {
  private nonces = new Map<string, NonceRecord>();
  private ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(ttlMs: number = 5 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Start periodic cleanup of expired nonces
   */
  startCleanup(intervalMs: number = 60_000): void {
    if (this.cleanupInterval) return;
    this.cleanupInterval = setInterval(() => this.cleanup(), intervalMs);
  }

  /**
   * Stop cleanup interval
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Generate a new nonce for the given address
   */
  create(address: Address): string {
    const nonce = randomBytes(32).toString("hex");
    const now = Date.now();

    const record: NonceRecord = {
      nonce,
      address: address.toLowerCase() as Address,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.nonces.set(nonce, record);
    return nonce;
  }

  /**
   * Consume a nonce for the given address.
   * Returns the nonce record if valid, null otherwise.
   * The nonce is deleted after consumption (one-time use).
   */
  consume(nonce: string, address: Address): NonceRecord | null {
    const record = this.nonces.get(nonce);
    if (!record) return null;

    // Always delete the nonce (one-time use)
    this.nonces.delete(nonce);

    // Check expiration
    if (Date.now() > record.expiresAt) return null;

    // Check address match
    if (record.address !== address.toLowerCase()) return null;

    return record;
  }

  /**
   * Get nonce record without consuming it (for testing)
   */
  get(nonce: string): NonceRecord | null {
    const record = this.nonces.get(nonce);
    if (!record) return null;
    if (Date.now() > record.expiresAt) {
      this.nonces.delete(nonce);
      return null;
    }
    return record;
  }

  /**
   * Remove expired nonces
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [nonce, record] of this.nonces) {
      if (now > record.expiresAt) {
        this.nonces.delete(nonce);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Clear all nonces (for testing)
   */
  clear(): void {
    this.nonces.clear();
  }

  /**
   * Get current nonce count (for testing)
   */
  size(): number {
    return this.nonces.size;
  }
}
