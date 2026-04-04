/**
 * T3.2: Client-side ECIES Decryption
 *
 * Decrypts ECIES-encrypted hole cards using the player's derived encryption private key.
 * Uses the same scheme as the ownerview dealer service:
 *   secp256k1 ECDH → HKDF-SHA256 → AES-256-GCM
 *
 * Compatible with Chrome 90+, Firefox 90+, Safari 15+ (uses Web Crypto API).
 */

import { secp256k1 } from "@noble/curves/secp256k1.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";

const AES_KEY_LEN = 32; // AES-256
const TAG_LEN = 16;     // AES-GCM authentication tag

/** JSON-serializable encrypted payload (hex strings) */
export interface EncryptedPayloadSerialized {
  ephemeralPubKey: string; // 0x-prefixed hex, 33 bytes compressed
  iv: string;              // 0x-prefixed hex, 12 bytes
  ciphertext: string;      // 0x-prefixed hex
  mac: string;             // 0x-prefixed hex, 16 bytes
}

/**
 * Decrypt ECIES-encrypted hole cards.
 *
 * @param privKey  32-byte secp256k1 private key (from deriveEncryptionKeyPair)
 * @param payload  Encrypted payload from the ownerview API
 * @returns [card1, card2] — card values 0–51
 * @throws DecryptionError if MAC fails, key mismatches, or data is corrupted
 */
export async function decryptHoleCards(
  privKey: Uint8Array,
  payload: EncryptedPayloadSerialized
): Promise<[number, number]> {
  let ephemeralPubKeyBytes: Uint8Array;
  let ivBytes: Uint8Array;
  let ciphertextBytes: Uint8Array;
  let macBytes: Uint8Array;

  try {
    ephemeralPubKeyBytes = hexToBytes(payload.ephemeralPubKey);
    ivBytes = hexToBytes(payload.iv);
    ciphertextBytes = hexToBytes(payload.ciphertext);
    macBytes = hexToBytes(payload.mac);
  } catch {
    throw new DecryptionError("data_corruption", "Failed to parse encrypted payload");
  }

  // ECDH: sharedPoint = privKey * ephemeralPubKey
  let sharedX: Uint8Array;
  try {
    const sharedPoint = secp256k1.getSharedSecret(privKey, ephemeralPubKeyBytes, true);
    sharedX = sharedPoint.slice(1); // x-coordinate only (skip 0x02/0x03 prefix)
  } catch {
    throw new DecryptionError("key_mismatch", "ECDH failed — invalid key or corrupted ephemeral public key");
  }

  // HKDF-SHA256 to derive AES key
  const aesKey = hkdf(sha256, sharedX, undefined, undefined, AES_KEY_LEN);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    aesKey.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );

  // Reconstitute ciphertext || tag for AES-GCM
  const ciphertextWithTag = new Uint8Array(ciphertextBytes.length + macBytes.length);
  ciphertextWithTag.set(ciphertextBytes);
  ciphertextWithTag.set(macBytes, ciphertextBytes.length);

  let decryptedBuf: ArrayBuffer;
  try {
    decryptedBuf = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBytes.buffer as ArrayBuffer, tagLength: TAG_LEN * 8 },
      cryptoKey,
      ciphertextWithTag.buffer as ArrayBuffer
    );
  } catch {
    throw new DecryptionError(
      "mac_failure",
      "AES-GCM decryption failed — wrong key or tampered ciphertext"
    );
  }

  const decrypted = new Uint8Array(decryptedBuf);
  if (decrypted.length !== 2) {
    throw new DecryptionError(
      "data_corruption",
      `Unexpected plaintext length ${decrypted.length} (expected 2)`
    );
  }

  return [decrypted[0], decrypted[1]];
}

export type DecryptionErrorReason = "key_mismatch" | "mac_failure" | "data_corruption";

export class DecryptionError extends Error {
  constructor(
    public readonly reason: DecryptionErrorReason,
    message: string
  ) {
    super(message);
    this.name = "DecryptionError";
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0) throw new Error(`Invalid hex string: ${hex}`);
  const bytes = new Uint8Array(h.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
