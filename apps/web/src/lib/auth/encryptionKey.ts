/**
 * T3.1: Wallet-Derived Encryption Key Pair
 *
 * Derives a deterministic secp256k1 encryption key pair from a wallet signature.
 * The private key is kept in memory only; the public key may be cached in localStorage.
 *
 * Key derivation:
 *   message  = "Railbird Encryption Key Derivation v1"
 *   signature = personal_sign(message, address)
 *   privKey  = keccak256(signature)   // 32 bytes
 *   pubKey   = secp256k1.getPublicKey(privKey, compressed=true)  // 33 bytes
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";

const DERIVATION_MESSAGE = "Railbird Encryption Key Derivation v1";
const PUBKEY_STORAGE_PREFIX = "railbird_encpubkey_";

/** In-memory cache: address (lowercase) → { privKey, pubKey } */
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
  const key = address.toLowerCase();

  // Return cached pair if available (avoids repeat signing prompts)
  const cached = sessionCache.get(key);
  if (cached) return cached;

  // Request wallet signature for key derivation
  const signature = await sign(DERIVATION_MESSAGE, key);

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
  sessionCache.set(key, pair);

  // Cache pubKey in localStorage (public, safe to persist)
  try {
    localStorage.setItem(
      PUBKEY_STORAGE_PREFIX + key,
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
  sessionCache.delete(address.toLowerCase());
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return "0x" + Array.from(bytes).map(b => b.toString(16).padStart(2, "0")).join("");
}
