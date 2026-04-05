import { randomBytes } from "crypto";
import type { Address } from "@playerco/shared";
import type { NonceRecord } from "./types.js";

/** Maximum nonces allowed per address at any given time. */
const MAX_PER_ADDRESS = 5;
/** Maximum total nonces across all addresses. */
const MAX_TOTAL = 10_000;

/** Thrown when a nonce creation request is rejected due to rate limits. */
export class NonceRateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NonceRateLimitError";
  }
}

/**
 * In-memory nonce store for wallet auth challenges.
 * Production should use Redis or similar for horizontal scaling.
 */
export class NonceStore {
  private nonces = new Map<string, NonceRecord>();
  /** Maps lowercased address → set of active nonce strings for that address. */
  private perAddressNonces = new Map<string, Set<string>>();
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
   * Generate a new nonce for the given address.
   * Throws NonceRateLimitError if per-address or global limits are exceeded.
   */
  create(address: Address): string {
    const addr = address.toLowerCase();

    // Global limit check
    if (this.nonces.size >= MAX_TOTAL) {
      throw new NonceRateLimitError("Too many pending nonces globally");
    }

    // Per-address limit check
    const existing = this.perAddressNonces.get(addr);
    if (existing && existing.size >= MAX_PER_ADDRESS) {
      throw new NonceRateLimitError(`Too many pending nonces for address ${addr}`);
    }

    const nonce = randomBytes(32).toString("hex");
    const now = Date.now();

    const record: NonceRecord = {
      nonce,
      address: addr as Address,
      createdAt: now,
      expiresAt: now + this.ttlMs,
    };

    this.nonces.set(nonce, record);

    if (!this.perAddressNonces.has(addr)) {
      this.perAddressNonces.set(addr, new Set());
    }
    this.perAddressNonces.get(addr)!.add(nonce);

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
    this._removeFromPerAddress(record.address, nonce);

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
      this._removeFromPerAddress(record.address, nonce);
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
        this._removeFromPerAddress(record.address, nonce);
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
    this.perAddressNonces.clear();
  }

  /**
   * Get current nonce count (for testing)
   */
  size(): number {
    return this.nonces.size;
  }

  /**
   * Get active nonce count for a specific address (for testing)
   */
  countForAddress(address: Address): number {
    return this.perAddressNonces.get(address.toLowerCase())?.size ?? 0;
  }

  private _removeFromPerAddress(address: string, nonce: string): void {
    const set = this.perAddressNonces.get(address.toLowerCase());
    if (set) {
      set.delete(nonce);
      if (set.size === 0) {
        this.perAddressNonces.delete(address.toLowerCase());
      }
    }
  }
}
