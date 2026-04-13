import { randomBytes } from "crypto";
import { readFileSync, writeFile } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
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
 *
 * When `persistPath` is provided, nonce state is persisted to a JSON file
 * so pending challenges survive service restarts within their TTL window.
 */
export class NonceStore {
  private nonces = new Map<string, NonceRecord>();
  /** Maps lowercased address → set of active nonce strings for that address. */
  private perAddressNonces = new Map<string, Set<string>>();
  private ttlMs: number;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private readonly persistPath: string | null;
  private persistPending = false;

  constructor(ttlMs: number = 5 * 60 * 1000, persistPath?: string) {
    this.ttlMs = ttlMs;
    this.persistPath = persistPath ?? null;

    if (this.persistPath) {
      this._loadSync();
    }
  }

  /**
   * Async init: ensure the persistence directory exists.
   * Call this after construction when a persistPath is provided.
   */
  async init(): Promise<void> {
    if (this.persistPath) {
      await mkdir(dirname(this.persistPath), { recursive: true });
    }
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

    this._schedulePersist();
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
    this._schedulePersist();

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
      this._schedulePersist();
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
    if (removed > 0) this._schedulePersist();
    return removed;
  }

  /**
   * Clear all nonces (for testing)
   */
  clear(): void {
    this.nonces.clear();
    this.perAddressNonces.clear();
    this._schedulePersist();
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

  /** Load nonces from disk synchronously (called during constructor). */
  private _loadSync(): void {
    try {
      const raw = readFileSync(this.persistPath!, "utf-8");
      const records = JSON.parse(raw) as NonceRecord[];
      const now = Date.now();
      for (const record of records) {
        // Skip already-expired nonces
        if (record.expiresAt <= now) continue;
        this.nonces.set(record.nonce, record);
        const addr = record.address.toLowerCase();
        if (!this.perAddressNonces.has(addr)) {
          this.perAddressNonces.set(addr, new Set());
        }
        this.perAddressNonces.get(addr)!.add(record.nonce);
      }
    } catch {
      // File missing or corrupt — start fresh
    }
  }

  /**
   * Debounced async persist: coalesces multiple rapid mutations into one
   * write. Best-effort — a crash between write and flush is acceptable
   * (users re-request a new nonce on next visit).
   */
  private _schedulePersist(): void {
    if (!this.persistPath || this.persistPending) return;
    this.persistPending = true;
    setImmediate(() => {
      this.persistPending = false;
      const records = Array.from(this.nonces.values());
      writeFile(this.persistPath!, JSON.stringify(records), "utf-8", () => {
        // Best-effort: ignore write errors
      });
    });
  }
}
