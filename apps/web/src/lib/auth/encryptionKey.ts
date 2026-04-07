/**
 * T3.1: Wallet-Derived Encryption Key Pair
 *
 * Derives a deterministic secp256k1 encryption key pair from a wallet signature.
 * The private key is kept in memory only; the public key may be cached in localStorage.
 *
 * Key derivation (T-R5-02: time-based component prevents indefinite key exposure):
 *   date     = current UTC date (YYYY-MM-DD) — key rotates daily
 *   message  = "Railbird Encryption Key Derivation v1 | {date}"
 *   signature = personal_sign(message, address)
 *   privKey  = keccak256(signature)   // 32 bytes
 *   pubKey   = secp256k1.getPublicKey(privKey, compressed=true)  // 33 bytes
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "./cryptoUtils";

/** Returns current UTC date string for daily key rotation (e.g. "2026-04-07"). */
function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Build the derivation message with a daily time component to limit key exposure window. */
function buildDerivationMessage(): string {
  return `Railbird Encryption Key Derivation v1 | ${utcDateString()}`;
}

/** Rejects after `ms` milliseconds with a timeout error. */
function signTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(() => reject(new Error(`Encryption key derivation timed out after ${ms / 1000}s. Please try again.`)), ms)
  );
}

const SIGN_TIMEOUT_MS = 60_000; // 60 seconds

const PUBKEY_STORAGE_PREFIX = "railbird_encpubkey_";

/** In-memory cache: "{address}:{date}" → { privKey, pubKey } — invalidated on UTC date change. */
const sessionCache = new Map<string, { privKey: Uint8Array; pubKey: Uint8Array }>();

export interface EncryptionKeyPair {
  /** 32-byte private key — never stored outside memory */
  privKey: Uint8Array;
  /** 33-byte compressed secp256k1 public key — safe to store/transmit */
  pubKey: Uint8Array;
}

/**
 * Derive a deterministic encryption key pair by signing a fixed message.
 * The popup appears at most once per session per address.
 *
 * @param address Connected wallet address (lowercase)
 * @param sign Callback that performs personal_sign(message, address)
 */
export async function deriveEncryptionKeyPair(
  address: string,
  sign: (message: string, address: string) => Promise<string>
): Promise<EncryptionKeyPair> {
  const date = utcDateString();
  const cacheKey = `${address.toLowerCase()}:${date}`;

  // Return cached pair if available (avoids repeat signing prompts within same UTC day)
  const cached = sessionCache.get(cacheKey);
  if (cached) return cached;

  // Request wallet signature for key derivation (includes today's date for daily rotation).
  // T-R5-03: Race against a 60-second timeout to avoid infinite wait if user ignores popup.
  const derivationMessage = buildDerivationMessage();
  const signature = await Promise.race([
    sign(derivationMessage, address.toLowerCase()),
    signTimeout(SIGN_TIMEOUT_MS),
  ]);

  // privKey = keccak256(signature bytes)
  const sigBytes = hexToBytes(signature);
  const privKey = keccak_256(sigBytes);

  // Validate: ensure privKey is a valid secp256k1 scalar
  if (!secp256k1.utils.isValidSecretKey(privKey)) {
    // Astronomically unlikely but handle gracefully
    throw new Error("Derived key is not a valid secp256k1 private key — try again");
  }

  const pubKey = secp256k1.getPublicKey(privKey, true); // compressed

  const pair: EncryptionKeyPair = { privKey, pubKey };
  sessionCache.set(cacheKey, pair);

  // Cache pubKey in localStorage (public, safe to persist)
  try {
    localStorage.setItem(
      PUBKEY_STORAGE_PREFIX + address.toLowerCase(),
      bytesToHex(pubKey)
    );
  } catch {
    // localStorage may be unavailable (SSR, private mode) — non-fatal
  }

  return pair;
}

/**
 * Get cached public key from localStorage (avoids prompting for key derivation
 * when pubKey is already known and only on-chain registration is needed).
 *
 * Returns null if not cached.
 */
export function getCachedPubKey(address: string): Uint8Array | null {
  try {
    const hex = localStorage.getItem(PUBKEY_STORAGE_PREFIX + address.toLowerCase());
    if (hex) return hexToBytes(hex);
  } catch {
    // ignore
  }
  return null;
}

/**
 * Clear the in-memory cache for an address (e.g., on wallet disconnect).
 */
export function clearEncryptionKeyCache(address: string): void {
  const prefix = address.toLowerCase() + ":";
  for (const key of sessionCache.keys()) {
    if (key.startsWith(prefix)) sessionCache.delete(key);
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
